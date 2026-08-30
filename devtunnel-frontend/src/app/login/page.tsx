import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginView } from "./login-view";

// Rule 18: /login is an authentication entry point, not public SEO
// content — it must not be indexed, even though it's reachable without
// being signed in.
export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to DevTunnel with your GitHub account.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginPage() {
  // LoginView reads the `?error=` and `?returnTo=` query params via
  // useSearchParams, which requires a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <LoginView />
    </Suspense>
  );
}
