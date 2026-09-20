import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { SectionMessage } from "@/components/home/section-message";
import { getAiDiscoveredTools } from "@/lib/admin/ai-discovery/api";
import { AiDiscoveryQueue } from "@/components/admin/ai-discovery/ai-discovery-queue";
import { AiDiscoveryRunButton } from "@/components/admin/ai-discovery/ai-discovery-run-button";
import { splitSetupGuideBullets } from "@/lib/admin/ai-discovery/setup-guide";

export const metadata: Metadata = buildMetadata({
  title: "AI Added Tools",
  description: "Open source tools DevTunnel's AI has proposed adding to the platform.",
  path: "/admin/ai/tools",
  noIndex: true,
});

export default async function AdminAiToolsPage() {
  const result = await getAiDiscoveredTools("PENDING");

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="m-0 mb-1 text-xl font-medium text-text">AI added tools</h1>
        <p className="m-0 text-sm text-text-muted">
          Open source tools DevTunnel&apos;s AI has proposed adding to the catalog, awaiting review.
        </p>
      </div>

      <AiDiscoveryRunButton kind="tools" />

      {result.status === "error" && <SectionMessage>Couldn&apos;t load AI-proposed tools right now.</SectionMessage>}
      {result.status === "empty" && <SectionMessage>No AI-proposed tools awaiting review.</SectionMessage>}
      {result.status === "ok" && (
        <AiDiscoveryQueue
          kind="tools"
          items={result.data.map((t) => ({
            id: t.id,
            title: t.name,
            subtitle: `${t.category} · ${t.description || t.fetchedDescription || "No description"}`,
            meta: [t.primaryLanguage ?? "—", ...t.labels],
            details: splitSetupGuideBullets(t.setupGuide),
            reasoning: t.aiReasoning,
            url: t.sourceUrl,
          }))}
        />
      )}
    </main>
  );
}