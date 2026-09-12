import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { SectionMessage } from "@/components/home/section-message";
import { getAiConfirmationQueue } from "@/lib/admin/ai-discovery/api";
import { AiDiscoveryQueue } from "@/components/admin/ai-discovery/ai-discovery-queue";
import { GeminiQuotaPanel } from "@/components/admin/ai-discovery/gemini-quota-panel";
import { splitSetupGuideBullets } from "@/lib/admin/ai-discovery/setup-guide";

export const metadata: Metadata = buildMetadata({
  title: "Confirmation by Admin",
  description: "Final review and submission of AI-proposed projects, tools, and tasks awaiting admin approval.",
  path: "/admin/ai/confirmation",
  noIndex: true,
});

export default async function AdminAiConfirmationPage() {
  const result = await getAiConfirmationQueue();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="m-0 mb-1 text-xl font-medium text-text">Confirmation by admin</h1>
        <p className="m-0 text-sm text-text-muted">
          Final review and submission for AI-proposed projects, tools, and tasks. Discovery itself now happens from
          each item&apos;s own page — use the filters below to narrow this queue, then confirm items one at a time or
          all at once.
        </p>
      </div>

      <GeminiQuotaPanel />

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
                filters: [
                  { field: "Category", value: p.category },
                  { field: "Difficulty", value: p.difficulty },
                  { field: "Language", value: p.primaryLanguage ?? "—" },
                ],
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
                meta: [t.category, t.primaryLanguage ?? "—"],
                filters: [
                  { field: "Category", value: t.category },
                  { field: "Language", value: t.primaryLanguage ?? "—" },
                ],
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
                filters: [
                  { field: "Project", value: t.projectName },
                  ...(t.suggestedDifficulty ? [{ field: "Difficulty", value: t.suggestedDifficulty }] : []),
                  ...t.issueLabels.map((label) => ({ field: "Label", value: label })),
                  ...t.suggestedRoles.map((role) => ({ field: "Role", value: role })),
                ],
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