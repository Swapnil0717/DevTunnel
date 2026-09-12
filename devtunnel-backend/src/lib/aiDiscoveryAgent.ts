import type { ValidatedEnv } from "../config/env";
import { getSupabase } from "./supabase";
import { parseGeminiJson, runGeminiAgent } from "./gemini";
import { DISCOVERY_TOOLS, buildDiscoveryDispatcher, getReadmeWithCache, type ReadmeCache } from "./aiDiscoveryTools";
import {
  validateProjectCandidate,
  validateToolCandidate,
  validateTaskCandidate,
  type ProjectCandidateInput,
  type ToolCandidateInput,
  type TaskCandidateInput,
} from "./aiDiscoveryValidation";
import {
  PROJECT_CATEGORIES,
  TOOL_CATEGORIES,
  bumpCounters,
  getTodayCounters,
  insertDiscoveredProject,
  insertDiscoveredTask,
  insertDiscoveredTool,
  listExistingProjectFullNames,
  listExistingTaskIssueNumbers,
  listExistingToolUrls,
  listOnboardedProjects,
} from "../db/aiDiscovery";
import { logger } from "./logger";
import type { AiDiscoveryRunSummary, DeveloperRole, ExperienceLevel } from "../types";

/**
 * ---------------------------------------------------------------------------
 * Contract this whole module holds itself to (matches the 5-point spec):
 *
 * 1. Search GitHub itself, autonomously — Gemini decides what to search
 *    for and how many times, via the real tool calls in aiDiscoveryTools.ts.
 *    It never sees a shortcut to fabricate a result; every fact in a
 *    candidate traces back to a tool_use response.
 *
 * 2. Fill in every field itself — Gemini authors description/setup
 *    guide/task summary from real source material, and picks
 *    role/difficulty/category ONLY from the fixed enums this file hands
 *    it in the prompt.
 *
 * 3. Save one complete, ready-to-approve record — every candidate is run
 *    through validate*Candidate() (aiDiscoveryValidation.ts) BEFORE any
 *    insert call. A candidate with even one missing/malformed field is
 *    dropped whole (logged, counted, never inserted) — there is no
 *    partial-insert code path anywhere below.
 *
 * 4. Stop, and wait — insertDiscovered{Project,Tool,Task} (db/aiDiscovery.ts)
 *    never set `status`; the column default is 'PENDING' (sql/020). The
 *    only functions that ever move a row out of PENDING are
 *    approve_ai_discovered_* / rejectDiscoveredItem, called exclusively
 *    from an admin's explicit POST .../approve or .../reject
 *    (routes/admin/ai.ts) — nothing in this file, or anything it calls,
 *    has a path to publish a candidate itself.
 *
 * 5. Never touch or duplicate manual onboarding — this file only ever
 *    reads from `devtunnel.projects` / `devtunnel.opensource_tools` /
 *    `devtunnel.tasks` (the real, published tables) and its own
 *    `ai_discovered_*` candidate tables (via listExisting* below,
 *    checked before every proposal). It never reads or writes
 *    `project_onboarding_drafts`, `task_onboarding_drafts`, or
 *    `opensource_tool_onboarding_drafts` — those belong entirely to the
 *    manual admin wizards and this pipeline has no code path into them.
 * ---------------------------------------------------------------------------
 */

/** Extracts { owner, repo } from a github.com repo URL, or null for anything else (never guessed). */
function parseGithubOwnerRepo(url: string): { owner: string; repo: string } | null {
  const match = url.match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)\/?$/i);
  const owner = match?.[1];
  const repo = match?.[2];
  if (!owner || !repo) return null;
  return { owner, repo: repo.replace(/\.git$/i, "") };
}

const SYSTEM_PROMPT = `You are DevTunnel's open-source discovery agent. DevTunnel is a platform that
connects contributors with beginner/intermediate/advanced-friendly open source
projects. You have tools to search real GitHub data — you must never invent a
repository, issue, description, stat, or fact that a tool call did not
actually return. Fixed-choice fields (difficulty, roles, category) must
always be one of the exact values given to you — never invent a new one, and
never leave one out. Free-text fields you author (description, setup guide,
task summary) must be written from real source material you actually fetched
(README, issue body) — never fabricated, and kept short and simple: a couple
of plain sentences is enough, no marketing language, no filler. Every field
listed in the requested JSON schema is required — a candidate with a field
you can't confidently fill in should simply be left out of your response
entirely, rather than filled with a guess or an empty string. When you are
done, reply with ONLY a single JSON value (no markdown fences, no prose)
matching exactly the schema described in the user message.`;

// ---------------------------------------------------------------------------
// Projects — 7/day: 3 beginner, 3 intermediate, 1 advanced.
// ---------------------------------------------------------------------------

async function runProjectDiscovery(env: ValidatedEnv, readmeCache: ReadmeCache): Promise<{ proposed: number; dropped: number; errors: string[] }> {
  const supabase = getSupabase(env);
  const errors: string[] = [];
  const counters = await getTodayCounters(supabase);
  const need = counters.projectsRemaining;
  const totalNeeded = need.beginner + need.intermediate + need.advanced;
  if (totalNeeded === 0) {
    return { proposed: 0, dropped: 0, errors };
  }

  // Point 5: dedup against the real published table AND our own pending/
  // approved queue — never against the manual onboarding drafts table,
  // which this pipeline has no relationship to.
  const exclude = await listExistingProjectFullNames(supabase);

  const prompt = `Find open source GitHub repositories for DevTunnel's project catalog.

Needed today: ${need.beginner} BEGINNER-friendly, ${need.intermediate} INTERMEDIATE, ${need.advanced} ADVANCED.
"Beginner-friendly" = well-documented, has "good first issue" style labels or a
simple, approachable codebase, moderate star count. "Advanced" = larger,
architecturally complex, requires real domain expertise to contribute to.

Do NOT propose any of these repositories (already on DevTunnel or already
proposed today) — full_name values, case-insensitive:
${JSON.stringify(Array.from(exclude).slice(0, 500))}

For each candidate:
1. Use search_github_repositories to find real candidates, and
   get_github_repository to confirm exact stats.
2. Use get_github_readme to actually read the README.
3. Write "description": a SHORT, SIMPLE summary of what the project does —
   1-2 plain sentences, based only on the README/repo description you just
   read. No marketing language, no fabricated claims.
4. Pick "category": EXACTLY ONE of these values, whichever fits best —
   never invent a new one: ${JSON.stringify(PROJECT_CATEGORIES)}.
5. Pick "difficulty" as instructed above.
6. Write "reasoning": 1-3 sentences for the admin reviewing this, on why it
   fits the difficulty and is a good fit for contributors.

Prefer actively maintained projects (recent activity, real stars, real open
issues) with a genuine, permissive open-source license.

Every field below is required. If you can't confidently fill one in for a
candidate, drop that whole candidate instead of guessing.

When finished, reply with ONLY this JSON shape and nothing else:
{
  "candidates": [
    {
      "fullName": "owner/repo",
      "url": "https://github.com/owner/repo",
      "owner": "owner",
      "repo": "repo",
      "githubDescription": "string or null (GitHub's own repo description, verbatim)",
      "primaryLanguage": "string or null",
      "stars": 0,
      "forks": 0,
      "openIssues": 0,
      "difficulty": "BEGINNER" | "INTERMEDIATE" | "ADVANCED",
      "category": "one of the fixed category values above",
      "description": "your short, simple 1-2 sentence summary",
      "reasoning": "1-3 sentences for the admin on why this fits",
      "techStack": { "languages": [], "frameworks": [], "libraries": [] }
    }
  ]
}
Return exactly ${totalNeeded} candidates total, matching the needed counts per difficulty exactly.`;

  let candidates: ProjectCandidateInput[] = [];
  try {
    const dispatch = buildDiscoveryDispatcher(env, readmeCache);
    const raw = await runGeminiAgent(env, SYSTEM_PROMPT, prompt, DISCOVERY_TOOLS, dispatch);
    const parsed = parseGeminiJson<{ candidates: ProjectCandidateInput[] }>(raw);
    candidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  } catch (err) {
    logger.error("ai_project_discovery_failed", { error: err instanceof Error ? err.message : String(err) });
    errors.push("project_discovery_agent_error");
    return { proposed: 0, dropped: 0, errors };
  }

  const remaining = { ...need };
  let proposed = 0;
  let dropped = 0;

  for (const c of candidates) {
    // Point 3: validate the WHOLE record before touching the database.
    // Any problem drops the candidate outright — no partial insert.
    const problems = validateProjectCandidate(c);
    if (problems.length > 0) {
      dropped += 1;
      logger.warn("ai_project_candidate_dropped", { fullName: (c as any).fullName, problems });
      continue;
    }

    const candidate = c as Required<ProjectCandidateInput> & {
      fullName: string;
      url: string;
      owner: string;
      repo: string;
      stars: number;
      forks: number;
      openIssues: number;
      difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
      category: string;
      description: string;
      reasoning: string;
      techStack: { languages: string[]; frameworks: string[]; libraries: string[] };
    };

    const key = candidate.fullName.toLowerCase();
    if (exclude.has(key)) {
      dropped += 1;
      continue;
    }
    const bucket = candidate.difficulty === "BEGINNER" ? "beginner" : candidate.difficulty === "ADVANCED" ? "advanced" : "intermediate";
    if (remaining[bucket] <= 0) {
      dropped += 1;
      continue;
    }

    try {
      // Attach the real README this run already read (or, failing that,
      // fetch it directly) — this is the same content the admin will see
      // once approved (sql/020's approve_ai_discovered_project copies this
      // column straight into devtunnel.projects), so it must be the real
      // thing, never left empty just because Gemini's JSON reply doesn't
      // carry free text this long.
      const readme = await getReadmeWithCache(env, readmeCache, candidate.owner, candidate.repo);

      await insertDiscoveredProject(supabase, {
        repositoryUrl: candidate.url,
        githubOwner: candidate.owner,
        githubRepoName: candidate.repo,
        githubFullName: candidate.fullName,
        githubDescription: (candidate.githubDescription as string | null) ?? null,
        readme,
        primaryLanguage: (candidate.primaryLanguage as string | null) ?? null,
        stars: candidate.stars,
        forks: candidate.forks,
        openIssues: candidate.openIssues,
        techStack: {
          languages: candidate.techStack.languages,
          frontend: [],
          backend: [],
          frameworks: candidate.techStack.frameworks,
          databases: [],
          libraries: candidate.techStack.libraries,
          buildTools: [],
          packageManager: null,
        },
        description: candidate.description.trim(),
        category: candidate.category,
        difficulty: candidate.difficulty,
        aiReasoning: candidate.reasoning,
      });
      // Point 4: no status is ever set here — insertDiscoveredProject
      // never writes one, so the column default ('PENDING') applies.
      await bumpCounters(supabase, { [bucket]: 1 } as any);
      exclude.add(key);
      remaining[bucket] -= 1;
      proposed += 1;
    } catch (err) {
      // A unique-index race (already onboarded/proposed between our
      // exclude-set read and this insert) is expected and non-fatal —
      // skip and keep going, never let one candidate abort the run.
      logger.warn("ai_project_insert_skipped", { fullName: candidate.fullName, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { proposed, dropped, errors };
}

// ---------------------------------------------------------------------------
// Tools — 7/day, exactly one per category.
// ---------------------------------------------------------------------------

async function runToolDiscovery(env: ValidatedEnv, readmeCache: ReadmeCache): Promise<{ proposed: number; dropped: number; errors: string[] }> {
  const supabase = getSupabase(env);
  const errors: string[] = [];
  const counters = await getTodayCounters(supabase);
  if (counters.toolCategoriesRemaining.length === 0) {
    return { proposed: 0, dropped: 0, errors };
  }

  const exclude = await listExistingToolUrls(supabase);
  let proposed = 0;
  let dropped = 0;

  // One category at a time, fully finished (proposed/dropped/inserted)
  // before the next category's conversation even starts — this phase
  // itself only ever begins once project discovery has fully finished
  // (see runDailyDiscovery), so nothing here overlaps with another
  // phase's work either.
  for (const category of counters.toolCategoriesRemaining) {
    const prompt = `Find ONE excellent open source developer tool for DevTunnel's tools
catalog in this exact category: "${category}".

Do NOT propose any of these tool URLs (already listed or already proposed
today):
${JSON.stringify(Array.from(exclude).slice(0, 500))}

1. Use search_github_repositories to find a real, actively maintained,
   well-regarded open source tool for this category.
2. Use get_github_readme to actually read its README.
3. Write "description": a SHORT, SIMPLE 1-2 sentence summary of what the
   tool does, based only on what you actually read.
4. Write "setupGuide": a SHORT how-to-install-and-use guide, IN BULLET
   POINTS (each bullet its own line starting with "- "), 4-8 bullets total.
   Base every bullet only on install/usage steps the README actually
   documents (e.g. the real install command it shows: npm/pip/cargo/go
   install, a config file it names, a CLI command it demonstrates). If the
   README genuinely does not cover installation, it is fine to give a
   minimal, standard install command for that language's package manager
   (e.g. "npm install <package>") — never invent flags, config keys, or
   steps that aren't standard practice for that ecosystem.
5. Write "reasoning": 1-3 sentences for the admin on why this is a great
   pick for this category.

Every field below is required. If you can't confidently fill one in, don't
return a candidate at all for this category rather than guessing.

Reply with ONLY this JSON and nothing else:
{
  "sourceUrl": "https://github.com/owner/repo",
  "name": "string",
  "fetchedDescription": "string or null (GitHub's own repo description, verbatim)",
  "primaryLanguage": "string or null",
  "labels": ["a few short audience/role labels, e.g. Backend, DevOps"],
  "description": "your short, simple 1-2 sentence summary",
  "setupGuide": "- bullet one\\n- bullet two\\n- ...",
  "reasoning": "1-3 sentences for the admin on why this is a great pick"
}`;

    try {
      const dispatch = buildDiscoveryDispatcher(env, readmeCache);
      const raw = await runGeminiAgent(env, SYSTEM_PROMPT, prompt, DISCOVERY_TOOLS, dispatch);
      const candidateRaw = parseGeminiJson<ToolCandidateInput>(raw);

      const problems = validateToolCandidate(candidateRaw);
      if (problems.length > 0) {
        dropped += 1;
        logger.warn("ai_tool_candidate_dropped", { category, sourceUrl: (candidateRaw as any).sourceUrl, problems });
        continue;
      }

      const candidate = candidateRaw as Required<ToolCandidateInput> & {
        sourceUrl: string;
        name: string;
        labels: string[];
        description: string;
        setupGuide: string;
        reasoning: string;
      };

      const key = candidate.sourceUrl.toLowerCase();
      if (exclude.has(key)) {
        dropped += 1;
        continue;
      }
      exclude.add(key);

      // Same real-README attachment as projects: prefer what this
      // conversation already fetched, fall back to a direct fetch. Only
      // attempted for github.com sources — a tool's sourceUrl doesn't
      // have to be GitHub-hosted, and this pipeline never guesses.
      const ownerRepo = parseGithubOwnerRepo(candidate.sourceUrl);
      const readme = ownerRepo ? await getReadmeWithCache(env, readmeCache, ownerRepo.owner, ownerRepo.repo) : null;

      await insertDiscoveredTool(supabase, {
        sourceUrl: candidate.sourceUrl,
        name: candidate.name,
        fetchedDescription: (candidate.fetchedDescription as string | null) ?? null,
        readme,
        primaryLanguage: (candidate.primaryLanguage as string | null) ?? null,
        category,
        labels: candidate.labels,
        description: candidate.description.trim(),
        setupGuide: candidate.setupGuide.trim(),
        aiReasoning: candidate.reasoning,
      });
      await bumpCounters(supabase, { tools: 1, toolCategory: category });
      proposed += 1;
    } catch (err) {
      logger.error("ai_tool_discovery_failed", { category, error: err instanceof Error ? err.message : String(err) });
      errors.push(`tool_discovery_failed:${category}`);
    }
  }

  return { proposed, dropped, errors };
}

// ---------------------------------------------------------------------------
// Tasks — every open issue worth surfacing, across every onboarded project.
// No numeric daily cap (per spec: "address all the issues that are
// related to projects that are in devtunnel"), but still deduplicated and
// run with a sane per-project ceiling so one huge repo can't blow the
// Gemini/GitHub budget for the day.
// ---------------------------------------------------------------------------

const MAX_ISSUES_PER_PROJECT = 15;

async function runTaskDiscovery(env: ValidatedEnv): Promise<{ proposed: number; dropped: number; errors: string[] }> {
  const supabase = getSupabase(env);
  const errors: string[] = [];
  let proposed = 0;
  let dropped = 0;

  const projects = await listOnboardedProjects(supabase);

  // One onboarded project at a time, fully finished before the next
  // starts — this is also the first phase runDailyDiscovery runs, so
  // every issue gets proposed before a single project or tool candidate
  // does.
  for (const project of projects) {
    try {
      const alreadyKnown = await listExistingTaskIssueNumbers(supabase, project.id);

      const prompt = `DevTunnel has already onboarded this GitHub repository as a project:
${project.githubFullName} (${project.name}).

Find open issues on this exact repository that would make good contributor
tasks for DevTunnel (clear scope, reasonable for an external contributor,
not just discussion/question issues). Use get_github_repository_open_issues
with owner="${project.githubOwner}" repo="${project.githubRepoName}" (or
search_github_issues with query "repo:${project.githubFullName} is:issue is:open"
if that repo has many issues).

Do NOT include these issue numbers — already tracked as DevTunnel tasks or
already proposed:
${JSON.stringify(Array.from(alreadyKnown))}

Only include genuinely actionable issues. It is fine to return an empty list
if none qualify.

For each issue you include, every field is required:
- "suggestedRoles": at least one role, only from FRONTEND, BACKEND,
  FULL_STACK, DOCUMENTATION, TESTING, DEVOPS — never invent a new role, and
  never return an empty list (if you truly can't tell, drop the candidate).
- "suggestedDifficulty": only BEGINNER, INTERMEDIATE, ADVANCED, or null if
  you genuinely can't tell — never invent a new value.
- "summary": a SHORT, SIMPLE 1-2 sentence description of what a contributor
  would actually need to do, based only on the real issue title/body.
- "reasoning": 1-2 sentences for the admin on why this is a good contributor
  task (separate from the summary — this one is for the reviewer, not the
  contributor).

Reply with ONLY this JSON and nothing else:
{
  "candidates": [
    {
      "issueNumber": 0,
      "title": "string",
      "url": "string",
      "body": "string or null",
      "labels": ["string"],
      "author": { "username": "string", "avatarUrl": "string or null", "profileUrl": "string" } | null,
      "suggestedRoles": ["FRONTEND" | "BACKEND" | "FULL_STACK" | "DOCUMENTATION" | "TESTING" | "DEVOPS"],
      "suggestedDifficulty": "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | null,
      "summary": "short, simple description of the work",
      "reasoning": "1-2 sentences for the admin reviewer"
    }
  ]
}
Return at most ${MAX_ISSUES_PER_PROJECT} candidates.`;

      const dispatch = buildDiscoveryDispatcher(env);
      const raw = await runGeminiAgent(env, SYSTEM_PROMPT, prompt, DISCOVERY_TOOLS, dispatch);
      const parsed = parseGeminiJson<{ candidates: TaskCandidateInput[] }>(raw);
      const candidates = Array.isArray(parsed.candidates) ? parsed.candidates.slice(0, MAX_ISSUES_PER_PROJECT) : [];

      for (const c of candidates) {
        const problems = validateTaskCandidate(c);
        if (problems.length > 0) {
          dropped += 1;
          logger.warn("ai_task_candidate_dropped", { project: project.githubFullName, issueNumber: (c as any).issueNumber, problems });
          continue;
        }

        const candidate = c as Required<TaskCandidateInput> & {
          issueNumber: number;
          title: string;
          url: string;
          suggestedRoles: DeveloperRole[];
          suggestedDifficulty: ExperienceLevel | null;
          summary: string;
          reasoning: string;
        };

        if (alreadyKnown.has(candidate.issueNumber)) {
          dropped += 1;
          continue;
        }

        try {
          await insertDiscoveredTask(supabase, {
            projectId: project.id,
            issueNumber: candidate.issueNumber,
            issueTitle: candidate.title,
            issueUrl: candidate.url,
            issueBody: (candidate.body as string | null) ?? null,
            issueLabels: (candidate.labels as string[]) ?? [],
            githubAuthor: (candidate.author as any) ?? null,
            suggestedRoles: candidate.suggestedRoles,
            suggestedDifficulty: candidate.suggestedDifficulty,
            taskSummary: candidate.summary.trim(),
            aiReasoning: candidate.reasoning,
          });
          await bumpCounters(supabase, { tasks: 1 });
          alreadyKnown.add(candidate.issueNumber);
          proposed += 1;
        } catch (err) {
          logger.warn("ai_task_insert_skipped", { project: project.githubFullName, issueNumber: candidate.issueNumber, error: err instanceof Error ? err.message : String(err) });
        }
      }
    } catch (err) {
      logger.error("ai_task_discovery_failed", { project: project.githubFullName, error: err instanceof Error ? err.message : String(err) });
      errors.push(`task_discovery_failed:${project.githubFullName}`);
    }
  }

  return { proposed, dropped, errors };
}

// ---------------------------------------------------------------------------
// Entry point — called by the daily cron trigger and by the manual
// POST /admin/ai/run endpoint. Runs all three phases strictly one at a
// time, in this order: issues (tasks) -> projects -> tools. Each phase
// runs fully to completion — including every item inside it, one at a
// time — before the next phase starts. One phase failing never aborts
// the others (each is wrapped in its own .catch below).
// ---------------------------------------------------------------------------
export async function runDailyDiscovery(env: ValidatedEnv): Promise<AiDiscoveryRunSummary> {
  const errors: string[] = [];
  logger.info("ai_discovery_run_started");

  // Deliberately sequential and in this exact order — issues, then
  // projects, then tools — one phase runs to completion (every category /
  // every project / every candidate handled one at a time within it) before
  // the next one is even started. Nothing here runs concurrently with
  // anything else in the run.
  const tasksResult = await runTaskDiscovery(env).catch((err) => {
    errors.push("task_discovery_crashed");
    logger.error("ai_discovery_task_phase_crashed", { error: err instanceof Error ? err.message : String(err) });
    return { proposed: 0, dropped: 0, errors: [] };
  });

  // Shared across the project and tool phases (task candidates don't
  // carry a README) so a repo that comes up in both never gets fetched
  // from GitHub twice in the same run.
  const readmeCache: ReadmeCache = new Map();

  const projectsResult = await runProjectDiscovery(env, readmeCache).catch((err) => {
    errors.push("project_discovery_crashed");
    logger.error("ai_discovery_project_phase_crashed", { error: err instanceof Error ? err.message : String(err) });
    return { proposed: 0, dropped: 0, errors: [] };
  });

  const toolsResult = await runToolDiscovery(env, readmeCache).catch((err) => {
    errors.push("tool_discovery_crashed");
    logger.error("ai_discovery_tool_phase_crashed", { error: err instanceof Error ? err.message : String(err) });
    return { proposed: 0, dropped: 0, errors: [] };
  });

  const summary: AiDiscoveryRunSummary = {
    date: new Date().toISOString().slice(0, 10),
    projectsProposed: projectsResult.proposed,
    toolsProposed: toolsResult.proposed,
    tasksProposed: tasksResult.proposed,
    candidatesDropped: projectsResult.dropped + toolsResult.dropped + tasksResult.dropped,
    errors: [...errors, ...projectsResult.errors, ...toolsResult.errors, ...tasksResult.errors],
  };

  logger.info("ai_discovery_run_finished", summary as unknown as Record<string, unknown>);
  return summary;
}

/**
 * Scoped entry point — runs ONLY the project-discovery phase, for the
 * "Add AI projects" button on the AI Added Projects admin page
 * (devtunnel-frontend .../ai/projects). Shares the same daily quota and
 * dedup logic as runDailyDiscovery, so it's safe to call repeatedly —
 * it only ever fills whatever's left of today's project quota. Tools
 * and tasks are left untouched.
 */
export async function runProjectDiscoveryOnly(env: ValidatedEnv): Promise<AiDiscoveryRunSummary> {
  logger.info("ai_discovery_projects_run_started");
  const readmeCache: ReadmeCache = new Map();
  const projectsResult = await runProjectDiscovery(env, readmeCache).catch((err) => {
    logger.error("ai_discovery_project_phase_crashed", { error: err instanceof Error ? err.message : String(err) });
    return { proposed: 0, dropped: 0, errors: ["project_discovery_crashed"] };
  });

  const summary: AiDiscoveryRunSummary = {
    date: new Date().toISOString().slice(0, 10),
    projectsProposed: projectsResult.proposed,
    toolsProposed: 0,
    tasksProposed: 0,
    candidatesDropped: projectsResult.dropped,
    errors: projectsResult.errors,
  };

  logger.info("ai_discovery_projects_run_finished", summary as unknown as Record<string, unknown>);
  return summary;
}

/**
 * Scoped entry point — runs ONLY the tool-discovery phase, for the
 * "Add AI tools" button on the AI Added Tools admin page
 * (devtunnel-frontend .../ai/tools). Same quota/dedup guarantees as
 * runProjectDiscoveryOnly above, mirrored for tools.
 */
export async function runToolDiscoveryOnly(env: ValidatedEnv): Promise<AiDiscoveryRunSummary> {
  logger.info("ai_discovery_tools_run_started");
  const readmeCache: ReadmeCache = new Map();
  const toolsResult = await runToolDiscovery(env, readmeCache).catch((err) => {
    logger.error("ai_discovery_tool_phase_crashed", { error: err instanceof Error ? err.message : String(err) });
    return { proposed: 0, dropped: 0, errors: ["tool_discovery_crashed"] };
  });

  const summary: AiDiscoveryRunSummary = {
    date: new Date().toISOString().slice(0, 10),
    projectsProposed: 0,
    toolsProposed: toolsResult.proposed,
    tasksProposed: 0,
    candidatesDropped: toolsResult.dropped,
    errors: toolsResult.errors,
  };

  logger.info("ai_discovery_tools_run_finished", summary as unknown as Record<string, unknown>);
  return summary;
}

/**
 * Scoped entry point — runs ONLY the task-discovery phase, for the
 * "Add AI tasks" button on the AI Added Tasks admin page
 * (devtunnel-frontend .../ai/tasks). Walks every onboarded project's
 * open issues one at a time (see runTaskDiscovery above) — no daily
 * quota to share, just per-project dedup, so it's safe to call
 * repeatedly. Projects and tools are left untouched.
 */
export async function runTaskDiscoveryOnly(env: ValidatedEnv): Promise<AiDiscoveryRunSummary> {
  logger.info("ai_discovery_tasks_run_started");
  const tasksResult = await runTaskDiscovery(env).catch((err) => {
    logger.error("ai_discovery_task_phase_crashed", { error: err instanceof Error ? err.message : String(err) });
    return { proposed: 0, dropped: 0, errors: ["task_discovery_crashed"] };
  });

  const summary: AiDiscoveryRunSummary = {
    date: new Date().toISOString().slice(0, 10),
    projectsProposed: 0,
    toolsProposed: 0,
    tasksProposed: tasksResult.proposed,
    candidatesDropped: tasksResult.dropped,
    errors: tasksResult.errors,
  };

  logger.info("ai_discovery_tasks_run_finished", summary as unknown as Record<string, unknown>);
  return summary;
}

export { TOOL_CATEGORIES, PROJECT_CATEGORIES };