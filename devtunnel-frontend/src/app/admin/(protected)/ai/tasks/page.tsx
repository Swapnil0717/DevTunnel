import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { SectionMessage } from "@/components/home/section-message";
import { getAiDiscoveredTasks } from "@/lib/admin/ai-discovery/api";
import { AiDiscoveryQueue } from "@/components/admin/ai-discovery/ai-discovery-queue";

export const metadata: Metadata = buildMetadata({
  title: "AI Added Tasks",
  description: "Tasks DevTunnel's AI has proposed creating for onboarded projects.",
  path: "/admin/ai/tasks",
  noIndex: true,
});

export default async function AdminAiTasksPage() {
  const result = await getAiDiscoveredTasks("PENDING");

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="m-0 mb-1 text-xl font-medium text-text">AI added tasks</h1>
        <p className="m-0 text-sm text-text-muted">
          Tasks DevTunnel&apos;s AI has proposed creating for onboarded projects, awaiting review.
        </p>
      </div>

      {result.status === "error" && <SectionMessage>Couldn&apos;t load AI-proposed tasks right now.</SectionMessage>}
      {result.status === "empty" && <SectionMessage>No AI-proposed tasks awaiting review.</SectionMessage>}
      {result.status === "ok" && (
        <AiDiscoveryQueue
          kind="tasks"
          items={result.data.map((t) => ({
            id: t.id,
            title: `#${t.issueNumber} ${t.issueTitle}`,
            subtitle: `${t.projectName} · ${t.taskSummary || "No summary"}`,
            meta: [t.suggestedDifficulty ?? "—", ...t.issueLabels, ...t.suggestedRoles],
            reasoning: t.aiReasoning,
            url: t.issueUrl,
          }))}
        />
      )}
    </main>
  );
}