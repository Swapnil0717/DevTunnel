import type { Metadata } from "next";
import Link from "next/link";

// Next.js serves this with a real 404 HTTP status automatically — no
// extra config needed for rule 25 ("Handle 404 Pages Correctly").
export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-medium text-ink-primary">Page not found</h1>
      <p className="max-w-sm text-sm text-ink-muted">
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
      </p>
      <Link
        href="/"
        className="mt-4 text-[13px] font-medium text-status-brand hover:underline"
      >
        Back to home
      </Link>
    </main>
  );
}
