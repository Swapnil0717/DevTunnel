import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { detectProjects, type DetectedProject, type TestStep } from "./testRunners";

/**
 * `dev test` used to guess what to run from `package.json` scripts, a
 * `Cargo.toml`, and so on. On an unfamiliar repository the guess can differ
 * from what the project actually checks, so this reads the project's own
 * GitHub Actions workflows (`.github/workflows/*.yml`) and runs the install /
 * lint / typecheck / test / build commands found there instead.
 *
 * This is deliberately a small line-based reader, not a YAML parser (the CLI
 * has no YAML dependency). It understands the common shapes —
 * `- run: cmd`, `run: |` blocks, step- and job-level `working-directory` —
 * and quietly skips anything it can't be sure about:
 *
 *  - steps using an action (`uses:`) rather than `run:`;
 *  - commands that reference GitHub expressions (`${{ ... }}`, matrix values,
 *    secrets) or `$GITHUB_*` variables — they only mean something on GitHub's
 *    runners;
 *  - commands that look like they publish, deploy, upload, call the network
 *    or need elevated rights (see DENY below) — `dev test` runs on your own
 *    machine and must not do any of that;
 *  - anything that isn't an install / lint / typecheck / test / build step.
 *
 * Where nothing usable is found for a directory, `dev test` falls back to the
 * original auto-detection for it, so this can only add information.
 */

/** A command is only run if it looks like one of these. */
const INSTALL = /^(npm\s+(ci|install|i)\b|yarn(\s+install)?(\s|$)|pnpm\s+(install|i)\b|pip3?\s+install\b|python3?\s+-m\s+pip\s+install\b|poetry\s+install\b|bundle\s+install\b|composer\s+install\b|go\s+mod\s+download\b)/i;
const LINT = /\b(lint|eslint|ruff|flake8|pylint|black\s+--check|prettier\s+--check|clippy|fmt\s+--check|rubocop|golangci-lint)\b/i;
const TYPECHECK = /\b(typecheck|type-check|tsc|mypy|pyright)\b/i;
const TEST = /\b(test|tests|pytest|jest|vitest|mocha|rspec|unittest|go\s+test|cargo\s+test|mvn\s+(-\S+\s+)*(test|verify)|gradlew?\s+(-\S+\s+)*(test|check))\b/i;
const BUILD = /\b(build|compile|cargo\s+build|go\s+build|go\s+vet|mvn\s+(-\S+\s+)*(package|compile)|gradlew?\s+(-\S+\s+)*(build|assemble))\b/i;

/** Never run on a contributor's machine, whatever the workflow says. */
const DENY = /(\$\{\{|\$GITHUB_|\$RUNNER_|\bsecrets\.|\bsudo\b|\brm\s+-|\bdeploy|\bpublish|\brelease\b|\bdocker\b|\bkubectl\b|\bterraform\b|\baws\b|\bgcloud\b|\baz\s|\bssh\b|\bscp\b|\bcurl\b|\bwget\b|\bgh\s|\bgit\s+(push|tag|commit|config)|\bcodecov|\bcoveralls|\bupload|\bapt(-get)?\b|\bbrew\b|\bchoco\b|\bwinget\b|\bnpx\s+(semantic-release|changeset)|\bsemantic-release\b)/i;

const MAX_STEPS_PER_DIR = 12;

function classify(command: string): string | null {
  const c = command.trim();
  if (INSTALL.test(c)) return "install";
  if (LINT.test(c)) return "lint";
  if (TYPECHECK.test(c)) return "typecheck";
  if (TEST.test(c)) return "test";
  if (BUILD.test(c)) return "build";
  return null;
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function unquote(value: string): string {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

interface RawStep {
  run: string;
  workingDirectory: string | null;
}

/** Pulls every `run:` step out of one workflow file's text. */
function extractRunSteps(text: string): RawStep[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: RawStep[] = [];

  for (let i = 0; i < lines.length; i++) {
    const stepsMatch = lines[i]!.match(/^(\s*)steps:\s*$/);
    if (!stepsMatch) continue;
    const stepsIndent = stepsMatch[1]!.length;

    // Job-level default: `defaults: { run: { working-directory: x } }` sits
    // among the job's keys before `steps:`.
    let jobDefaultDir: string | null = null;
    for (let b = i - 1; b >= 0; b--) {
      const line = lines[b]!;
      if (line.trim() === "" || line.trim().startsWith("#")) continue;
      if (indentOf(line) < stepsIndent) break;
      const wd = line.match(/^\s*working-directory:\s*(\S.*)$/);
      if (wd && indentOf(line) > stepsIndent) jobDefaultDir = unquote(wd[1]!);
    }

    // Find where the list of steps ends and where each step starts.
    let itemIndent = -1;
    let j = i + 1;
    const stepStarts: number[] = [];
    let end = lines.length;
    for (; j < lines.length; j++) {
      const line = lines[j]!;
      if (line.trim() === "" || line.trim().startsWith("#")) continue;
      const ind = indentOf(line);
      if (itemIndent === -1) {
        if (!line.trimStart().startsWith("- ")) { end = j; break; }
        itemIndent = ind;
      }
      if (ind < itemIndent) { end = j; break; }
      if (ind === itemIndent && line.trimStart().startsWith("- ")) stepStarts.push(j);
    }
    if (itemIndent === -1) continue;

    for (let k = 0; k < stepStarts.length; k++) {
      const from = stepStarts[k]!;
      const to = k + 1 < stepStarts.length ? stepStarts[k + 1]! : end;
      const chunk = lines.slice(from, to);
      const keyIndent = itemIndent + 2;

      let run: string | null = null;
      let workingDirectory: string | null = null;

      for (let c = 0; c < chunk.length; c++) {
        // `- run: x` puts the first key on the dash line; normalise it.
        const raw = c === 0 ? " ".repeat(itemIndent) + "  " + chunk[0]!.trimStart().slice(2) : chunk[c]!;
        if (indentOf(raw) !== keyIndent) continue;
        const kv = raw.trim().match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (!kv) continue;
        const [, key, value] = kv as unknown as [string, string, string];

        if (key === "working-directory") workingDirectory = unquote(value);
        if (key === "run") {
          if (/^[|>][+-]?\s*$/.test(value.trim())) {
            const block: string[] = [];
            for (let r = c + 1; r < chunk.length; r++) {
              const bl = chunk[r]!;
              if (bl.trim() === "") { block.push(""); continue; }
              if (indentOf(bl) <= keyIndent) break;
              block.push(bl.trim());
            }
            run = block.join("\n");
          } else {
            run = unquote(value);
          }
        }
      }

      if (run && run.trim()) out.push({ run, workingDirectory: workingDirectory ?? jobDefaultDir });
    }
  }
  return out;
}

/** One shell command per logical line, joining `\` continuations and dropping comments/blank lines. */
function splitCommands(run: string): string[] {
  const joined = run.replace(/\\\n\s*/g, " ");
  return joined
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

function shellStep(label: string, command: string): TestStep {
  return process.platform === "win32"
    ? { label, command: "cmd.exe", args: ["/d", "/s", "/c", command] }
    : { label, command: "sh", args: ["-c", command] };
}

/** Projects built from the repo's GitHub Actions workflows, one per working directory. */
export function detectCiProjects(rootDir: string): DetectedProject[] {
  const workflowsDir = join(rootDir, ".github", "workflows");
  if (!existsSync(workflowsDir)) return [];

  let files: string[];
  try {
    files = readdirSync(workflowsDir)
      .filter((f) => /\.ya?ml$/i.test(f))
      .sort();
  } catch {
    return [];
  }

  const byDir = new Map<string, { steps: TestStep[]; seen: Set<string>; sources: Set<string> }>();

  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(join(workflowsDir, file), "utf8");
    } catch {
      continue;
    }

    for (const step of extractRunSteps(text)) {
      // A working directory must stay inside the repo.
      const dir = resolve(rootDir, step.workingDirectory ?? ".");
      const rel = relative(rootDir, dir);
      if (rel.startsWith("..") || resolve(rootDir, rel) !== dir) continue;
      if (!existsSync(dir)) continue;

      for (const command of splitCommands(step.run)) {
        if (DENY.test(command)) continue;
        const label = classify(command);
        if (!label) continue;

        const entry = byDir.get(dir) ?? { steps: [], seen: new Set<string>(), sources: new Set<string>() };
        byDir.set(dir, entry);
        if (entry.seen.has(command) || entry.steps.length >= MAX_STEPS_PER_DIR) continue;
        entry.seen.add(command);
        entry.steps.push(shellStep(label, command));
        entry.sources.add(`.github/workflows/${file}`);
      }
    }
  }

  const projects: DetectedProject[] = [];
  for (const [dir, entry] of byDir) {
    // A directory whose only found step is an install isn't worth running on its own.
    if (entry.steps.every((s) => s.label === "install")) continue;
    const rel = relative(rootDir, dir);
    projects.push({
      name: rel === "" ? "root" : rel.replace(/\\/g, "/"),
      dir,
      ecosystem: "ci",
      steps: entry.steps,
      source: [...entry.sources].join(", "),
    });
  }
  return projects;
}

/**
 * CI-derived projects, plus the original auto-detected projects for every
 * directory the CI config didn't cover.
 */
export function detectProjectsWithCi(rootDir: string): { projects: DetectedProject[]; usedCi: boolean } {
  const ci = detectCiProjects(rootDir);
  const detected = detectProjects(rootDir);
  if (ci.length === 0) return { projects: detected, usedCi: false };

  const covered = new Set(ci.map((p) => resolve(p.dir)));
  const rest = detected.filter((p) => !covered.has(resolve(p.dir)));
  return { projects: [...ci, ...rest], usedCi: true };
}
