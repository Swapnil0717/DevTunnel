import Link from "next/link";

const ACTIONS = [
  {
    href: "/projects/new",
    title: "Start an open source project",
    description: "Connect a repo and open it up to contributors.",
  },
  {
    href: "/projects?intent=find",
    title: "Find an open source project",
    description: "Browse projects matched to your skills.",
  },
] as const;

export function EntryActions() {
  return (
    <nav aria-label="Get started" className="mb-6">
      <h2 className="sr-only">Get started</h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 list-none p-0 m-0">
        {ACTIONS.map((action) => (
          <li key={action.href}>
            <Link
              href={action.href}
              className="block h-full rounded-[10px] border border-border bg-surface p-4 transition-colors hover:border-accent focus-visible:border-accent"
            >
              <p className="text-[13px] font-medium text-text mb-[3px]">
                {action.title}
              </p>
              <p className="text-[11.5px] text-text-dim m-0">
                {action.description}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}