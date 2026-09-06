import type { OnboardingTechStack } from "../types";
import { fetchRepositoryFile } from "./githubRepo";

/**
 * Repository-analysis tech-stack detector (admin_workflow.txt Step 3:
 * "Inspect dependency files -> Inspect configuration -> Detect languages
 * -> Detect frameworks -> Detect libraries -> Detect databases where
 * reliably identifiable -> Normalize technologies -> Return Tech Stack").
 *
 * Everything returned here is derived from something actually present in
 * the repository (a manifest file, a lockfile, GitHub's own language
 * byte-counts) — never a guess (Backend_Development_Rules.txt rule 37/38:
 * never fake metrics/data). An ecosystem this detector doesn't recognize
 * simply contributes nothing rather than a wrong guess; the admin can
 * still add/correct entries client-side per the spec ("the Admin should
 * be able to review and correct detected values").
 *
 * Display names match devtunnel-frontend/src/lib/onboarding/tech-catalog.ts
 * exactly (e.g. "Node.js", "Next.js", "Tailwind CSS") so a detected value
 * lines up with that catalog's own naming if the frontend ever cross-
 * references it.
 */

type Bucket = "frontend" | "backend" | "frameworks" | "databases" | "libraries" | "buildTools";

interface PackageMapping {
  name: string;
  bucket: Bucket;
}

/**
 * Node/npm dependency name -> canonical display name + category. Keys are
 * matched case-sensitively against `package.json` dependency keys, which
 * are themselves case-sensitive on npm.
 */
const NPM_PACKAGE_MAP: Record<string, PackageMapping> = {
  react: { name: "React", bucket: "frontend" },
  "react-dom": { name: "React", bucket: "frontend" },
  vue: { name: "Vue.js", bucket: "frontend" },
  "@angular/core": { name: "Angular", bucket: "frontend" },
  svelte: { name: "Svelte", bucket: "frontend" },
  next: { name: "Next.js", bucket: "frontend" },
  nuxt: { name: "Nuxt", bucket: "frontend" },
  tailwindcss: { name: "Tailwind CSS", bucket: "frontend" },
  "solid-js": { name: "SolidJS", bucket: "frontend" },

  express: { name: "Express", bucket: "backend" },
  fastify: { name: "Fastify", bucket: "backend" },
  koa: { name: "Koa", bucket: "backend" },
  "@nestjs/core": { name: "NestJS", bucket: "backend" },
  hono: { name: "Hono", bucket: "backend" },
  "hapi": { name: "hapi", bucket: "backend" },

  graphql: { name: "GraphQL", bucket: "frameworks" },
  "apollo-server": { name: "Apollo Server", bucket: "frameworks" },
  "@trpc/server": { name: "tRPC", bucket: "frameworks" },
  electron: { name: "Electron", bucket: "frameworks" },

  pg: { name: "PostgreSQL", bucket: "databases" },
  postgres: { name: "PostgreSQL", bucket: "databases" },
  mysql: { name: "MySQL", bucket: "databases" },
  mysql2: { name: "MySQL", bucket: "databases" },
  mongodb: { name: "MongoDB", bucket: "databases" },
  mongoose: { name: "MongoDB", bucket: "databases" },
  redis: { name: "Redis", bucket: "databases" },
  ioredis: { name: "Redis", bucket: "databases" },
  sqlite3: { name: "SQLite", bucket: "databases" },
  "better-sqlite3": { name: "SQLite", bucket: "databases" },
  "@supabase/supabase-js": { name: "Supabase", bucket: "databases" },

  prisma: { name: "Prisma", bucket: "libraries" },
  "@prisma/client": { name: "Prisma", bucket: "libraries" },
  sequelize: { name: "Sequelize", bucket: "libraries" },
  typeorm: { name: "TypeORM", bucket: "libraries" },
  lodash: { name: "Lodash", bucket: "libraries" },
  axios: { name: "Axios", bucket: "libraries" },
  zod: { name: "Zod", bucket: "libraries" },
  redux: { name: "Redux", bucket: "libraries" },
  "@reduxjs/toolkit": { name: "Redux", bucket: "libraries" },
  jest: { name: "Jest", bucket: "libraries" },
  vitest: { name: "Vitest", bucket: "libraries" },
  mocha: { name: "Mocha", bucket: "libraries" },
  cypress: { name: "Cypress", bucket: "libraries" },
  playwright: { name: "Playwright", bucket: "libraries" },
  "@playwright/test": { name: "Playwright", bucket: "libraries" },

  vite: { name: "Vite", bucket: "buildTools" },
  webpack: { name: "Webpack", bucket: "buildTools" },
  rollup: { name: "Rollup", bucket: "buildTools" },
  esbuild: { name: "esbuild", bucket: "buildTools" },
  parcel: { name: "Parcel", bucket: "buildTools" },
  gulp: { name: "Gulp", bucket: "buildTools" },
  grunt: { name: "Grunt", bucket: "buildTools" },
  turbo: { name: "Turborepo", bucket: "buildTools" },
  nx: { name: "Nx", bucket: "buildTools" },
  typescript: { name: "TypeScript", bucket: "buildTools" },
};

function emptyStack(): OnboardingTechStack {
  return {
    languages: [],
    frontend: [],
    backend: [],
    frameworks: [],
    databases: [],
    libraries: [],
    buildTools: [],
    packageManager: null,
  };
}

function addUnique(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value);
}

/**
 * Language names GitHub's `/languages` endpoint reports that are really
 * build/config artifacts rather than a "language" an admin would expect
 * in that field — routed to `buildTools` instead of `languages`.
 */
const NON_LANGUAGE_BYTES = new Set(["Dockerfile", "Makefile", "Shell", "Procfile", "HCL"]);

/**
 * Applies GitHub's `/languages` byte breakdown to the stack (Step 1/3
 * algorithm: "Fetch repository language"). Takes the top entries by byte
 * count so a handful of generated/vendored files in an unrelated language
 * don't drown out the repository's actual primary languages.
 */
export function applyLanguageBytes(stack: OnboardingTechStack, languageBytes: Record<string, number>): void {
  const sorted = Object.entries(languageBytes).sort(([, a], [, b]) => b - a);
  for (const [language, bytes] of sorted.slice(0, 8)) {
    if (bytes <= 0) continue;
    if (NON_LANGUAGE_BYTES.has(language)) {
      addUnique(stack.buildTools, language);
    } else {
      addUnique(stack.languages, language);
    }
  }
}

function applyPackageJson(stack: OnboardingTechStack, raw: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return; // Malformed manifest — skip rather than fail the whole detection pass.
  }
  if (!parsed || typeof parsed !== "object") return;

  const deps: Record<string, unknown> = {
    ...(((parsed as Record<string, unknown>).dependencies as Record<string, unknown>) ?? {}),
    ...(((parsed as Record<string, unknown>).devDependencies as Record<string, unknown>) ?? {}),
  };

  for (const depName of Object.keys(deps)) {
    const mapping = NPM_PACKAGE_MAP[depName];
    if (!mapping) continue;
    addUnique(stack[mapping.bucket], mapping.name);
  }
}

/**
 * Fetches and inspects a fixed set of well-known manifest/lockfiles in
 * parallel (Step 3 algorithm: "Inspect dependency files" / "Inspect
 * configuration"). Files that don't exist in the repository simply
 * resolve to `null` (src/lib/githubRepo.ts `fetchRepositoryFile`) and
 * contribute nothing — this never treats a 404 as an error
 * (Backend_Development_Rules.txt rule 51: external/expected-absent
 * responses are handled, not escalated to a failure).
 */
export async function detectTechStack(
  accessToken: string | null,
  owner: string,
  repo: string,
  defaultBranch: string,
  primaryLanguage: string | null,
  languageBytes: Record<string, number>,
): Promise<OnboardingTechStack> {
  const stack = emptyStack();
  applyLanguageBytes(stack, languageBytes);
  if (stack.languages.length === 0 && primaryLanguage) {
    stack.languages.push(primaryLanguage);
  }

  const manifestPaths = [
    "package.json",
    "requirements.txt",
    "pyproject.toml",
    "Pipfile",
    "go.mod",
    "Cargo.toml",
    "Gemfile",
    "composer.json",
    "pom.xml",
    "build.gradle",
  ] as const;

  const lockfilePaths: Array<{ path: string; packageManager: string }> = [
    { path: "pnpm-lock.yaml", packageManager: "pnpm" },
    { path: "yarn.lock", packageManager: "Yarn" },
    { path: "bun.lockb", packageManager: "Bun" },
    { path: "package-lock.json", packageManager: "npm" },
    { path: "poetry.lock", packageManager: "Poetry" },
    { path: "Pipfile.lock", packageManager: "Pipenv" },
    { path: "requirements.txt", packageManager: "pip" },
    { path: "Cargo.lock", packageManager: "Cargo" },
    { path: "go.sum", packageManager: "Go Modules" },
    { path: "Gemfile.lock", packageManager: "Bundler" },
    { path: "composer.lock", packageManager: "Composer" },
  ];

  const [manifestResults, lockfileResults] = await Promise.all([
    Promise.allSettled(
      manifestPaths.map((path) => fetchRepositoryFile(accessToken, owner, repo, path, defaultBranch)),
    ),
    Promise.allSettled(
      lockfilePaths.map(({ path }) => fetchRepositoryFile(accessToken, owner, repo, path, defaultBranch)),
    ),
  ]);

  manifestResults.forEach((result, index) => {
    if (result.status !== "fulfilled" || result.value === null) return;
    const path = manifestPaths[index];
    if (path === "package.json") {
      applyPackageJson(stack, result.value);
      return;
    }
    // Non-npm ecosystems: presence of the manifest itself is the signal
    // (parsing every ecosystem's own dependency syntax is out of scope
    // for a "reliably identifiable" pass — rule 37 favors a smaller set
    // of trustworthy facts over a larger set of shaky guesses).
    switch (path) {
      case "requirements.txt":
      case "pyproject.toml":
      case "Pipfile":
        addUnique(stack.languages, "Python");
        break;
      case "go.mod":
        addUnique(stack.languages, "Go");
        break;
      case "Cargo.toml":
        addUnique(stack.languages, "Rust");
        break;
      case "Gemfile":
        addUnique(stack.languages, "Ruby");
        break;
      case "composer.json":
        addUnique(stack.languages, "PHP");
        break;
      case "pom.xml":
      case "build.gradle":
        addUnique(stack.languages, "Java");
        break;
    }
  });

  for (let i = 0; i < lockfileResults.length; i++) {
    const result = lockfileResults[i];
    if (result?.status === "fulfilled" && result.value !== null) {
      stack.packageManager = lockfilePaths[i]!.packageManager;
      break;
    }
  }

  return stack;
}