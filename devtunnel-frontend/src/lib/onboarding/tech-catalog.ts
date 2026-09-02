/**
 * Reference catalog of technologies commonly found across open source
 * projects (languages, frameworks, datastores, infra, testing tools).
 * Used to power the "suggested technologies" quick-pick in the onboarding
 * Technologies field, and to look up a logo for any technology a
 * contributor types in.
 *
 * This is a general reference list, not a claim about what any specific
 * DevTunnel project actually uses (Frontend_Development_Rules.txt rule
 * 58/59 — never invent project data). Icons are loaded by slug from
 * Simple Icons (https://simpleicons.org) at render time
 * (`https://cdn.simpleicons.org/:slug`); a technology without a reliable
 * slug simply renders without a logo rather than a broken one — see
 * TechIcon's onError handling in ../components/onboarding/tech-icon.tsx.
 */

 export type TechCategory =
 | "Languages"
 | "Frontend"
 | "Backend & frameworks"
 | "Databases"
 | "DevOps & infra"
 | "Mobile"
 | "Testing & QA"
 | "Other";

export interface TechStackEntry {
 name: string;
 /** Simple Icons slug. Omitted when there's no reliably matching icon. */
 slug?: string;
 category: TechCategory;
}

export const TECH_STACK_CATEGORIES: TechCategory[] = [
 "Languages",
 "Frontend",
 "Backend & frameworks",
 "Databases",
 "DevOps & infra",
 "Mobile",
 "Testing & QA",
 "Other",
];

export const TECH_STACK_CATALOG: TechStackEntry[] = [
 // Languages
 { name: "JavaScript", slug: "javascript", category: "Languages" },
 { name: "TypeScript", slug: "typescript", category: "Languages" },
 { name: "Python", slug: "python", category: "Languages" },
 { name: "Go", slug: "go", category: "Languages" },
 { name: "Rust", slug: "rust", category: "Languages" },
 { name: "Java", slug: "openjdk", category: "Languages" },
 { name: "C++", slug: "cplusplus", category: "Languages" },
 { name: "C#", slug: "csharp", category: "Languages" },
 { name: "PHP", slug: "php", category: "Languages" },
 { name: "Ruby", slug: "ruby", category: "Languages" },
 { name: "Swift", slug: "swift", category: "Languages" },
 { name: "Kotlin", slug: "kotlin", category: "Languages" },

 // Frontend
 { name: "React", slug: "react", category: "Frontend" },
 { name: "Vue.js", slug: "vuedotjs", category: "Frontend" },
 { name: "Angular", slug: "angular", category: "Frontend" },
 { name: "Svelte", slug: "svelte", category: "Frontend" },
 { name: "Next.js", slug: "nextdotjs", category: "Frontend" },
 { name: "Tailwind CSS", slug: "tailwindcss", category: "Frontend" },
 { name: "HTML5", slug: "html5", category: "Frontend" },
 { name: "CSS3", slug: "css3", category: "Frontend" },

 // Backend & frameworks
 { name: "Node.js", slug: "nodedotjs", category: "Backend & frameworks" },
 { name: "Express", slug: "express", category: "Backend & frameworks" },
 { name: "Django", slug: "django", category: "Backend & frameworks" },
 { name: "Flask", slug: "flask", category: "Backend & frameworks" },
 { name: "FastAPI", slug: "fastapi", category: "Backend & frameworks" },
 { name: "Spring Boot", slug: "spring", category: "Backend & frameworks" },
 { name: "Ruby on Rails", slug: "rubyonrails", category: "Backend & frameworks" },
 { name: "Laravel", slug: "laravel", category: "Backend & frameworks" },
 { name: ".NET", slug: "dotnet", category: "Backend & frameworks" },
 { name: "GraphQL", slug: "graphql", category: "Backend & frameworks" },

 // Databases
 { name: "PostgreSQL", slug: "postgresql", category: "Databases" },
 { name: "MySQL", slug: "mysql", category: "Databases" },
 { name: "MongoDB", slug: "mongodb", category: "Databases" },
 { name: "Redis", slug: "redis", category: "Databases" },
 { name: "SQLite", slug: "sqlite", category: "Databases" },

 // DevOps & infra
 { name: "Docker", slug: "docker", category: "DevOps & infra" },
 { name: "Kubernetes", slug: "kubernetes", category: "DevOps & infra" },
 { name: "GitHub Actions", slug: "githubactions", category: "DevOps & infra" },
 { name: "Terraform", slug: "terraform", category: "DevOps & infra" },
 { name: "AWS", slug: "amazonaws", category: "DevOps & infra" },
 { name: "Google Cloud", slug: "googlecloud", category: "DevOps & infra" },
 { name: "Azure", slug: "microsoftazure", category: "DevOps & infra" },
 { name: "Nginx", slug: "nginx", category: "DevOps & infra" },
 { name: "Linux", slug: "linux", category: "DevOps & infra" },

 // Mobile
 { name: "Flutter", slug: "flutter", category: "Mobile" },
 { name: "React Native", category: "Mobile" },
 { name: "Android", slug: "android", category: "Mobile" },
 { name: "iOS", slug: "ios", category: "Mobile" },

 // Testing & QA
 { name: "Jest", slug: "jest", category: "Testing & QA" },
 { name: "Cypress", slug: "cypress", category: "Testing & QA" },
 { name: "Playwright", slug: "playwright", category: "Testing & QA" },
 { name: "Selenium", slug: "selenium", category: "Testing & QA" },

 // Other
 { name: "Git", slug: "git", category: "Other" },
 { name: "GitHub", slug: "github", category: "Other" },
 { name: "WebAssembly", slug: "webassembly", category: "Other" },
 { name: "Bash", slug: "gnubash", category: "Other" },
];

/**
* Case-insensitive lookup so a technology typed freehand (e.g. "python")
* still matches the catalog entry ("Python") and gets its logo.
*/
export function findTechEntry(name: string): TechStackEntry | undefined {
 const normalized = name.trim().toLowerCase();
 return TECH_STACK_CATALOG.find((entry) => entry.name.toLowerCase() === normalized);
}