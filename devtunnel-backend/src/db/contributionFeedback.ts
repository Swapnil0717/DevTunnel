import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Post-PR feedback — `devtunnel.contribution_feedback` (sql/047).
 *
 * Backs `POST /tasks/:id/feedback` (src/routes/contributionFeedback.ts), the
 * "Give feedback" option on the task Contribute page once a contributor's
 * pull request is open.
 *
 * A row is an opinion, never delivered work: nothing here touches a task's
 * status, a contribution count or the activity calendar, and it has no effect
 * on PR review. Every query is scoped to `userId`, and nothing in this module
 * reads another contributor's row.
 */

const TASK_TABLE = "tasks";
const FEEDBACK_TABLE = "contribution_feedback";

export interface ContributionFeedbackInput {
  /** 1–5, validated by the route before it reaches here. */
  rating: number;
  /** Trimmed free text, or `null` when the contributor left it blank. */
  message: string | null;
}

export type SaveFeedbackResult =
  /** Saved (created, or replaced the contributor's earlier answer). */
  | "saved"
  /** No such task, or it was soft-deleted. */
  | "task_not_found"
  /** The task exists but the caller hasn't got a pull request on it. */
  | "not_eligible";

/**
 * Saves the contributor's feedback for a task.
 *
 * Only the task's own assignee may leave it, and only once there is a pull
 * request to talk about (`IN_REVIEW`, or `DONE` after it was accepted) — the
 * prompt is only ever shown to that person at that stage, so the server
 * enforces the same rule instead of trusting the client (rule 17).
 *
 * Upserts on `(task_id, user_id)`, so a retry or a second submit replaces the
 * first answer rather than adding a row (rule 55). `updated_at` is set
 * explicitly because the column default only applies on insert.
 */
export async function saveContributionFeedback(
  supabase: SupabaseClient,
  taskId: string,
  userId: string,
  input: ContributionFeedbackInput,
): Promise<SaveFeedbackResult> {
  const { data: task, error: taskError } = await supabase
    .from(TASK_TABLE)
    .select("id, status, assignee_id, deleted_at")
    .eq("id", taskId)
    .maybeSingle();

  if (taskError) throw new Error(`Failed to read ${TASK_TABLE}: ${taskError.message}`);
  if (!task || task.deleted_at) return "task_not_found";

  const hasPullRequest = task.status === "IN_REVIEW" || task.status === "DONE";
  if (task.assignee_id !== userId || !hasPullRequest) return "not_eligible";

  const { error } = await supabase.from(FEEDBACK_TABLE).upsert(
    {
      task_id: taskId,
      user_id: userId,
      rating: input.rating,
      message: input.message,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "task_id,user_id" },
  );

  if (error) throw new Error(`Failed to save ${FEEDBACK_TABLE}: ${error.message}`);
  return "saved";
}
