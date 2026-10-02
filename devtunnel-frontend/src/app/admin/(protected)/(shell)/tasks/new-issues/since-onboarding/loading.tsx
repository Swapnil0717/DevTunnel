import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintAdminIssuesPage } from "@/components/ui/blueprint-issues";

/**
 * `/admin/tasks/new-issues/since-onboarding` — "Issues since
 * onboarding". Same live GitHub scan as the plain list, and the same
 * shell, but `AdminIssuesSinceOnboardingTable` adds an "Added to
 * DevTunnel" column (and a 1200px minimum width), and the header copy is
 * its own.
 */
export default function IssuesSinceOnboardingLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet A15.1 — Issues since onboarding"
      revLabel="Rev — scanning repositories"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
      ariaHidden={false}
    >
      <p role="status" className="sr-only">
        Scanning your projects&apos; GitHub repositories for new issues. This re-checks every
        connected repo live, so larger project lists can take a little while.
      </p>
      <BlueprintAdminIssuesPage
        title="Issues since onboarding"
        description="New GitHub issues opened on or after the day each project was added to DevTunnel, and aren't onboarded as a DevTunnel task yet."
        withAddedColumn
      />
    </BlueprintSheet>
  );
}
