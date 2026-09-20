"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { DetailsStep } from "@/components/submissions/onboarding/steps/details-step";
import { SubmissionsApiError, updateSubmissionDetails } from "@/lib/submissions/client-api";
import type {
  SubmissionDetail,
  SubmissionDraftDetails,
  SubmissionDraftSource,
} from "@/lib/submissions/types";

/** The editable fields as they currently stand on the published submission. */
function detailsOf(submission: SubmissionDetail): SubmissionDraftDetails {
  return {
    descriptionSource: submission.descriptionSource,
    customDescription: submission.customDescription,
    techStack: submission.techStack,
    isPaidAlternative: submission.isPaidAlternative,
    alternativeTo: submission.alternativeTo,
  };
}

/**
 * The same rules the backend enforces (`detailsSchema` in
 * devtunnel-backend `src/routes/submissions.ts`), checked here so Save
 * can explain what's missing instead of bouncing off a 400. The backend
 * remains the real gate — this only mirrors it.
 */
function isValid(details: SubmissionDraftDetails): boolean {
  if (details.techStack.length === 0) return false;
  if (details.descriptionSource === "CUSTOM" && !details.customDescription?.trim()) return false;
  if (details.isPaidAlternative && details.alternativeTo.length === 0) return false;
  return true;
}

/**
 * The body of `/submissions/:slug/edit` — edits a published submission's
 * description, tech stack and "replaces something paid" classification.
 *
 * It reuses the submit wizard's own details step (`DetailsStep`) rather
 * than a second copy of the description choice, tag inputs and
 * alternative-to handling, so an edit offers exactly what submitting did
 * and the two can't drift apart (rule 51). The step needs a
 * `SubmissionDraftSource` for its read-only "From GitHub" panel; that's
 * built from what's already stored on the submission.
 *
 * What can't be edited here, on purpose: the name, kind, repository,
 * source URL and README. Those were fetched from the repository, not
 * chosen by the submitter, and the edit route doesn't accept them.
 *
 * Save is disabled until something actually changed and every rule is
 * met, and on success the page goes back to the view page and refreshes
 * it so it shows what the server stored (rule 38). A failure — including
 * a 403 if the viewer somehow isn't the owner — shows the backend's own
 * message and leaves the form as it was.
 */
export function EditSubmissionForm({ submission }: { submission: SubmissionDetail }) {
  const router = useRouter();

  const initial = useMemo(() => detailsOf(submission), [submission]);
  const [details, setDetails] = useState<SubmissionDraftDetails>(initial);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const source: SubmissionDraftSource = useMemo(
    () => ({
      url: submission.sourceUrl,
      name: submission.name,
      repositoryFullName: submission.repositoryFullName,
      fetchedDescription: submission.fetchedDescription,
      readme: submission.readme,
      primaryLanguage: submission.primaryLanguage,
      detectedTechStack: [],
    }),
    [submission],
  );

  const viewHref = `/submissions/${submission.slug}`;
  const hasChanges = JSON.stringify(details) !== JSON.stringify(initial);
  const canSave = hasChanges && isValid(details) && !isSaving;

  async function save() {
    if (!canSave) return;

    setIsSaving(true);
    setError(null);

    try {
      await updateSubmissionDetails(submission.slug, details);
      router.push(viewHref);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof SubmissionsApiError
          ? err.message
          : "Couldn't save your changes. Check your connection and try again.",
      );
      setIsSaving(false);
    }
  }

  return (
    <div>
      <DetailsStep
        source={source}
        value={details}
        onChange={setDetails}
        showHeading={false}
        techStackHint="These are the tags people filter by. Add or remove any that don't fit."
      />

      {error ? (
        <p role="alert" className="m-0 mt-6 text-[12.5px] text-status-error-label">
          {error}
        </p>
      ) : null}

      <div className="mt-8 flex items-center justify-between border-t border-border-subtle pt-5">
        <Link
          href={viewHref}
          className="rounded-md border border-border bg-surface px-4 py-2 text-[13px] font-medium text-text-muted transition-colors hover:bg-surface-raised"
        >
          Cancel
        </Link>

        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSaving ? <Spinner size={13} /> : null}
          {isSaving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
