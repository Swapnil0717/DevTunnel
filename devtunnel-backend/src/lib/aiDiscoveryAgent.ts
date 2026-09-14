// devtunnel-backend/src/lib/aiDiscoveryAgent.ts
import type { ValidatedEnv } from "../config/env";
import { getSupabase } from "./supabase";
import { parseGroqJson, runGroqAgent } from "./groq";
import { GroqQuotaExceededError, getGroqQuotaSnapshot, isPhaseBudgetMostlySpent } from "./groqQuota";
import { DISCOVERY_TOOLS, buildDiscoveryDispatcher, getReadmeWithCache, type ReadmeCache, type StepReporter } from "./aiDiscoveryTools";
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
  TOOL_DAILY_QUOTA,
  bumpCounters,
  getTodayCounters,
  insertDiscoveredProject,
  insertDiscoveredTask,
  insertDiscoveredTool,
  listExistingProjectFullNames,
  listExistingTaskIssueNumbers,
  listExistingToolUrls,
  listOnboardedProjects,
  listPublishedProjectsForReconciliation,
  listPublishedToolsForReconciliation,
} from "../db/aiDiscovery";
import { logger } from "./logger";
import type { AiDiscoveryCounters, AiDiscoveryRunSummary, DeveloperRole, ExperienceLevel } from "../types";

/**
 * ---------------------------------------------------------------------------
 * Contract this whole module holds itself to (matches the 5-point spec):
 *
 * 1. Search GitHub itself, autonomously — the model decides what to search
 *    for and how many times, via the real tool calls in aiDiscoveryTools.ts.
 *    It never sees a shortcut to fabricate a result; every fact in a
 *    candidate traces back to a tool_use response.
 *
 * 2. Fill in every field itself — the model authors description/setup
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
 *
 * 6. Cross-registration before fresh search — runProjectDiscovery and
 *    runToolDiscovery each run a "reconciliation" pass FIRST, closing any
 *    gap between the two published catalogs (a published tool that isn't
 *    also a project candidate yet, or vice versa) before they ever call
 *    search_github_repositories for something genuinely new. See
 *    `reconcileToolsMissingAsProjects` / `reconcileProjectsMissingAsTools`
 *    below. On the tools→projects side, reconciliation runs to
 *    completion — every published tool gets registered as a project —
 *    BEFORE the day's 3-beginner/3-intermediate/1-advanced quota is even
 *    read, and does not draw from or count against that quota (it's not
 *    a "new project found by search"). That quota applies exclusively to
 *    the fresh-search step that follows. Reconciliation candidates still
 *    go through the exact same validate*Candidate() gate and land in the
 *    exact same PENDING queue as a freshly-searched one — the only
 *    difference is `aiReasoning` is prefixed to say a candidate was
 *    cross-registered, so the admin review queue shows why it appeared,
 *    and no GitHub search tool call is spent on it since the source
 *    repository is already known.
 * ---------------------------------------------------------------------------
 */

/**
 * Shared return shape for each of the three phase runners below.
 * `quotaExceeded` means THIS phase stopped early because ITS budget
 * (which, per groqQuota.ts's getPhaseBudgetShares split, may be only that
 * phase's own 25%/25%/50% slice — not necessarily the whole account) ran
 * out. `accountQuotaExceeded` is the narrower, more serious case: the
 * shared Groq account itself has zero requests/tokens left for ANY
 * phase today (GroqQuotaExceededError reason "rpd"/"tpd", not
 * "rpd_phase"/"tpd_phase") — this is the only condition that should ever
 * make `runDailyDiscovery` skip a phase it hasn't started yet, since a
 * phase running out of its own share must never block a different
 * phase's separate share.
 */
interface PhaseDiscoveryResult {
  proposed: number;
  dropped: number;
  errors: string[];
  quotaExceeded: boolean;
  accountQuotaExceeded: boolean;
}

/** Extracts { owner, repo } from a github.com repo URL, or null for anything else (never guessed). */
function parseGithubOwnerRepo(url: string): { owner: string; repo: string } | null {
  const match = url.match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)\/?$/i);
  const owner = match?.[1];
  const repo = match?.[2];
  if (!owner || !repo) return null;
  return { owner, repo: repo.replace(/\.git$/i, "") };
}

/**
 * Shared shape for the two reconciliation passes below — deliberately
 * the same fields as `PhaseDiscoveryResult` minus `errors` (reconciliation
 * failures are logged and skipped per-candidate, never surfaced as a
 * run-level error string) so the caller can fold the numbers straight
 * into its own totals.
 */
interface ReconciliationResult {
  proposed: number;
  dropped: number;
  quotaExceeded: boolean;
  accountQuotaExceeded: boolean;
}

const RECONCILIATION_SYSTEM_PROMPT = `You are DevTunnel's open-source discovery agent, currently doing a
cross-registration pass: converting one already-known DevTunnel catalog
entry into the OTHER catalog's shape. You are given every real fact you
need (name, URL, description, README) directly in the prompt — do not
call any tool, do not invent anything not present in what you were given.
Fixed-choice fields must always be one of the exact values listed — never
invent a new one. Free-text fields must be written only from the real
material given to you — short, plain, no marketing language. When you are
done, reply with ONLY a single JSON value (no markdown fences, no prose)
matching exactly the schema described in the user message.`;

/** No-op dispatcher for reconciliation's tool-free Groq calls — never actually invoked since `tools` is []. */
const noToolDispatch: import("./groq").GroqToolDispatcher = async () => {
  throw new Error("Reconciliation prompts must never trigger a tool call.");
};

/**
 * Phase 0a (runs inside runProjectDiscovery, BEFORE fresh GitHub search,
 * and BEFORE the day's 3-beginner/3-intermediate/1-advanced quota is
 * even considered): every published, GitHub-hosted tool that isn't ALSO
 * a project candidate yet gets classified from its own already-known
 * description/README (no new GitHub search) and proposed as a project.
 *
 * Deliberately NOT gated by, or counted against, the day's per-
 * difficulty project quota (`PROJECT_QUOTA` / `projectsRemaining` in
 * db/aiDiscovery.ts) — that quota is "3 beginner / 3 intermediate / 1
 * advanced NEW projects found by search," full stop. Cross-registering
 * an already-known, already-published tool isn't "finding a new
 * project," so it must never eat into or block that budget. This
 * function runs to completion — every gap tool gets registered as a
 * project — before the caller ever looks at the day's quota; only
 * `maxToPropose` (the manual "add one project" admin button's own
 * per-click cap) and the shared Groq budget can stop it early. Mutates
 * `exclude` in place so the caller's subsequent search step sees an
 * up-to-date dedup set.
 */
async function reconcileToolsMissingAsProjects(
  env: ValidatedEnv,
  kv: KVNamespace,
  supabase: ReturnType<typeof getSupabase>,
  readmeCache: ReadmeCache,
  exclude: Set<string>,
  maxToPropose: number | undefined,
  onStep: StepReporter | undefined,
): Promise<ReconciliationResult> {
  let proposed = 0;
  let dropped = 0;

  onStep?.("Checking whether every open source tool is also registered as a project…");
  const publishedTools = await listPublishedToolsForReconciliation(supabase);
  const gaps = publishedTools.filter((t) => !exclude.has(t.fullName));

  if (gaps.length === 0) {
    onStep?.("Every GitHub-hosted tool is already registered as a project — nothing to cross-register.");
    return { proposed, dropped, quotaExceeded: false, accountQuotaExceeded: false };
  }

  onStep?.(`Found ${gaps.length} tool(s) not yet registered as a project — registering all of them as projects first, before searching for anything new.`);

  for (const tool of gaps) {
    if (maxToPropose !== undefined && proposed >= maxToPropose) break;

    const ownerRepo = parseGithubOwnerRepo(`https://github.com/${tool.fullName}`);
    if (!ownerRepo) continue; // defensive — fullName is only ever built from a URL that already parsed cleanly

    onStep?.(`Cross-registering tool "${tool.name}" as a project…`);

    const prompt = `DevTunnel already lists this open source tool in its tools catalog. It
should also exist as a project candidate in the project catalog. Do NOT
search GitHub or call any tool — classify only from what's given below.

Name: ${tool.name}
Repository: https://github.com/${ownerRepo.owner}/${ownerRepo.repo}
Existing description: ${tool.description ?? "(none given)"}
Primary language: ${tool.primaryLanguage ?? "(unknown)"}
README (may be truncated):
${(tool.readme ?? "(no README available)").slice(0, 6000)}

From the material above ONLY (never invent facts not shown here):
1. Pick "difficulty": exactly one of "BEGINNER", "INTERMEDIATE", "ADVANCED"
   — how approachable this codebase looks for a new contributor.
2. Pick "category": EXACTLY ONE of these values, whichever fits best:
   ${JSON.stringify(PROJECT_CATEGORIES)}.
3. Write "description": a SHORT, SIMPLE 1-2 sentence summary of what it does.
4. Write "techStack": { "languages": [], "frameworks": [], "libraries": [] }
   using only what the README/primary language actually show.
5. Write "reasoning": 1-3 sentences for the admin, noting this project is
   the tool "${tool.name}" already on DevTunnel's tools catalog, now being
   cross-registered as a project too.

Every field is required. If you can't confidently fill one in, reply with
{"skip": true} instead of guessing.

Reply with ONLY this JSON and nothing else:
{
  "difficulty": "BEGINNER" | "INTERMEDIATE" | "ADVANCED",
  "category": "one of the fixed category values above",
  "description": "your short, simple 1-2 sentence summary",
  "techStack": { "languages": [], "frameworks": [], "libraries": [] },
  "reasoning": "1-3 sentences for the admin"
}`;

    try {
      const raw = await runGroqAgent(env, kv, RECONCILIATION_SYSTEM_PROMPT, prompt, [], noToolDispatch, "projects");
      const parsed = parseGroqJson<{
        skip?: unknown;
        difficulty?: unknown;
        category?: unknown;
        description?: unknown;
        techStack?: unknown;
        reasoning?: unknown;
      }>(raw);

      if (parsed.skip === true) {
        dropped += 1;
        onStep?.(`Skipped cross-registering "${tool.name}" — not enough real material to classify confidently.`);
        continue;
      }

      const candidateInput: ProjectCandidateInput = {
        fullName: tool.fullName,
        url: `https://github.com/${ownerRepo.owner}/${ownerRepo.repo}`,
        owner: ownerRepo.owner,
        repo: ownerRepo.repo,
        githubDescription: tool.description ?? null,
        primaryLanguage: tool.primaryLanguage ?? null,
        stars: 0,
        forks: 0,
        openIssues: 0,
        difficulty: parsed.difficulty,
        category: parsed.category,
        description: parsed.description,
        reasoning: parsed.reasoning,
        techStack: parsed.techStack,
      };

      const problems = validateProjectCandidate(candidateInput);
      if (problems.length > 0) {
        dropped += 1;
        onStep?.(`Dropped cross-registration of "${tool.name}" — missing or invalid fields.`);
        logger.warn("ai_reconciled_project_candidate_dropped", { fullName: tool.fullName, problems });
        continue;
      }

      const candidate = candidateInput as Required<ProjectCandidateInput> & {
        difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
        techStack: { languages: string[]; frameworks: string[]; libraries: string[] };
      };

      const readme = tool.readme ?? (await getReadmeWithCache(env, readmeCache, ownerRepo.owner, ownerRepo.repo));

      await insertDiscoveredProject(supabase, {
        repositoryUrl: candidate.url as string,
        githubOwner: ownerRepo.owner,
        githubRepoName: ownerRepo.repo,
        githubFullName: tool.fullName,
        githubDescription: (candidate.githubDescription as string | null) ?? null,
        readme,
        primaryLanguage: (candidate.primaryLanguage as string | null) ?? null,
        stars: 0,
        forks: 0,
        openIssues: 0,
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
        description: (candidate.description as string).trim(),
        category: candidate.category as string,
        difficulty: candidate.difficulty,
        aiReasoning: `Auto cross-registered from existing open source tool "${tool.name}" already on DevTunnel. ${candidate.reasoning}`,
      });
      // Deliberately NOT bumpCounters(beginner/intermediate/advanced) here:
      // those counters ARE the day's 3/3/1 search quota tracker
      // (db/aiDiscovery.ts PROJECT_QUOTA), and a cross-registered project
      // isn't a "new project found by search" — it must never count
      // against, or shrink, that budget. `exclude` (dedup) is the only
      // state this needs to update for the caller.
      exclude.add(tool.fullName);
      proposed += 1;
      onStep?.(`Saved project ${tool.fullName} (cross-registered from tool "${tool.name}") — pending review.`);
    } catch (err) {
      if (err instanceof GroqQuotaExceededError) {
        logger.warn("ai_project_reconciliation_quota_exceeded", { fullName: tool.fullName, reason: err.reason });
        onStep?.("Today's Groq budget ran out during cross-registration — stopping here.");
        return {
          proposed,
          dropped,
          quotaExceeded: true,
          accountQuotaExceeded: err.reason === "rpd" || err.reason === "tpd",
        };
      }
      logger.warn("ai_project_reconciliation_failed", { fullName: tool.fullName, error: err instanceof Error ? err.message : String(err) });
      onStep?.(`Couldn't cross-register "${tool.name}" — skipping.`);
    }
  }

  return { proposed, dropped, quotaExceeded: false, accountQuotaExceeded: false };
}

/**
 * Phase 0b (runs inside runToolDiscovery, before fresh GitHub search):
 * every published project that isn't ALSO a tool candidate yet gets
 * classified from its own already-known description/README (no new
 * GitHub search) and proposed as a tool. Mutates `exclude` in place;
 * returns how much of the shared tools budget it spent via `proposed` so
 * the caller can shrink its own category loop accordingly.
 */
async function reconcileProjectsMissingAsTools(
  env: ValidatedEnv,
  kv: KVNamespace,
  supabase: ReturnType<typeof getSupabase>,
  readmeCache: ReadmeCache,
  exclude: Set<string>,
  budgetRemaining: number,
  maxToPropose: number | undefined,
  onStep: StepReporter | undefined,
): Promise<ReconciliationResult> {
  let proposed = 0;
  let dropped = 0;

  if (budgetRemaining <= 0) {
    return { proposed, dropped, quotaExceeded: false, accountQuotaExceeded: false };
  }

  onStep?.("Checking whether every project is also registered as an open source tool…");
  const publishedProjects = await listPublishedProjectsForReconciliation(supabase);
  const gaps = publishedProjects.filter((p) => !exclude.has(p.fullName));

  if (gaps.length === 0) {
    onStep?.("Every project is already registered as a tool — nothing to cross-register.");
    return { proposed, dropped, quotaExceeded: false, accountQuotaExceeded: false };
  }

  onStep?.(`Found ${gaps.length} project(s) not yet registered as a tool — cross-registering first.`);

  for (const project of gaps) {
    if (proposed >= budgetRemaining) break;
    if (maxToPropose !== undefined && proposed >= maxToPropose) break;

    const ownerRepo = parseGithubOwnerRepo(project.repositoryUrl) ?? parseGithubOwnerRepo(`https://github.com/${project.fullName}`);
    if (!ownerRepo) continue; // defensive — fullName is only ever built from a URL that already parsed cleanly

    onStep?.(`Cross-registering project "${project.name}" as a tool…`);

    const prompt = `DevTunnel already lists this project in its project catalog. It should
also exist as a tool candidate in the tools catalog. Do NOT search GitHub
or call any tool — classify only from what's given below.

Name: ${project.name}
Repository: https://github.com/${ownerRepo.owner}/${ownerRepo.repo}
Existing description: ${project.description ?? "(none given)"}
Primary language: ${project.primaryLanguage ?? "(unknown)"}
README (may be truncated):
${(project.readme ?? "(no README available)").slice(0, 6000)}

From the material above ONLY (never invent facts not shown here):
1. Pick "category": EXACTLY ONE of these values, whichever fits best —
   never invent a new one: ${JSON.stringify(TOOL_CATEGORIES)}.
2. Write "labels": a few short audience/role labels, e.g. "Backend", "DevOps".
3. Write "description": a SHORT, SIMPLE 1-2 sentence summary of what it does.
4. Write "setupGuide": a SHORT how-to-install-and-use guide, IN BULLET
   POINTS (each bullet its own line starting with "- "), 4-8 bullets total,
   based only on install/usage steps the README actually documents. If the
   README doesn't cover installation, a minimal standard install command
   for that language's package manager is fine — never invent flags or
   steps that aren't standard practice for that ecosystem.
5. Write "reasoning": 1-3 sentences for the admin, noting this tool is the
   project "${project.name}" already on DevTunnel's project catalog, now
   being cross-registered as a tool too.

Every field is required. If you can't confidently fill one in, reply with
{"skip": true} instead of guessing.

Reply with ONLY this JSON and nothing else:
{
  "category": "one of the fixed category values above",
  "labels": ["a few short audience/role labels"],
  "description": "your short, simple 1-2 sentence summary",
  "setupGuide": "- bullet one\\n- bullet two\\n- ...",
  "reasoning": "1-3 sentences for the admin"
}`;

    try {
      const raw = await runGroqAgent(env, kv, RECONCILIATION_SYSTEM_PROMPT, prompt, [], noToolDispatch, "tools");
      const parsed = parseGroqJson<{
        skip?: unknown;
        category?: unknown;
        labels?: unknown;
        description?: unknown;
        setupGuide?: unknown;
        reasoning?: unknown;
      }>(raw);

      if (parsed.skip === true) {
        dropped += 1;
        onStep?.(`Skipped cross-registering "${project.name}" — not enough real material to classify confidently.`);
        continue;
      }

      const candidateInput: ToolCandidateInput = {
        sourceUrl: `https://github.com/${ownerRepo.owner}/${ownerRepo.repo}`,
        name: project.name,
        fetchedDescription: project.description ?? null,
        primaryLanguage: project.primaryLanguage ?? null,
        labels: parsed.labels,
        description: parsed.description,
        setupGuide: parsed.setupGuide,
        reasoning: parsed.reasoning,
      };

      const problems = validateToolCandidate(candidateInput);
      if (problems.length > 0) {
        dropped += 1;
        onStep?.(`Dropped cross-registration of "${project.name}" — missing or invalid fields.`);
        logger.warn("ai_reconciled_tool_candidate_dropped", { fullName: project.fullName, problems });
        continue;
      }

      const category =
        typeof parsed.category === "string" && (TOOL_CATEGORIES as readonly string[]).includes(parsed.category)
          ? parsed.category
          : null;
      if (!category) {
        dropped += 1;
        onStep?.(`Dropped cross-registration of "${project.name}" — invalid category.`);
        logger.warn("ai_reconciled_tool_candidate_dropped", { fullName: project.fullName, problems: ["category"] });
        continue;
      }

      const candidate = candidateInput as Required<ToolCandidateInput> & { sourceUrl: string; name: string };
      const key = candidate.sourceUrl.toLowerCase();
      if (exclude.has(key)) {
        dropped += 1;
        onStep?.(`Skipped ${candidate.name} — already exists or already proposed.`);
        continue;
      }

      const readme = project.readme ?? (await getReadmeWithCache(env, readmeCache, ownerRepo.owner, ownerRepo.repo));

      await insertDiscoveredTool(supabase, {
        sourceUrl: candidate.sourceUrl,
        name: candidate.name,
        fetchedDescription: (candidate.fetchedDescription as string | null) ?? null,
        readme,
        primaryLanguage: (candidate.primaryLanguage as string | null) ?? null,
        category,
        labels: candidate.labels as string[],
        description: (candidate.description as string).trim(),
        setupGuide: (candidate.setupGuide as string).trim(),
        aiReasoning: `Auto cross-registered from existing project "${project.name}" already on DevTunnel. ${candidate.reasoning}`,
      });
      await bumpCounters(supabase, { tools: 1, toolCategory: category });
      exclude.add(project.fullName);
      exclude.add(key);
      proposed += 1;
      onStep?.(`Saved tool ${candidate.name} (cross-registered from project "${project.name}") — pending review.`);
    } catch (err) {
      if (err instanceof GroqQuotaExceededError) {
        logger.warn("ai_tool_reconciliation_quota_exceeded", { fullName: project.fullName, reason: err.reason });
        onStep?.("Today's Groq budget ran out during cross-registration — stopping here.");
        return {
          proposed,
          dropped,
          quotaExceeded: true,
          accountQuotaExceeded: err.reason === "rpd" || err.reason === "tpd",
        };
      }
      logger.warn("ai_tool_reconciliation_failed", { fullName: project.fullName, error: err instanceof Error ? err.message : String(err) });
      onStep?.(`Couldn't cross-register "${project.name}" — skipping.`);
    }
  }

  return { proposed, dropped, quotaExceeded: false, accountQuotaExceeded: false };
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
matching exactly the schema described in the user message.

You have a limited number of conversation turns to finish this task, and each
turn is expensive (rate-limited), so use them efficiently: whenever you need
several pieces of real data, request multiple tool calls together in the same
turn rather than one call per turn. Do not call get_github_repository just to
re-confirm stats (stars, forks, language, description) that
search_github_repositories already gave you for that exact repository —
reuse those values and only call get_github_repository when you need details
it didn't already return. Move on once you have enough real information for
a candidate instead of gathering more than the required fields need.`;

// ---------------------------------------------------------------------------
// Projects — 7/day: 3 beginner, 3 intermediate, 1 advanced.
// ---------------------------------------------------------------------------

async function runProjectDiscovery(
  env: ValidatedEnv,
  kv: KVNamespace,
  readmeCache: ReadmeCache,
  opts: { maxToPropose?: number; onStep?: StepReporter } = {},
): Promise<PhaseDiscoveryResult> {
  const { maxToPropose, onStep } = opts;
  const supabase = getSupabase(env);
  const errors: string[] = [];

  // Point 5: dedup against the real published table AND our own pending/
  // approved queue — never against the manual onboarding drafts table,
  // which this pipeline has no relationship to.
  onStep?.("Loading the list of existing and already-proposed projects…");
  const exclude = await listExistingProjectFullNames(supabase);

  // Step 1 / Point 6 / Phase 0a: register EVERY published tool that isn't
  // already a project as a project — first, and to completion, before
  // today's 3-beginner/3-intermediate/1-advanced search quota is even
  // looked at. This runs regardless of whether that quota is already
  // full for the day, since cross-registration draws from no daily
  // quota of its own (see reconcileToolsMissingAsProjects's own
  // comment). Only `maxToPropose` (a manual admin click's own per-click
  // cap) or a Groq budget exhaustion can stop it early.
  let reconciledProposed = 0;
  let reconciledDropped = 0;
  const reconciliation = await reconcileToolsMissingAsProjects(env, kv, supabase, readmeCache, exclude, maxToPropose, onStep);
  reconciledProposed += reconciliation.proposed;
  reconciledDropped += reconciliation.dropped;
  if (reconciliation.quotaExceeded) {
    return {
      proposed: reconciledProposed,
      dropped: reconciledDropped,
      errors,
      quotaExceeded: true,
      accountQuotaExceeded: reconciliation.accountQuotaExceeded,
    };
  }

  // Whatever cross-registration didn't use of a manual click's own cap
  // is what's left for a fresh search this call.
  const searchBudget = maxToPropose !== undefined ? Math.max(0, maxToPropose - reconciledProposed) : undefined;
  if (searchBudget === 0) {
    onStep?.("Reached this run's project limit via cross-registration — nothing more to do.");
    return { proposed: reconciledProposed, dropped: reconciledDropped, errors, quotaExceeded: false, accountQuotaExceeded: false };
  }

  // Step 2: only now — with every tool already registered as a project —
  // does the day's per-difficulty search quota come into play, and only
  // for genuinely NEW projects the search below is about to find. This
  // quota was untouched by however many tools were just cross-registered
  // above.
  onStep?.("Checking today's project discovery quota…");
  const need = (await getTodayCounters(supabase)).projectsRemaining;
  const totalNeeded = need.beginner + need.intermediate + need.advanced;
  if (totalNeeded === 0) {
    onStep?.("Today's project quota is already full — nothing more to search for.");
    return { proposed: reconciledProposed, dropped: reconciledDropped, errors, quotaExceeded: false, accountQuotaExceeded: false };
  }

  // Mutable per-difficulty budget for the fresh-search insert loop below
  // (it can gate multiple candidates from one Groq response against it).
  const remaining = { ...need };

  // When capped (e.g. the "one project at a time" admin button), only
  // ask the model for as many candidates as we'll actually use.
  const requestCount = Math.min(totalNeeded, searchBudget ?? totalNeeded);

  const prompt = `Find open source GitHub repositories for DevTunnel's project catalog.

Still needed today (overall): ${need.beginner} BEGINNER-friendly, ${need.intermediate} INTERMEDIATE, ${need.advanced} ADVANCED.
${
    searchBudget !== undefined && searchBudget < totalNeeded
      ? `For THIS request specifically, only return ${requestCount} candidate(s) total — whichever difficulty is still most needed above.`
      : ""
  }
"Beginner-friendly" = well-documented, has "good first issue" style labels or a
simple, approachable codebase, moderate star count. "Advanced" = larger,
architecturally complex, requires real domain expertise to contribute to.

IMPORTANT — cover a mix of languages/frameworks, don't default to the same
one every time. If you're returning more than one candidate, each should
generally use a DIFFERENT primary language or framework from the others.
Rotate your search_github_repositories queries across ecosystems like:
- JavaScript/TypeScript: Node.js, React, Next.js, Vue, Angular
- Python: Django, FastAPI, Flask
- Java / Kotlin: Spring Boot, Ktor
- Go
- Rust
- Ruby: Rails
- PHP: Laravel, Symfony
- C# / .NET
- Swift
Build the query around the language/framework you're targeting (e.g.
"language:java spring-boot stars:>100", "language:typescript topic:nextjs
stars:>100", "language:rust stars:>100", "language:python django stars:>100")
instead of repeating the same search every run.

Do NOT propose any of these repositories (already on DevTunnel or already
proposed today) — full_name values, case-insensitive. This is a hint, not
the full list — every candidate you return is still checked against the
complete list before anything is saved, so it's fine if a repo you were
never told about here turns out to be a duplicate:
${JSON.stringify(Array.from(exclude).slice(0, 80))}

For each candidate:
1. Use search_github_repositories to find real candidates — its results
   already include stars, forks, language, and description, so only call
   get_github_repository afterward if you still need something it didn't
   return.
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
Return exactly ${requestCount} candidate(s) total, matching the needed counts per difficulty as closely as possible.`;

  let candidates: ProjectCandidateInput[] = [];
  try {
    onStep?.(`Asking the AI model to find ${requestCount} project candidate${requestCount === 1 ? "" : "s"}…`);
    const dispatch = buildDiscoveryDispatcher(env, readmeCache, onStep);
    const raw = await runGroqAgent(env, kv, SYSTEM_PROMPT, prompt, DISCOVERY_TOOLS, dispatch, "projects");
    const parsed = parseGroqJson<{ candidates: ProjectCandidateInput[] }>(raw);
    candidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
    onStep?.(`AI returned ${candidates.length} candidate${candidates.length === 1 ? "" : "s"} to check.`);
  } catch (err) {
    if (err instanceof GroqQuotaExceededError) {
      // Daily Groq budget is gone — stop here, no candidates were ever
      // produced for this call, so there's nothing to insert. This is
      // not a run-level error (no entry in `errors`); the run summary's
      // own `quotaExceeded` flag is what the frontend surfaces instead.
      logger.warn("ai_project_discovery_quota_exceeded", { reason: err.reason });
      onStep?.(
        err.reason === "rpd" || err.reason === "tpd"
          ? "Today's Groq budget ran out — stopping here."
          : "Today's project discovery budget (25% of the daily Groq budget) ran out — stopping here.",
      );
      return {
        proposed: reconciledProposed,
        dropped: reconciledDropped,
        errors,
        quotaExceeded: true,
        accountQuotaExceeded: err.reason === "rpd" || err.reason === "tpd",
      };
    }
    logger.error("ai_project_discovery_failed", { error: err instanceof Error ? err.message : String(err) });
    errors.push("project_discovery_agent_error");
    onStep?.("The AI model call failed.");
    return { proposed: reconciledProposed, dropped: reconciledDropped, errors, quotaExceeded: false, accountQuotaExceeded: false };
  }

  // `remaining` starts as a fresh copy of today's real per-difficulty
  // quota (untouched by reconciliation above) and is decremented as
  // candidates from THIS Groq response are inserted below, so a second
  // candidate in the same response for an already-filled bucket is still
  // caught.
  let proposed = 0;
  let dropped = 0;

  for (const c of candidates) {
    if (maxToPropose !== undefined && reconciledProposed + proposed >= maxToPropose) break;

    // Point 3: validate the WHOLE record before touching the database.
    // Any problem drops the candidate outright — no partial insert.
    const problems = validateProjectCandidate(c);
    if (problems.length > 0) {
      dropped += 1;
      onStep?.(`Dropped a candidate — missing or invalid fields.`);
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
      onStep?.(`Skipped ${candidate.fullName} — already exists or already proposed.`);
      continue;
    }
    const bucket = candidate.difficulty === "BEGINNER" ? "beginner" : candidate.difficulty === "ADVANCED" ? "advanced" : "intermediate";
    if (remaining[bucket] <= 0) {
      dropped += 1;
      onStep?.(`Skipped ${candidate.fullName} — ${bucket} quota already met today.`);
      continue;
    }

    try {
      onStep?.(`Validated ${candidate.fullName} (${candidate.difficulty}).`);
      // Attach the real README this run already read (or, failing that,
      // fetch it directly) — this is the same content the admin will see
      // once approved (sql/020's approve_ai_discovered_project copies this
      // column straight into devtunnel.projects), so it must be the real
      // thing, never left empty just because the model's JSON reply doesn't
      // carry free text this long.
      const readme = await getReadmeWithCache(env, readmeCache, candidate.owner, candidate.repo);

      onStep?.(`Saving project ${candidate.fullName}…`);
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
      onStep?.(`Saved ${candidate.fullName} — pending review.`);
    } catch (err) {
      // A unique-index race (already onboarded/proposed between our
      // exclude-set read and this insert) is expected and non-fatal —
      // skip and keep going, never let one candidate abort the run.
      onStep?.(`Couldn't save ${candidate.fullName} — skipping.`);
      logger.warn("ai_project_insert_skipped", { fullName: candidate.fullName, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    proposed: reconciledProposed + proposed,
    dropped: reconciledDropped + dropped,
    errors,
    quotaExceeded: false,
    accountQuotaExceeded: false,
  };
}
// ---------------------------------------------------------------------------
// Tools — 7/day, drawn from a shuffled subset of TOOL_CATEGORIES (see
// db/aiDiscovery.ts's getTodayCounters) so which 7 of the categories get
// a tool varies day to day, one tool per chosen category.
// ---------------------------------------------------------------------------

async function runToolDiscovery(
  env: ValidatedEnv,
  kv: KVNamespace,
  readmeCache: ReadmeCache,
  opts: { maxToPropose?: number; onStep?: StepReporter } = {},
): Promise<PhaseDiscoveryResult> {
  const { maxToPropose, onStep } = opts;
  const supabase = getSupabase(env);
  const errors: string[] = [];
  onStep?.("Checking today's tool discovery quota…");
  let counters = await getTodayCounters(supabase);
  if (counters.toolCategoriesRemaining.length === 0) {
    onStep?.("Today's tool quota (7) is already used up — nothing more to do until it resets.");
    return { proposed: 0, dropped: 0, errors, quotaExceeded: false, accountQuotaExceeded: false };
  }

  // Point 5: dedup against the real published table AND our own pending/
  // approved queue — never against the manual onboarding drafts table.
  onStep?.("Loading the list of existing and already-proposed tools…");
  const exclude = await listExistingToolUrls(supabase);

  // Point 6 / Phase 0b: close the project→tool gap FIRST, before spending
  // any budget on a fresh GitHub search. Reconciliation draws from the
  // exact same shared daily tools budget (TOOL_DAILY_QUOTA, 7/day) the
  // category loop below also draws from — `counters.toolCategoriesRemaining
  // .length` is already capped to whatever's left of that shared budget
  // today (see getTodayCounters in db/aiDiscovery.ts).
  let reconciledProposed = 0;
  let reconciledDropped = 0;
  const reconciliation = await reconcileProjectsMissingAsTools(
    env,
    kv,
    supabase,
    readmeCache,
    exclude,
    counters.toolCategoriesRemaining.length,
    maxToPropose,
    onStep,
  );
  reconciledProposed += reconciliation.proposed;
  reconciledDropped += reconciliation.dropped;
  if (reconciliation.quotaExceeded) {
    return {
      proposed: reconciledProposed,
      dropped: reconciledDropped,
      errors,
      quotaExceeded: true,
      accountQuotaExceeded: reconciliation.accountQuotaExceeded,
    };
  }

  // Reconciliation spends out of the same shared counters row (via
  // bumpCounters), so re-read it before deciding which categories are
  // still genuinely open today — otherwise the loop below could re-walk
  // ground reconciliation already claimed, or overshoot the daily cap.
  if (reconciledProposed > 0) {
    onStep?.("Re-checking today's tool quota after cross-registration…");
    counters = await getTodayCounters(supabase);
  }

  const searchBudget = maxToPropose !== undefined ? Math.max(0, maxToPropose - reconciledProposed) : undefined;
  if (counters.toolCategoriesRemaining.length === 0 || searchBudget === 0) {
    onStep?.(
      counters.toolCategoriesRemaining.length === 0
        ? "Today's tool quota is now full after cross-registration — nothing more to do."
        : "Reached this run's tool limit via cross-registration — nothing more to do.",
    );
    return { proposed: reconciledProposed, dropped: reconciledDropped, errors, quotaExceeded: false, accountQuotaExceeded: false };
  }

  // When capped (e.g. the "add one tool at a time" admin button), only
  // walk as many categories as we'll actually use.
  const categories =
    searchBudget !== undefined ? counters.toolCategoriesRemaining.slice(0, searchBudget) : counters.toolCategoriesRemaining;

  let proposed = 0;
  let dropped = 0;
  let quotaExceeded = false;
  let accountQuotaExceeded = false;

  // One category at a time, fully finished (proposed/dropped/inserted)
  // before the next category's conversation even starts — this phase
  // itself only ever begins once project discovery has fully finished
  // (see runDailyDiscovery), so nothing here overlaps with another
  // phase's work either.
  for (const category of categories) {
    if (maxToPropose !== undefined && reconciledProposed + proposed >= maxToPropose) break;
    onStep?.(`Looking for a tool in category: ${category}`);
    const prompt = `Find ONE excellent open source developer tool for DevTunnel's tools
catalog in this exact category: "${category}".

Don't default to searching only Python (or only one ecosystem) — plenty of
strong tools in this category are written in Java/Kotlin, Go, Rust,
TypeScript/JavaScript, Ruby, PHP, C#/.NET, etc. Pick whichever
language/ecosystem is genuinely a leading example for THIS category, and
build your search_github_repositories query around it (e.g.
"language:go topic:${(category.split(" ")[0] ?? category).toLowerCase()} stars:>100",
"language:java spring-boot stars:>100", "language:typescript stars:>100") —
vary it run to run instead of repeating the same query.

Do NOT propose any of these tool URLs (already listed or already proposed
today). This is a hint, not the full list — every candidate is still
checked against the complete list before anything is saved:
${JSON.stringify(Array.from(exclude).slice(0, 80))}

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
      onStep?.(`Asking the AI model for a tool in "${category}"…`);
      const dispatch = buildDiscoveryDispatcher(env, readmeCache, onStep);
      const raw = await runGroqAgent(env, kv, SYSTEM_PROMPT, prompt, DISCOVERY_TOOLS, dispatch, "tools");
      const candidateRaw = parseGroqJson<ToolCandidateInput>(raw);

      const problems = validateToolCandidate(candidateRaw);
      if (problems.length > 0) {
        dropped += 1;
        onStep?.(`Dropped the "${category}" candidate — missing or invalid fields.`);
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
        onStep?.(`Skipped ${candidate.name} — already exists or already proposed.`);
        continue;
      }
      exclude.add(key);
      onStep?.(`Validated ${candidate.name} for "${category}".`);

      // Same real-README attachment as projects: prefer what this
      // conversation already fetched, fall back to a direct fetch. Only
      // attempted for github.com sources — a tool's sourceUrl doesn't
      // have to be GitHub-hosted, and this pipeline never guesses.
      const ownerRepo = parseGithubOwnerRepo(candidate.sourceUrl);
      const readme = ownerRepo ? await getReadmeWithCache(env, readmeCache, ownerRepo.owner, ownerRepo.repo) : null;

      onStep?.(`Saving tool ${candidate.name}…`);
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
      onStep?.(`Saved ${candidate.name} — pending review.`);
    } catch (err) {
      if (err instanceof GroqQuotaExceededError) {
        // Daily Groq budget is gone mid-loop — stop trying further
        // categories this run (they'd all fail the same way) rather than
        // burning a run-level "error" entry per remaining category.
        logger.warn("ai_tool_discovery_quota_exceeded", { category, reason: err.reason });
        accountQuotaExceeded = err.reason === "rpd" || err.reason === "tpd";
        onStep?.(
          accountQuotaExceeded
            ? "Today's Groq budget ran out — stopping here."
            : "Today's tool discovery budget (25% of the daily Groq budget) ran out — stopping here.",
        );
        quotaExceeded = true;
        break;
      }
      logger.error("ai_tool_discovery_failed", { category, error: err instanceof Error ? err.message : String(err) });
      onStep?.(`Couldn't find a tool for "${category}" this time.`);
      errors.push(`tool_discovery_failed:${category}`);
    }
  }

  return {
    proposed: reconciledProposed + proposed,
    dropped: reconciledDropped + dropped,
    errors,
    quotaExceeded,
    accountQuotaExceeded,
  };
}

// ---------------------------------------------------------------------------
// Tasks — every open issue worth surfacing, across every onboarded project.
// No numeric daily cap (per spec: "address all the issues that are
// related to projects that are in devtunnel"), but still deduplicated and
// run with a sane per-project ceiling so one huge repo can't blow the
// Groq/GitHub budget for the day.
//
// Two product rules layered on top of that:
//
// 1. Budget priority — task/issue discovery must NOT spend a single Groq
//    call until the projects phase AND the tools phase are each done for
//    the day: either today's quota target is already met (PROJECT_QUOTA /
//    TOOL_DAILY_QUOTA in db/aiDiscovery.ts) or that phase has spent at
//    least 75% of its own daily Groq share (see getPhaseBudgetShares in
//    groqQuota.ts, and TASKS_UNLOCK_BUDGET_THRESHOLD below). Projects and
//    tools always get first claim on the day's budget; tasks only ever
//    picks up what's left once both of those are done. Enforced by
//    `isTasksBudgetUnlocked` below, checked
//    once at the very start of every run (scoped button click OR daily
//    cron) — never mid-loop, since the gate is about WHETHER tasks should
//    run at all today, not a per-request quota check (that part is still
//    handled by reserveGroqRequest/GroqQuotaExceededError as before).
//    Checking budget exhaustion alone isn't enough: a phase's quota is
//    almost always hit using only a fraction of its 25% budget share, so
//    waiting for that share to reach zero would leave tasks locked out of
//    budget that's genuinely just sitting unused for the rest of the day.
//
// 2. Shuffled project order — every run walks onboarded projects in a
//    freshly randomized order (see `shuffled` below) rather than
//    always starting from the same project. Without this, a single
//    "Add AI issue" click (maxToPropose = 1) would keep draining the
//    same first project's issues run after run before ever touching the
//    others; shuffling spreads new tasks across every onboarded project
//    over time instead of exhausting one before moving to the next.
// ---------------------------------------------------------------------------

const MAX_ISSUES_PER_PROJECT = 15;

/**
 * Fisher-Yates shuffle — never mutates the input array.
 *
 * Uses a temp variable instead of array-destructuring swap
 * (`[a[i], a[j]] = [a[j], a[i]]`) so this type-checks cleanly under
 * `noUncheckedIndexedAccess` for a generic `T[]` — indexed reads on a
 * generic array are typed `T`, but TS can't always carry that through a
 * destructuring assignment target on the left of `=`, which was flagged
 * as a pre-existing (harmless at runtime, but noisy under strict
 * indexing) quirk. Kept as its own local copy — not imported from
 * db/aiDiscovery.ts's identical helper — since that module is
 * deliberately framework-agnostic and free of lib/ imports.
 */
function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j] as T;
    copy[j] = tmp as T;
  }
  return copy;
}

/**
 * Task discovery's own daily quota gate: unlock once each of the
 * projects/tools phases is "done enough" for the day — per product
 * direction, that means either phase's daily quota target is already
 * met (PROJECT_QUOTA / TOOL_DAILY_QUOTA in db/aiDiscovery.ts) OR that
 * phase has spent at least 75% of its own daily Groq budget share (see
 * `isPhaseBudgetMostlySpent` in groqQuota.ts) — NOT the full 100%.
 */
const TASKS_UNLOCK_BUDGET_THRESHOLD = 0.75;

/**
 * True once BOTH the projects phase and the tools phase are "done" for
 * the day by the definition above — the gate task discovery must clear
 * before it's allowed to spend a single Groq call today.
 *
 * Checking budget exhaustion at 100% (the original behavior) was wrong:
 * each phase's daily quota (7 projects, 7 tools) is almost always
 * satisfied using only a small slice of that phase's 25%-of-daily-budget
 * share (see the admin quota panel — 209/225 requests still left after
 * hitting today's project quota, in one real run). Waiting for that
 * remaining budget to hit zero meant tasks stayed locked essentially
 * forever. Counting "quota met" as done fixes most of that, but the 75%
 * threshold below also lets tasks unlock even on a day where a phase's
 * quota genuinely isn't met yet but it's already burned through most of
 * its share — instead of insisting on either "fully done" or "fully
 * spent" before tasks get a turn.
 */
async function isTasksBudgetUnlocked(
  kv: KVNamespace,
  counters: Pick<AiDiscoveryCounters, "projectsRemaining" | "toolCategoriesRemaining">,
): Promise<boolean> {
  const snapshot = await getGroqQuotaSnapshot(kv);
  const projectsPhase = snapshot.phases.find((p) => p.phase === "projects");
  const toolsPhase = snapshot.phases.find((p) => p.phase === "tools");
  // Fail closed: if either phase's entry is somehow missing, treat tasks
  // as still locked rather than risk running early.
  if (!projectsPhase || !toolsPhase) return false;

  const projectsQuotaMet =
    counters.projectsRemaining.beginner === 0 &&
    counters.projectsRemaining.intermediate === 0 &&
    counters.projectsRemaining.advanced === 0;
  const toolsQuotaMet = counters.toolCategoriesRemaining.length === 0;

  const projectsDone = projectsQuotaMet || isPhaseBudgetMostlySpent(projectsPhase, TASKS_UNLOCK_BUDGET_THRESHOLD);
  const toolsDone = toolsQuotaMet || isPhaseBudgetMostlySpent(toolsPhase, TASKS_UNLOCK_BUDGET_THRESHOLD);

  return projectsDone && toolsDone;
}

async function runTaskDiscovery(
  env: ValidatedEnv,
  kv: KVNamespace,
  opts: { maxToPropose?: number; onStep?: StepReporter } = {},
): Promise<PhaseDiscoveryResult> {
  const { maxToPropose, onStep } = opts;
  const supabase = getSupabase(env);
  const errors: string[] = [];
  let proposed = 0;
  let dropped = 0;
  let quotaExceeded = false;
  let accountQuotaExceeded = false;

  onStep?.("Checking whether today's Projects and Tools discovery is done…");
  const todaysCounters = await getTodayCounters(supabase);
  const unlocked = await isTasksBudgetUnlocked(kv, todaysCounters);
  if (!unlocked) {
    onStep?.(
      "Task discovery is on hold — it only runs once today's Projects and Tools targets are met or 75% of their Groq budget is spent.",
    );
    return { proposed: 0, dropped: 0, errors, quotaExceeded: false, accountQuotaExceeded: false };
  }

  onStep?.("Loading onboarded projects…");
  const projects = shuffled(await listOnboardedProjects(supabase));
  onStep?.(`Found ${projects.length} onboarded project${projects.length === 1 ? "" : "s"} to check for issues.`);

  // Every onboarded project, in a freshly shuffled order each run (see
  // the module comment above) — one project fully finished before the
  // next starts within this call, but WHICH project goes first varies
  // run to run so issues get spread across the whole catalog instead of
  // always draining the same project first.
  for (const project of projects) {
    if (maxToPropose !== undefined && proposed >= maxToPropose) break;
    try {
      onStep?.(`Checking ${project.githubFullName} for open issues…`);
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

      onStep?.(`Asking the AI model to review issues on ${project.githubFullName}…`);
      const dispatch = buildDiscoveryDispatcher(env, undefined, onStep);
      const raw = await runGroqAgent(env, kv, SYSTEM_PROMPT, prompt, DISCOVERY_TOOLS, dispatch, "tasks");
      const parsed = parseGroqJson<{ candidates: TaskCandidateInput[] }>(raw);
      const candidates = Array.isArray(parsed.candidates) ? parsed.candidates.slice(0, MAX_ISSUES_PER_PROJECT) : [];
      onStep?.(`AI returned ${candidates.length} candidate issue${candidates.length === 1 ? "" : "s"} for ${project.githubFullName}.`);

      for (const c of candidates) {
        if (maxToPropose !== undefined && proposed >= maxToPropose) break;

        const problems = validateTaskCandidate(c);
        if (problems.length > 0) {
          dropped += 1;
          onStep?.(`Dropped an issue candidate — missing or invalid fields.`);
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
          onStep?.(`Skipped issue #${candidate.issueNumber} — already tracked.`);
          continue;
        }

        try {
          onStep?.(`Validated issue #${candidate.issueNumber}: ${candidate.title}`);
          onStep?.(`Saving task for issue #${candidate.issueNumber}…`);
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
          onStep?.(`Saved issue #${candidate.issueNumber} from ${project.githubFullName} — pending review.`);
        } catch (err) {
          onStep?.(`Couldn't save issue #${candidate.issueNumber} — skipping.`);
          logger.warn("ai_task_insert_skipped", { project: project.githubFullName, issueNumber: candidate.issueNumber, error: err instanceof Error ? err.message : String(err) });
        }
      }
    } catch (err) {
      if (err instanceof GroqQuotaExceededError) {
        // Daily Groq budget is gone mid-loop — stop walking further
        // projects this run (they'd all fail the same way) rather than
        // burning a run-level "error" entry per remaining project.
        logger.warn("ai_task_discovery_quota_exceeded", { project: project.githubFullName, reason: err.reason });
        accountQuotaExceeded = err.reason === "rpd" || err.reason === "tpd";
        onStep?.(
          accountQuotaExceeded
            ? "Today's Groq budget ran out — stopping here."
            : "Today's issue/task discovery budget (50% of the daily Groq budget) ran out — stopping here.",
        );
        quotaExceeded = true;
        break;
      }
      logger.error("ai_task_discovery_failed", { project: project.githubFullName, error: err instanceof Error ? err.message : String(err) });
      onStep?.(`Couldn't check ${project.githubFullName} this time.`);
      errors.push(`task_discovery_failed:${project.githubFullName}`);
    }
  }

  // Ran the full (shuffled) project list, hit no Groq quota wall, and
  // still came away with nothing new to propose — every open issue
  // across every onboarded project is either already tracked or didn't
  // qualify, so say so plainly rather than leaving the log looking like
  // it silently did nothing.
  if (proposed === 0 && !quotaExceeded && errors.length === 0) {
    onStep?.("No issues found — all issues are addressed.");
  }

  return { proposed, dropped, errors, quotaExceeded, accountQuotaExceeded };
}

// ---------------------------------------------------------------------------
// Entry point — called by the daily cron trigger and by the manual
// POST /admin/ai/run endpoint. Runs all three phases strictly one at a
// time, in this order: projects -> tools -> tasks. Each phase
// runs fully to completion — including every item inside it, one at a
// time — before the next phase starts. One phase failing never aborts
// the others (each is wrapped in its own .catch below).
// ---------------------------------------------------------------------------
export async function runDailyDiscovery(env: ValidatedEnv, kv: KVNamespace): Promise<AiDiscoveryRunSummary> {
  const errors: string[] = [];
  logger.info("ai_discovery_run_started");

  // Per product direction, the shared daily Groq budget is split
  // 25% projects / 25% tools / 50% tasks (groqQuota.ts
  // getPhaseBudgetShares, default 25/25/50) — and projects+tools' combined half is spent
  // BEFORE tasks/issues ever gets a turn, never the other way around.
  // That's why the run order below is projects -> tools -> tasks (it
  // used to be tasks first) — every project and tool candidate this run
  // can produce is attempted, one phase fully finished before the next
  // starts, before a single issue is looked at.
  //
  // A phase running out of ITS OWN 25%/25%/50% share (accountQuotaExceeded
  // === false) only stops that one phase — it must never block a later
  // phase's separate share, since each phase's budget is tracked
  // independently in groqQuota.ts. Only a genuine account-wide
  // exhaustion (accountQuotaExceeded === true — the whole Groq key has
  // nothing left for anyone today) short-circuits the phases after it.
  //
  // runTaskDiscovery (called below) additionally self-gates: even once
  // it's this run's turn, it does nothing until BOTH the projects and
  // tools phases are done for the day — quota target met or budget
  // exhausted, whichever comes first (`isTasksBudgetUnlocked`) — so on a
  // typical day, once projects/tools hit their daily quota this same run
  // goes on to also pick up tasks/issues with whatever budget share is
  // left over, rather than leaving it unused until that share hits zero.
  const readmeCache: ReadmeCache = new Map();

  const projectsResult = await runProjectDiscovery(env, kv, readmeCache).catch((err) => {
    errors.push("project_discovery_crashed");
    logger.error("ai_discovery_project_phase_crashed", { error: err instanceof Error ? err.message : String(err) });
    return { proposed: 0, dropped: 0, errors: [], quotaExceeded: false, accountQuotaExceeded: false };
  });

  const toolsResult = projectsResult.accountQuotaExceeded
    ? { proposed: 0, dropped: 0, errors: [] as string[], quotaExceeded: true, accountQuotaExceeded: true }
    : await runToolDiscovery(env, kv, readmeCache).catch((err) => {
        errors.push("tool_discovery_crashed");
        logger.error("ai_discovery_tool_phase_crashed", { error: err instanceof Error ? err.message : String(err) });
        return { proposed: 0, dropped: 0, errors: [], quotaExceeded: false, accountQuotaExceeded: false };
      });

  const tasksResult =
    projectsResult.accountQuotaExceeded || toolsResult.accountQuotaExceeded
      ? { proposed: 0, dropped: 0, errors: [] as string[], quotaExceeded: true, accountQuotaExceeded: true }
      : await runTaskDiscovery(env, kv).catch((err) => {
          errors.push("task_discovery_crashed");
          logger.error("ai_discovery_task_phase_crashed", { error: err instanceof Error ? err.message : String(err) });
          return { proposed: 0, dropped: 0, errors: [], quotaExceeded: false, accountQuotaExceeded: false };
        });

  const summary: AiDiscoveryRunSummary = {
    date: new Date().toISOString().slice(0, 10),
    projectsProposed: projectsResult.proposed,
    toolsProposed: toolsResult.proposed,
    tasksProposed: tasksResult.proposed,
    candidatesDropped: projectsResult.dropped + toolsResult.dropped + tasksResult.dropped,
    errors: [...errors, ...projectsResult.errors, ...toolsResult.errors, ...tasksResult.errors],
    groqQuotaExceeded: projectsResult.quotaExceeded || toolsResult.quotaExceeded || tasksResult.quotaExceeded,
  };

  logger.info("ai_discovery_run_finished", summary as unknown as Record<string, unknown>);
  return summary;
}

/**
 * Scoped entry point — runs ONLY the project-discovery phase, for the
 * "Add AI project" button on the AI Added Projects admin page
 * (devtunnel-frontend .../ai/projects). Shares the same daily quota and
 * dedup logic as runDailyDiscovery, so it's safe to call repeatedly —
 * it only ever fills whatever's left of today's project quota. Tools
 * and tasks are left untouched.
 *
 * `limit` caps how many projects a single call may propose — the admin
 * button calls this with the default of 1 so each click adds exactly one
 * project at a time (cross-registering a missing tool first if one is
 * waiting, per the reconciliation pass in runProjectDiscovery above),
 * streaming its progress through `onStep` as it goes (see
 * routes/admin/ai.ts's `POST /admin/ai/projects/run` SSE handler).
 */
export async function runProjectDiscoveryOnly(
  env: ValidatedEnv,
  kv: KVNamespace,
  onStep?: StepReporter,
  limit = 1,
): Promise<AiDiscoveryRunSummary> {
  logger.info("ai_discovery_projects_run_started");
  const readmeCache: ReadmeCache = new Map();
  const projectsResult = await runProjectDiscovery(env, kv, readmeCache, { maxToPropose: limit, onStep }).catch((err) => {
    logger.error("ai_discovery_project_phase_crashed", { error: err instanceof Error ? err.message : String(err) });
    onStep?.("Something went wrong during project discovery.");
    return { proposed: 0, dropped: 0, errors: ["project_discovery_crashed"], quotaExceeded: false, accountQuotaExceeded: false };
  });

  const summary: AiDiscoveryRunSummary = {
    date: new Date().toISOString().slice(0, 10),
    projectsProposed: projectsResult.proposed,
    toolsProposed: 0,
    tasksProposed: 0,
    candidatesDropped: projectsResult.dropped,
    errors: projectsResult.errors,
    groqQuotaExceeded: projectsResult.quotaExceeded,
  };

  logger.info("ai_discovery_projects_run_finished", summary as unknown as Record<string, unknown>);
  return summary;
}

/**
 * Scoped entry point — runs ONLY the tool-discovery phase, for the
 * "Add AI tool" button on the AI Added Tools admin page
 * (devtunnel-frontend .../ai/tools). Same quota/dedup guarantees as
 * runProjectDiscoveryOnly above, mirrored for tools (including its own
 * project→tool reconciliation pass, see runToolDiscovery above) —
 * `limit` (default 1) caps how many tools a single call may propose, and
 * `onStep` streams live progress.
 */
export async function runToolDiscoveryOnly(
  env: ValidatedEnv,
  kv: KVNamespace,
  onStep?: StepReporter,
  limit = 1,
): Promise<AiDiscoveryRunSummary> {
  logger.info("ai_discovery_tools_run_started");
  const readmeCache: ReadmeCache = new Map();
  const toolsResult = await runToolDiscovery(env, kv, readmeCache, { maxToPropose: limit, onStep }).catch((err) => {
    logger.error("ai_discovery_tool_phase_crashed", { error: err instanceof Error ? err.message : String(err) });
    onStep?.("Something went wrong during tool discovery.");
    return { proposed: 0, dropped: 0, errors: ["tool_discovery_crashed"], quotaExceeded: false, accountQuotaExceeded: false };
  });

  const summary: AiDiscoveryRunSummary = {
    date: new Date().toISOString().slice(0, 10),
    projectsProposed: 0,
    toolsProposed: toolsResult.proposed,
    tasksProposed: 0,
    candidatesDropped: toolsResult.dropped,
    errors: toolsResult.errors,
    groqQuotaExceeded: toolsResult.quotaExceeded,
  };

  logger.info("ai_discovery_tools_run_finished", summary as unknown as Record<string, unknown>);
  return summary;
}

/**
 * Scoped entry point — runs ONLY the task-discovery phase, for the
 * "Add AI issue" button on the AI Added Tasks admin page
 * (devtunnel-frontend .../ai/tasks). Walks every onboarded project's
 * open issues, in a freshly shuffled order each call (see
 * `shuffled`/module comment above), one project at a time — no daily
 * quota of its own to share, just per-project dedup, so it's safe to
 * call repeatedly. Projects and tools are left untouched. `limit`
 * (default 1) stops the walk as soon as that many issues have been
 * proposed, and `onStep` streams live progress as each project is
 * checked.
 *
 * Gated by `isTasksBudgetUnlocked`: this call does nothing (proposes 0,
 * no error) until today's Projects AND Tools phases are both done — quota
 * met or at least 75% of that phase's budget spent — the admin page's
 * step log explains the hold when that happens. If every onboarded
 * project's issues are already tracked or none qualify, the step log
 * says so explicitly ("No issues found —
 * all issues are addressed.") instead of silently returning nothing.
 */
export async function runTaskDiscoveryOnly(
  env: ValidatedEnv,
  kv: KVNamespace,
  onStep?: StepReporter,
  limit = 1,
): Promise<AiDiscoveryRunSummary> {
  logger.info("ai_discovery_tasks_run_started");
  const tasksResult = await runTaskDiscovery(env, kv, { maxToPropose: limit, onStep }).catch((err) => {
    logger.error("ai_discovery_task_phase_crashed", { error: err instanceof Error ? err.message : String(err) });
    onStep?.("Something went wrong during issue discovery.");
    return { proposed: 0, dropped: 0, errors: ["task_discovery_crashed"], quotaExceeded: false, accountQuotaExceeded: false };
  });

  const summary: AiDiscoveryRunSummary = {
    date: new Date().toISOString().slice(0, 10),
    projectsProposed: 0,
    toolsProposed: 0,
    tasksProposed: tasksResult.proposed,
    candidatesDropped: tasksResult.dropped,
    errors: tasksResult.errors,
    groqQuotaExceeded: tasksResult.quotaExceeded,
  };

  logger.info("ai_discovery_tasks_run_finished", summary as unknown as Record<string, unknown>);
  return summary;
}

export { TOOL_CATEGORIES, PROJECT_CATEGORIES };
export type { StepReporter };