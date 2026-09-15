/**
 * Maps a repository's raw GitHub `topics` (src/lib/githubDiscovery.ts
 * `GithubCatalogRepoItem.topics`) to a small set of genuine technology
 * names for `GET /github-projects`'s `techStack` field
 * (devtunnel-frontend's `GithubProjectSummary.techStack`, filtered on by
 * `GithubProjectsExplorer`'s "Tech stack" dropdown).
 *
 * GitHub topics are entirely freeform — a repository owner can tag their
 * repo with anything, including the repo's own name (a common pattern on
 * small practice/challenge-log repos, e.g. a repo literally named
 * `100-days-of-code-log` tagged with the topic `100-days-of-code-log` so
 * it's easier to find by that exact string) or a non-technology label
 * like `careers` or `hacktoberfest`. Passing topics through unfiltered
 * turned the "Tech stack" dropdown into a list of near-random strings —
 * some of them literal repo names — instead of an actually useful
 * technology filter. This module is the fix: only a topic that matches a
 * known technology (by its common GitHub-topic spelling) survives, and
 * it's normalized to one canonical display name so `react` and `reactjs`
 * don't show up as two different filter options.
 *
 * Deliberately not shared with devtunnel-frontend's
 * `lib/onboarding/tech-catalog.ts` (the onboarding "suggested
 * technologies" picker) — that catalog is keyed by clean display names
 * for a human typing into a search box; this one is keyed by the messy,
 * lowercase-hyphenated *topic slugs* GitHub itself uses, which is a
 * different lookup shape entirely. Not exhaustive — this is a filter,
 * not a claim about every technology that exists; an unrecognized topic
 * is simply dropped rather than guessed at (rule 58: never invent/guess
 * at data), which is why a repository can legitimately end up with an
 * empty `techStack` array despite having GitHub topics.
 */

 const KNOWN_TECH_TOPICS: Record<string, string> = {
  // Languages
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  python3: "Python",
  golang: "Go",
  go: "Go",
  rust: "Rust",
  "rust-lang": "Rust",
  java: "Java",
  cpp: "C++",
  "c-plus-plus": "C++",
  csharp: "C#",
  "c-sharp": "C#",
  php: "PHP",
  ruby: "Ruby",
  swift: "Swift",
  kotlin: "Kotlin",
  scala: "Scala",
  elixir: "Elixir",
  haskell: "Haskell",
  dart: "Dart",
  lua: "Lua",
  perl: "Perl",
  shell: "Shell",
  bash: "Bash",

  // Frontend
  react: "React",
  reactjs: "React",
  "react-js": "React",
  vue: "Vue.js",
  vuejs: "Vue.js",
  "vue-js": "Vue.js",
  angular: "Angular",
  angularjs: "Angular",
  svelte: "Svelte",
  sveltejs: "Svelte",
  nextjs: "Next.js",
  "next-js": "Next.js",
  tailwindcss: "Tailwind CSS",
  tailwind: "Tailwind CSS",
  html5: "HTML5",
  html: "HTML5",
  css3: "CSS3",
  css: "CSS3",
  sass: "Sass",
  scss: "Sass",
  webpack: "Webpack",
  vite: "Vite",
  redux: "Redux",
  jquery: "jQuery",

  // Backend & frameworks
  nodejs: "Node.js",
  node: "Node.js",
  expressjs: "Express",
  express: "Express",
  django: "Django",
  flask: "Flask",
  fastapi: "FastAPI",
  spring: "Spring Boot",
  "spring-boot": "Spring Boot",
  rails: "Ruby on Rails",
  "ruby-on-rails": "Ruby on Rails",
  laravel: "Laravel",
  dotnet: ".NET",
  ".net": ".NET",
  aspnet: "ASP.NET",
  graphql: "GraphQL",
  grpc: "gRPC",
  webassembly: "WebAssembly",
  wasm: "WebAssembly",

  // Databases
  postgresql: "PostgreSQL",
  postgres: "PostgreSQL",
  mysql: "MySQL",
  mongodb: "MongoDB",
  redis: "Redis",
  sqlite: "SQLite",
  elasticsearch: "Elasticsearch",
  cassandra: "Cassandra",
  dynamodb: "DynamoDB",
  sql: "SQL",

  // DevOps & infra
  docker: "Docker",
  kubernetes: "Kubernetes",
  k8s: "Kubernetes",
  "github-actions": "GitHub Actions",
  terraform: "Terraform",
  aws: "AWS",
  gcp: "Google Cloud",
  "google-cloud": "Google Cloud",
  azure: "Azure",
  nginx: "Nginx",
  linux: "Linux",
  "ci-cd": "CI/CD",
  devops: "DevOps",
  serverless: "Serverless",
  microservices: "Microservices",

  // Mobile
  ios: "iOS",
  android: "Android",
  flutter: "Flutter",
  "react-native": "React Native",
  xamarin: "Xamarin",

  // Testing & QA
  jest: "Jest",
  pytest: "Pytest",
  selenium: "Selenium",
  cypress: "Cypress",

  // Data / AI
  "machine-learning": "Machine Learning",
  "deep-learning": "Deep Learning",
  "artificial-intelligence": "AI",
  ai: "AI",
  "data-science": "Data Science",
  tensorflow: "TensorFlow",
  pytorch: "PyTorch",
  llm: "LLM",
  nlp: "NLP",
  blockchain: "Blockchain",
};

/**
 * Filters + normalizes raw GitHub topics down to genuine technology tags
 * (see module doc comment for why this is necessary). `primaryLanguage`
 * — GitHub's own detected repository language, already shown as its own
 * badge on `GithubProjectCard` — is excluded from the result so the same
 * technology never appears twice on one card. Capped at 6 (rule 67:
 * bound response/list size — matches `GithubProjectCard`'s own
 * `MAX_VISIBLE_TAGS` collapsing behavior).
 */
export function mapGithubTopicsToTechStack(
  topics: string[],
  primaryLanguage: string | null,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const topic of topics) {
    const canonical = KNOWN_TECH_TOPICS[topic.trim().toLowerCase()];
    if (!canonical) continue;
    if (primaryLanguage && canonical.toLowerCase() === primaryLanguage.toLowerCase()) continue;
    if (seen.has(canonical)) continue;

    seen.add(canonical);
    result.push(canonical);
    if (result.length === 6) break;
  }

  return result;
}