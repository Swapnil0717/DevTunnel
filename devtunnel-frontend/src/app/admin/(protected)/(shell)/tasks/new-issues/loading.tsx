import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintAdminIssuesPage } from "@/components/ui/blueprint-issues";

/**
 * `/admin/tasks/new-issues` — "All Issue". `getAdminNewIssues` re-scans
 * every active project's GitHub repository live, so this is a long wait
 * (see the note on the page); the sheet is the page it resolves to:
 * the header with "Sync all issues" + "Create task", `AdminNewIssuesExplorer`'s
 * search and State / Repository / Author / Tech stack / Project filters,
 * `AdminNewIssuesTable` (Issue, Project, GitHub author, Labels, Created,
 * Updated, Actions) and the 20-per-page pagination footer.
 *
 * The `Rev` label carries the "scanning live" message that the old
 * spinner panel used to show.
 *
 * A `loading.tsx` wraps its whole segment subtree, so
 * `since-onboarding/` has its own — its table has an extra column and
 * its header reads differently.
 */
export default function NewIssuesLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet A15 — All Issue"
      revLabel="Rev — scanning repositories"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
      ariaHidden={false}
    >
      <p role="status" className="sr-only">
        Scanning your projects&apos; GitHub repositories for new issues. This re-checks every
        connected repo live, so larger project lists can take a little while.
      </p>
      <BlueprintAdminIssuesPage
        title="All Issue"
        description="GitHub issues from your projects' repositories that aren't onboarded as DevTunnel tasks yet."
      />
    </BlueprintSheet>
  );
}
