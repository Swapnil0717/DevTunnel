import type { Metadata } from "next";
import { Suspense } from "react";
import { CallbackView } from "./callback-view";

export const metadata: Metadata = {
  title: "Signing in",
  description: "Completing GitHub sign-in.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackView />
    </Suspense>
  );
}
