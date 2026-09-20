import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { SectionMessage } from "@/components/home/section-message";
import { getAiDiscoveredProjects } from "@/lib/admin/ai-discovery/api";
import { AiDiscoveryQueue } from "@/components/admin/ai-discovery/ai-discovery-queue";
import { AiDiscoveryRunButton } from "@/components/admin/ai-discovery/ai-discovery-run-button";

export const metadata: Metadata = buildMetadata({
  title: "AI Added Projects",
  description: "Projects DevTunnel's AI has proposed adding to the platform.",
  path: "/admin/ai/projects",
  noIndex: true,
});

export default async function AdminAiProjectsPage() {
  const result = await getAiDiscoveredProjects("PENDING");

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="m-0 mb-1 text-xl font-medium text-text">AI added projects</h1>
        <p className="m-0 text-sm text-text-muted">
          Projects DevTunnel&apos;s AI has proposed adding to the platform, awaiting review.
        </p>
      </div>

      <AiDiscoveryRunButton kind="projects" />

      {result.status === "error" && <SectionMessage>Couldn&apos;t load AI-proposed projects right now.</SectionMessage>}
      {result.status === "empty" && <SectionMessage>No AI-proposed projects awaiting review.</SectionMessage>}
      {result.status === "ok" && (
        <AiDiscoveryQueue
          kind="projects"
          items={result.data.map((p) => ({
            id: p.id,
            title: p.githubFullName,
            subtitle: p.description || p.githubDescription || "No description",
            meta: [p.category, p.difficulty, p.primaryLanguage ?? "—", `★ ${p.stars}`, `${p.openIssues} open issues`],
            reasoning: p.aiReasoning,
            url: p.repositoryUrl,
          }))}
        />
      )}
    </main>
  );
}