import { ProjectCard } from "./project-card";
import { HomeMessage } from "./home-message";
import { HOME_PROJECT_GRID } from "./styles";
import { getRecommendedProjects } from "@/lib/home/api";
import { pickRecommendedProjects } from "@/lib/home/recommended-projects";

/**
 * Home's "Recommended for you" cards — the best-matching few, not the whole
 * catalog (see `pickRecommendedProjects`); "See all" opens `/projects` for
 * the rest.
 */
export async function RecommendedProjectsList() {
  const result = await getRecommendedProjects();

  if (result.status === "error") {
    return (
      <HomeMessage>
        Project recommendations aren&apos;t available yet — check back soon.
      </HomeMessage>
    );
  }

  if (result.status === "empty") {
    return (
      <HomeMessage>
        Complete your profile to get project recommendations.
      </HomeMessage>
    );
  }

  return (
    <ul className={`${HOME_PROJECT_GRID} m-0 list-none p-0`}>
      {pickRecommendedProjects(result.data).map((project) => (
        <li key={project.slug} className="flex">
          <ProjectCard project={project} />
        </li>
      ))}
    </ul>
  );
}
