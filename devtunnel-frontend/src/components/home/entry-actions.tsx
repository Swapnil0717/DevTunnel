import Link from "next/link";
import { PlusIcon, SearchIcon } from "@/components/layout/nav-icons";

const ACTIONS = [
  {
    href: "/projects/new",
    title: "Start an open source project",
    description: "Connect a repo and open it up to contributors.",
    Icon: PlusIcon,
  },
  {
    href: "/projects?intent=find",
    title: "Find an open source project",
    description: "Browse projects matched to your skills.",
    Icon: SearchIcon,
  },
] as const;

export function EntryActions() {
  return (
    <nav aria-label="Get started" className="mb-[22px]">
      <h2 className="sr-only">Get started</h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 list-none p-0 m-0">
        {ACTIONS.map(({ href, title, description, Icon }) => (
          <li key={href}>
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
          </li>
        ))}
      </ul>
    </nav>
  );
}