import type { Metadata } from "next";
import { SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "DevTunnel's Privacy Policy.",
  alternates: { canonical: `${SITE_URL}/privacy` },
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="mb-4 text-2xl font-medium text-ink-primary">Privacy Policy</h1>
      <p className="text-sm leading-relaxed text-ink-muted">
        This page is a placeholder. Replace this content with DevTunnel&apos;s actual
        Privacy Policy before launch — the login page links here, and
        Frontend_Development_Rules.txt (rule 58) requires that AI-generated code
        never fabricate legal or policy content.
      </p>
    </main>
  );
}
