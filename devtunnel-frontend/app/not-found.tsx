import Link from "next/link";
import { Logo } from "@/components/layout/logo";

// Next.js automatically serves this with a real 404 HTTP status.
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <Logo />
      <div>
        <h1 className="m-0 mb-2 text-xl font-medium text-text">Page not found</h1>
        <p className="m-0 text-[14px] text-text-muted">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-4 py-2 text-[13px] font-medium text-text transition-colors hover:bg-surface-raised"
      >
        Back to DevTunnel
      </Link>
    </main>
  );
}
