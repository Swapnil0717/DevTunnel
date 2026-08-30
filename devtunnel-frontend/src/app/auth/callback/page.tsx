import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/layout/logo";
import { OAuthCallbackView } from "@/components/auth/oauth-callback-view";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Signing you in",
  description: "Completing GitHub sign-in for DevTunnel.",
  path: "/auth/callback",
  noIndex: true,
});

export default function AuthCallbackPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-9 px-6 py-16">
      <Logo />
      {/* useSearchParams requires a Suspense boundary in the App Router. */}
      <Suspense
        fallback={
          <div className="w-full max-w-[360px] rounded-[10px] border border-border bg-surface px-6 py-7 text-center text-[13px] text-text-muted">
            Completing sign-in…
          </div>
        }
      >
        <OAuthCallbackView />
      </Suspense>
    </main>
  );
}
