import { spawn } from "node:child_process";
import pc from "picocolors";
import type { DetectedProject, TestStep } from "./testRunners";

export interface StepResult {
  project: string;
  label: string;
  command: string;
  success: boolean;
  durationMs: number;
  /** Only populated on failure — the tail of stdout+stderr, for the summary. Full output is always streamed live regardless. */
  errorTail: string | null;
}

/** How much of a failed step's combined output to keep for the end-of-run summary — enough to actually be useful, not the whole log. */
const ERROR_TAIL_LINES = 25;

const COLORS = [pc.cyan, pc.magenta, pc.blue, pc.yellow, pc.green] as const;

function colorFor(index: number): (s: string) => string {
  return COLORS[index % COLORS.length]!;
}

/**
 * Runs one command, streaming every line it prints prefixed with
 * `[projectName]` (color-coded per project so concurrent output from
 * `backend` and `frontend` stays visually distinguishable) — never
 * buffers silently until the end, since a slow `npm install` or `cargo
 * build` with no visible output for a minute reads as a hang.
 */
function runStep(
  projectName: string,
  color: (s: string) => string,
  dir: string,
  step: TestStep,
): Promise<StepResult> {
  const prefix = color(`[${projectName}:${step.label}]`);
  const start = Date.now();
  const tail: string[] = [];

  return new Promise((resolvePromise) => {
    const child = spawn(step.command, step.args, { cwd: dir, shell: false });

    const onLine = (chunk: Buffer, isErr: boolean) => {
      const text = chunk.toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        if (!line) continue;
        console.log(`${prefix} ${isErr ? pc.dim(line) : line}`);
        tail.push(line);
        if (tail.length > ERROR_TAIL_LINES) tail.shift();
      }
    };

    child.stdout?.on("data", (chunk: Buffer) => onLine(chunk, false));
    child.stderr?.on("data", (chunk: Buffer) => onLine(chunk, true));

    child.on("error", (err) => {
      // The command itself couldn't be launched at all (e.g. `cargo` not
      // on PATH) — treat exactly like a failing exit code, not a crash of
      // `dev test` itself.
      tail.push(err.message);
      resolvePromise({
        project: projectName,
        label: step.label,
        command: `${step.command} ${step.args.join(" ")}`,
        success: false,
        durationMs: Date.now() - start,
        errorTail: tail.join("\n"),
      });
    });

    child.on("close", (code) => {
      const success = code === 0;
      resolvePromise({
        project: projectName,
        label: step.label,
        command: `${step.command} ${step.args.join(" ")}`,
        success,
        durationMs: Date.now() - start,
        errorTail: success ? null : tail.join("\n"),
      });
    });
  });
}

/**
 * Runs every step of one project's pipeline in order (install → typecheck
 * → test → build — install has to finish before anything else can run;
 * the rest are ordered for the clearest signal first) and stops at the
 * first failure — no point running `build` after `test` already failed.
 */
async function runProjectSteps(
  project: DetectedProject,
  color: (s: string) => string,
): Promise<StepResult[]> {
  const results: StepResult[] = [];
  for (const step of project.steps) {
    const result = await runStep(project.name, color, project.dir, step);
    results.push(result);
    if (!result.success) break;
  }
  return results;
}

/**
 * Runs every detected project's pipeline concurrently — this is the
 * "backend and frontend at the same time" behavior: each project's own
 * steps are sequential (install must finish before test), but different
 * projects race each other, same as a contributor running two terminal
 * tabs side by side. Returns every project's results (including ones
 * never reached because an earlier step in that same project failed —
 * those simply aren't in the array; the caller treats "fewer results
 * than steps" as "stopped early").
 */
export async function runAllProjects(projects: DetectedProject[]): Promise<StepResult[][]> {
  return Promise.all(projects.map((project, i) => runProjectSteps(project, colorFor(i))));
}