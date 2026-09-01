export type ProjectSummary = {
    slug: string;
    name: string;
    description: string;
    primaryTech: string;
    matchPercent?: number;
    matchRole?: string; // e.g. "Backend Developer"
  };
  
  export type ActiveProjectSummary = {
    slug: string;
    name: string;
    commitCount: number;
    lastActiveAt: string; // ISO 8601
  };
  
  export type RecommendedTask = {
    taskId: string;
    title: string;
    projectSlug: string;
    role: string;
  };
  
  export type TaskStatus = "TODO" | "IN_PROGRESS" | "IN_REVIEW";
  
  export type MyTask = {
    taskId: string;
    title: string;
    projectSlug: string;
    status: TaskStatus;
  };