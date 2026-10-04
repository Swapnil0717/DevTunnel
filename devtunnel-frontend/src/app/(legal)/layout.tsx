import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { SiteFooter } from "@/components/layout/site-footer";

/**
 * Shell for the legal / contact pages. Static and signed-out friendly: no
 * session lookup, so these pages are always reachable (including from the
 * login page and when the backend is down) and cache well.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="mx-auto flex w-full max-w-[1080px] items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <Link
          href="/projects"
          className="text-[13px] text-text-muted transition-colors hover:text-text"
        >
          Browse projects
        </Link>
      </header>
      {children}
      <SiteFooter />
    </div>
  );
}
