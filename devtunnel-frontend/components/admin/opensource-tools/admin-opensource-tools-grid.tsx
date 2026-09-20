import { AdminOpenSourceToolCard } from "./admin-opensource-tool-card";
import type { AdminToolSummary } from "@/lib/admin/opensource-tools/types";

/**
 * Plain presentational grid of square tool boxes for
 * `/admin/opensource-tools`, driven entirely by its `tools` prop — same
 * split `AdminProjectsExplorer` / `AdminProjectsTable` make, so filter
 * state stays out of this component.
 */
export function AdminOpenSourceToolsGrid({ tools }: { tools: AdminToolSummary[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {tools.map((tool) => (
        <AdminOpenSourceToolCard key={tool.id} tool={tool} />
      ))}
    </div>
  );
}