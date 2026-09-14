import { LoadingPanel } from "@/components/ui/spinner";

/**
 * Next.js route-segment loading boundary for `/admin/tasks/new-issues`
 * — and, since a `loading.tsx` wraps its whole segment subtree, its
 * `/admin/tasks/new-issues/since-onboarding` child route too.
 *
 * This app has no `loading.tsx` anywhere else, which is fine for every
 * other admin page (a single indexed database query, effectively
 * instant). It is not fine here: both pages this covers call
 * `getAdminNewIssues`, which walks `GET /admin/new-issues` — a route
 * whose own doc comment calls it "the single most expensive read in
 * this admin backend," since it re-scans every active project's GitHub
 * repository live, on every single request, with no DevTunnel-side
 * cache (see `SyncAllIssuesButton`'s doc comment). Without this file,
 * that multi-second-or-longer wait rendered as nothing at all — no
 * spinner, no visible change — which is indistinguishable from a
 * broken click. `getAdminNewIssues` now also requests the full result
 * in one call instead of the default 100-row page size (see
 * `fetchAllAdminPages`'s `pageLimit` param), so on top of this visible
 * loading state, the wait itself should also be shorter for any
 * installation with more than ~100 combined new issues.
 */
export default function NewIssuesLoading() {
  return (
    <LoadingPanel
      label="Scanning your projects' GitHub repositories for new issues…"
      description="This re-checks every connected repo live, so larger project lists can take a little while. Feel free to leave this tab open — it'll load automatically."
    />
  );
}