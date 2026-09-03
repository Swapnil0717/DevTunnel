import { ProjectCard } from "./project-card";
import { SectionMessage } from "./section-message";
import { getRecommendedProjects } from "@/lib/home/api";

export async function RecommendedProjectsList() {
  const result = await getRecommendedProjects();

  if (result.status === "error") {
    return (
      <SectionMessage>
        Project recommendations aren&apos;t available yet — check back soon.
      </SectionMessage>
    );
  }

  if (result.status === "empty") {
    return (
      <SectionMessage>
        Complete your profile to get project recommendations.
      </SectionMessage>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {result.data.map((project) => (
        <ProjectCard key={project.slug} project={project} />
      ))}
    </div>
  );
}