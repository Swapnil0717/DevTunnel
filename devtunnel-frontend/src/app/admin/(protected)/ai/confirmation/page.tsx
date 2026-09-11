import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { SectionMessage } from "@/components/home/section-message";
import { getAiConfirmationQueue, getAiDiscoveryStatus } from "@/lib/admin/ai-discovery/api";
import { AiDiscoveryQueue } from "@/components/admin/ai-discovery/ai-discovery-queue";
import { AiDiscoveryStatusPanel } from "@/components/admin/ai-discovery/ai-discovery-status-panel";
import { splitSetupGuideBullets } from "@/lib/admin/ai-discovery/setup-guide";

export const metadata: Metadata = buildMetadata({
  title: "Confirmation by Admin",
  description: "Review queue for AI-proposed projects, tools, and tasks awaiting admin approval.",
  path: "/admin/ai/confirmation",
  noIndex: true,
});

export default async function AdminAiConfirmationPage() {
  const [result, statusResult] = await Promise.all([getAiConfirmationQueue(), getAiDiscoveryStatus()]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="m-0 mb-1 text-xl font-medium text-text">Confirmation by admin</h1>
        <p className="m-0 text-sm text-text-muted">
          Review and confirm AI-proposed projects, tools, and tasks before they go live.
        </p>
      </div>

      <AiDiscoveryStatusPanel initialCounters={statusResult.status === "ok" ? statusResult.data : null} />

      {result.status === "error" && <SectionMessage>Couldn&apos;t load the confirmation queue right now.</SectionMessage>}
      {result.status === "empty" && <SectionMessage>Nothing is awaiting confirmation right now.</SectionMessage>}
      {result.status === "ok" && (
        <div className="flex flex-col gap-8">
          <section>
            <h2 className="mb-3 text-sm font-medium text-text-muted">Projects ({result.data.projects.length})</h2>
            <AiDiscoveryQueue
              kind="projects"
              items={result.data.projects.map((p) => ({
                id: p.id,
                title: p.githubFullName,
                subtitle: p.description || p.githubDescription || "No description",
                meta: [p.category, p.difficulty, p.primaryLanguage ?? "—", `★ ${p.stars}`],
                reasoning: p.aiReasoning,
                url: p.repositoryUrl,
              }))}
            />
          </section>
          <section>
            <h2 className="mb-3 text-sm font-medium text-text-muted">Tools ({result.data.tools.length})</h2>
            <AiDiscoveryQueue
              kind="tools"
              items={result.data.tools.map((t) => ({
                id: t.id,
                title: t.name,
                subtitle: `${t.category} · ${t.description || t.fetchedDescription || "No description"}`,
                meta: [t.primaryLanguage ?? "—"],
                details: splitSetupGuideBullets(t.setupGuide),
                reasoning: t.aiReasoning,
                url: t.sourceUrl,
              }))}
            />
          </section>
          <section>
            <h2 className="mb-3 text-sm font-medium text-text-muted">Tasks ({result.data.tasks.length})</h2>
            <AiDiscoveryQueue
              kind="tasks"
              items={result.data.tasks.map((t) => ({
                id: t.id,
                title: `#${t.issueNumber} ${t.issueTitle}`,
                subtitle: `${t.projectName} · ${t.taskSummary || "No summary"}`,
                meta: [...t.issueLabels, ...t.suggestedRoles],
                reasoning: t.aiReasoning,
                url: t.issueUrl,
              }))}
            />
          </section>
        </div>
      )}
    </main>
  );
}