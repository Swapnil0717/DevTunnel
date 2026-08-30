import type { Metadata } from "next";
import { SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "DevTunnel's Terms of Service.",
  alternates: { canonical: `${SITE_URL}/terms` },
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="mb-4 text-2xl font-medium text-ink-primary">Terms of Service</h1>
      <p className="text-sm leading-relaxed text-ink-muted">
        This page is a placeholder. Replace this content with DevTunnel&apos;s actual
        Terms of Service before launch — the login page links here, and
        Frontend_Development_Rules.txt (rule 58) requires that AI-generated code
        never fabricate legal or policy content.
      </p>
    </main>
  );
}
