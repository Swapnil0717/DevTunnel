import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * `dev test` operates on whatever repo the contributor is sitting in
 * (whatever `dev start` cloned) — a completely arbitrary open-source
 * project, not DevTunnel's own codebase. It has no idea up front whether
 * that's a single Node package, a Python project, or (very commonly for
 * real-world contribution targets) a monorepo with a `backend/` and a
 * `frontend/` folder that each need their own install/test/build run —
 * which is exactly DevTunnel's own repo shape, incidentally.
 *
 * This module's job is purely detection: walk the repo, find every
 * directory that looks like the root of a buildable/testable package,
 * and work out what "test" and "compile/build" mean for it. Running
 * those commands (and running several of them concurrently) is
 * `lib/processRunner.ts` / `commands/test.ts`'s job, not this file's.
 */

/** Directories never worth descending into — dependency trees, build output, VCS internals. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  "target",
  "vendor",
  ".venv",
  "venv",
  "__pycache__",
  ".turbo",
  ".cache",
  "coverage",
]);

/** How many directories deep under the repo root to look for a nested package (e.g. `devtunnel-backend/`). Deep enough for a typical monorepo, shallow enough to stay fast. */
const MAX_DEPTH = 3;

export type Ecosystem = "node" | "python" | "rust" | "go" | "ruby" | "java";

export interface TestStep {
  /** Short label shown in output — "install", "typecheck", "test", "build", "compile". */
  label: string;
  command: string;
  args: string[];
}

export interface DetectedProject {
  /** Human-readable name for prefixed output — the directory name, or "root" for the repo root itself. */
  name: string;
  dir: string;
  ecosystem: Ecosystem;
  steps: TestStep[];
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function npmClientFor(dir: string): { bin: string; run: (script: string) => TestStep } {
  const isWin = process.platform === "win32";
  let bin = isWin ? "npm.cmd" : "npm";
  let runPrefix = ["run"];
  if (existsSync(join(dir, "pnpm-lock.yaml"))) {
    bin = isWin ? "pnpm.cmd" : "pnpm";
    runPrefix = ["run"];
  } else if (existsSync(join(dir, "yarn.lock"))) {
    bin = isWin ? "yarn.cmd" : "yarn";
    runPrefix = [];
  }
  return {
    bin,
    run: (script: string): TestStep => ({
      label: script,
      command: bin,
      args: [...runPrefix, script],
    }),
  };
}

function detectNode(dir: string, name: string): DetectedProject | null {
  const pkgPath = join(dir, "package.json");
  const pkg = readJson(pkgPath);
  if (!pkg) return null;

  const scripts = (pkg.scripts as Record<string, string> | undefined) ?? {};
  const { bin, run } = npmClientFor(dir);
  const isWin = process.platform === "win32";
  const steps: TestStep[] = [];

  const hasLockfile =
    existsSync(join(dir, "package-lock.json")) ||
    existsSync(join(dir, "pnpm-lock.yaml")) ||
    existsSync(join(dir, "yarn.lock"));
  if (!existsSync(join(dir, "node_modules"))) {
    steps.push(
      bin.startsWith("npm") && hasLockfile
        ? { label: "install", command: bin, args: ["ci"] }
        : { label: "install", command: bin, args: ["install"] },
    );
  }

  // "Compiling" — a typecheck script if the project defines one,
  // otherwise a raw `tsc --noEmit` when there's a tsconfig to check
  // against. Never both: a project that already has its own typecheck
  // script knows its own compile step better than a generic `tsc` guess.
  if (typeof scripts.typecheck === "string") {
    steps.push(run("typecheck"));
  } else if (existsSync(join(dir, "tsconfig.json"))) {
    steps.push({
      label: "typecheck",
      command: isWin ? "npx.cmd" : "npx",
      args: ["tsc", "--noEmit"],
    });
  }

  if (typeof scripts.test === "string") {
    steps.push(run("test"));
  }
  if (typeof scripts.build === "string") {
    steps.push(run("build"));
  }

  if (steps.length === 0 || (steps.length === 1 && steps[0]!.label === "install")) {
    return null; // Nothing to actually test/compile/build — not a real target.
  }

  return { name, dir, ecosystem: "node", steps };
}

function detectPython(dir: string, name: string): DetectedProject | null {
  const hasManifest =
    existsSync(join(dir, "pyproject.toml")) ||
    existsSync(join(dir, "requirements.txt")) ||
    existsSync(join(dir, "setup.py"));
  if (!hasManifest) return null;

  const python = process.platform === "win32" ? "python" : "python3";
  const steps: TestStep[] = [];

  const hasTests =
    existsSync(join(dir, "tests")) ||
    existsSync(join(dir, "test")) ||
    existsSync(join(dir, "pytest.ini")) ||
    (existsSync(join(dir, "pyproject.toml")) &&
      readFileSync(join(dir, "pyproject.toml"), "utf8").includes("[tool.pytest"));
  if (hasTests) {
    steps.push({ label: "test", command: python, args: ["-m", "pytest"] });
  }

  // Python has no separate "build" step for most projects — `compileall`
  // is the closest equivalent to "does this actually compile", catching
  // syntax errors across the whole package the way `tsc --noEmit` does
  // for TypeScript.
  steps.push({ label: "compile", command: python, args: ["-m", "compileall", "-q", "."] });

  return { name, dir, ecosystem: "python", steps };
}

function detectRust(dir: string, name: string): DetectedProject | null {
  if (!existsSync(join(dir, "Cargo.toml"))) return null;
  return {
    name,
    dir,
    ecosystem: "rust",
    steps: [
      { label: "build", command: "cargo", args: ["build"] },
      { label: "test", command: "cargo", args: ["test"] },
    ],
  };
}

function detectGo(dir: string, name: string): DetectedProject | null {
  if (!existsSync(join(dir, "go.mod"))) return null;
  return {
    name,
    dir,
    ecosystem: "go",
    steps: [
      { label: "build", command: "go", args: ["build", "./..."] },
      { label: "test", command: "go", args: ["test", "./..."] },
    ],
  };
}

function detectRuby(dir: string, name: string): DetectedProject | null {
  if (!existsSync(join(dir, "Gemfile"))) return null;
  const steps: TestStep[] = [];
  if (existsSync(join(dir, "spec"))) {
    steps.push({ label: "test", command: "bundle", args: ["exec", "rspec"] });
  }
  if (steps.length === 0) return null;
  return { name, dir, ecosystem: "ruby", steps };
}

function detectJava(dir: string, name: string): DetectedProject | null {
  if (existsSync(join(dir, "pom.xml"))) {
    return {
      name,
      dir,
      ecosystem: "java",
      steps: [{ label: "test", command: "mvn", args: ["-q", "-B", "test"] }],
    };
  }
  if (existsSync(join(dir, "build.gradle")) || existsSync(join(dir, "build.gradle.kts"))) {
    const isWin = process.platform === "win32";
    return {
      name,
      dir,
      ecosystem: "java",
      steps: [{ label: "build", command: isWin ? "gradlew.bat" : "./gradlew", args: ["build"] }],
    };
  }
  return null;
}

const DETECTORS = [detectNode, detectPython, detectRust, detectGo, detectRuby, detectJava];

function detectAt(dir: string, name: string): DetectedProject | null {
  for (const detector of DETECTORS) {
    const found = detector(dir, name);
    if (found) return found;
  }
  return null;
}

/**
 * Walks `rootDir` looking for every buildable/testable package —
 * anything from a single-package repo (one project: the root itself) to
 * a monorepo with `devtunnel-backend/`, `devtunnel-frontend/`,
 * `devtunnel-cli/` each carrying their own `package.json`. A directory
 * that resolves to a project is not descended into further (its
 * `node_modules`/`vendor`/etc. are already excluded anyway, and a
 * package's own subfolders are its concern, not the repo's).
 */
export function detectProjects(rootDir: string): DetectedProject[] {
  const results: DetectedProject[] = [];

  const rootProject = detectAt(rootDir, "root");
  if (rootProject) results.push(rootProject);

  function walk(dir: string, depth: number): void {
    if (depth > MAX_DEPTH) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.startsWith(".") || SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let isDir: boolean;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (!isDir) continue;

      const project = detectAt(full, entry);
      if (project) {
        results.push(project);
        continue; // Don't descend into a directory already claimed as a project.
      }
      walk(full, depth + 1);
    }
  }

  walk(rootDir, 1);
  return results;
}