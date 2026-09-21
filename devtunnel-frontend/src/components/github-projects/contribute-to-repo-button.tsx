"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth/use-auth";
import { CheckCircleIcon, PlusIcon } from "@/components/layout/nav-icons";
import { joinGithubCatalogRepo } from "@/lib/github-projects/client-api";

interface ContributeToRepoButtonProps {
  slug: string;
  /** Which raw GitHub catalog this repository's detail page lives under. */
  basePath: "/github-projects" | "/github-open-source-tools";
  /**
   * From a server-side read of `GET …/contribute-status` — a returning
   * contributor shouldn't be shown "Contribute" as if they hadn't been here.
   */
  initialIsContributing?: boolean;
}

/**
 * Header CTA for a raw GitHub-catalog detail page — `GithubProjectDetailPage`
 * (`/github-projects/:slug`) and `GithubToolDetailPage`
 * (`/github-open-source-tools/:slug`). Same accent-colored, primary-action
 * styling and destination shape `ContributeButton`
 * (`components/projects/contribute-button.tsx`) and `ContributeToToolButton`
 * (`components/opensource-tools/contribute-to-tool-button.tsx`) use on the
 * onboarded Project/Tool detail pages: one accent button, and clicking it
 * opens a DevTunnel Contribute page for this exact repository.
 *
 * **Changed:** this used to be a plain link that recorded nothing. It now
 * records the join first (`joinGithubCatalogRepo`) and then navigates, so a
 * contributor who presses **Contribute** on a repository sees it under their
 * profile's Projects tab, exactly like one who joined an onboarded project.
 * It is still not an onboarding action: it never forks the repository, opens
 * anything on GitHub, or turns the repository into a DevTunnel project — the
 * Contribute page's own Tasks tab explains that a raw catalog repository has
 * no DevTunnel tasks yet (sql/017).
 *
 * Deliberately more forgiving than `ContributeButton` about a failed join.
 * The Contribute page is a public how-to guide, and this button used to
 * always reach it; making the guide unreachable because a bookkeeping write
 * failed (say GitHub rate-limited the repository lookup) would be a
 * regression. So on failure the button says the join wasn't recorded and
 * offers a plain link straight through instead of blocking.
 *
 * A signed-out visitor keeps the previous behavior — a plain link, since
 * there is no account to record a join against.
 */
export function ContributeToRepoButton({
  slug,
  basePath,
  initialIsContributing = false,
}: ContributeToRepoButtonProps) {
  const router = useRouter();
  const { user, status: authStatus } = useAuth();
  const [isContributing, setIsContributing] = useState(initialIsContributing);
  const [status, setStatus] = useState<"idle" | "loading" | "navigating" | "error">("idle");

  const contributeHref = `${basePath}/${slug}/contribute`;

  if (!user && authStatus === "unauthenticated") {
    return (
      <Link
        href={contributeHref}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] bg-accent px-3.5 py-2 text-[13px] font-medium text-accent-foreground transition-opacity hover:opacity-90"
      >
        <PlusIcon className="h-3.5 w-3.5 shrink-0" />
        Contribute
      </Link>
    );
  }

  async function handleClick() {
    if (status === "loading" || status === "navigating") return;

    // Already joined: nothing to record, so go straight there.
    if (isContributing) {
      setStatus("navigating");
      router.push(contributeHref);
      return;
    }

    setStatus("loading");
    try {
      const result = await joinGithubCatalogRepo(basePath, slug);
      setIsContributing(result.contributing);
      setStatus("navigating");
      router.push(contributeHref);
    } catch {
      setStatus("error");
    }
  }

  const isBusy = status === "loading" || status === "navigating";

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isBusy}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-[8px] px-3.5 py-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed ${
          isContributing
            ? "border border-border bg-surface-selected text-status-success-label disabled:opacity-60"
            : "bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-60"
        }`}
      >
        {isBusy ? (
          <Spinner size={13} />
        ) : isContributing ? (
          <CheckCircleIcon className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <PlusIcon className="h-3.5 w-3.5 shrink-0" />
        )}
        {status === "loading"
          ? "Joining…"
          : status === "navigating"
            ? "Opening…"
            : isContributing
              ? "Continue contributing"
              : "Contribute"}
      </button>

      {status === "error" ? (
        <p className="m-0 text-[12px] text-status-error-label">
          Couldn&apos;t record that you joined.{" "}
          <Link href={contributeHref} className="underline underline-offset-2 hover:text-accent">
            Continue to the contribute page anyway
          </Link>
        </p>
      ) : null}
    </div>
  );
}
