import { LoadingPanel } from "@/components/ui/spinner";

/**
 * Next.js route-segment loading boundary for `/issues` ("All Issues").
 *
 * Same reasoning as `/admin/tasks/new-issues/loading.tsx`: `getIssues()`
 * walks `GET /issues`, the contributor-facing counterpart to
 * `GET /admin/new-issues` — a route this app treats as re-scanning every
 * onboarded project's GitHub repository live, on every request, with no
 * DevTunnel-side cache. A skeleton here would imply "almost done, just a
 * cosmetic delay"; a spinner with a real description is the honest
 * signal for a wait that can genuinely take a few seconds on a larger
 * install. Without this file, that wait renders as nothing at all — no
 * spinner, no visible change — which is indistinguishable from a broken
 * click.
 */
export default function IssuesLoading() {
  return (
    <LoadingPanel
      label="Scanning DevTunnel's projects for open GitHub issues…"
      description="This checks every onboarded repo live, so larger project lists can take a little while. Feel free to leave this tab open — it'll load automatically."
    />
  );
}