import { ProjectCard } from "./project-card";
import { getRecommendedProjects } from "@/lib/home/api";

export async function RecommendedProjectsList() {
  const result = await getRecommendedProjects();

  if (result.status === "error") {
    return (
      <p className="text-[11.5px] text-status-error-text">
        Couldn&apos;t load recommended projects. Try refreshing the page.
      </p>
    );
  }

  if (result.status === "empty") {
    return (
      <p className="text-[11.5px] text-text-dim">
        Complete your profile to get project recommendations.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
      {result.data.map((project) => (
        <ProjectCard key={project.slug} project={project} />
      ))}
    </div>
  );
}