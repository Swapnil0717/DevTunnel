import Link from "next/link";
import { PlusIcon, SearchIcon } from "@/components/layout/nav-icons";

const ACTIONS = [
  {
    href: "/projects/new",
    title: "Start an open source project",
    description: "Connect a repo and open it up to contributors.",
    Icon: PlusIcon,
    /**
     * Contributor-initiated project creation is disabled: the Admin
     * Portal Master Coding Specification makes Project Onboarding an
     * Admin-only, multi-step, mandatory-validation workflow ("GitHub
     * remains the source of truth for the repository. Admin is
     * responsible for creating and managing the DevTunnel representation
     * of that repository") — there's no `/projects/new` contributor page
     * to link to anymore. Kept in this list (rather than removed) so the
     * person still sees the option exists and is coming, same choice
     * `IntentStep` makes for this identical option in onboarding
     * (components/onboarding/steps/intent-step.tsx). Flip this back to
     * `false` in the same commit that ships a real contributor-facing
     * page at `href`.
     */
    built: false,
  },
  {
    href: "/projects?intent=find",
    title: "Find an open source project",
    description: "Browse projects matched to your skills.",
    Icon: SearchIcon,
    built: true,
  },
] as const;

/**
 * Contributor Home's two entry-point cards (devtunnel_workflow.txt,
 * Module 3). `built: false` entries (currently just "Start an open source
 * project") render as a disabled, non-navigating card with a "Soon" badge
 * instead of a `<Link>` — same convention as `AdminSidebar` /
 * `AdminMobileNav` (components/admin/admin-nav-items.ts) and the
 * onboarding intent step's `OptionCard` (rule 11: don't ship a link
 * nobody can actually follow).
 */
export function EntryActions() {
  return (
    <nav aria-label="Get started" className="mb-[22px]">
      <h2 className="sr-only">Get started</h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 list-none p-0 m-0">
        {ACTIONS.map(({ href, title, description, Icon, built }) => (
          <li key={href}>
            {built ? (
              <Link
                href={href}
                className="block h-full rounded-[10px] border border-border bg-surface p-4 transition-colors hover:border-accent focus-visible:border-accent"
              >
                <Icon className="h-[18px] w-[18px] text-text-muted" />
                <p className="text-[13px] font-medium text-text mt-[10px] mb-[3px]">
                  {title}
                </p>
                <p className="text-[11.5px] text-text-dim m-0">{description}</p>
              </Link>
            ) : (
              <span
                aria-disabled="true"
                title={`${title} isn't available yet`}
                className="block h-full cursor-not-allowed rounded-[10px] border border-border-subtle bg-surface/60 p-4"
              >
                <span className="flex items-center justify-between gap-2">
                  <Icon className="h-[18px] w-[18px] text-text-faint" />
                  <span className="shrink-0 rounded-full border border-border-subtle px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-text-faint">
                    Soon
                  </span>
                </span>
                <p className="text-[13px] font-medium text-text-faint mt-[10px] mb-[3px]">
                  {title}
                </p>
                <p className="text-[11.5px] text-text-faint/80 m-0">{description}</p>
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}