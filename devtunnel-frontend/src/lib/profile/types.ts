export type ContributionDay = {
    date: string; // YYYY-MM-DD
    count: number;
  };
  
  export type ContributionWeek = {
    days: ContributionDay[];
  };
  
  export type ContributionMonth = {
    month: string; // YYYY-MM
    githubUsername: string;
    totalContributions: number;
    weeks: ContributionWeek[];
    canGoPrevious: boolean;
    canGoNext: boolean;
  };
  
  export type ContributionSummary = {
    totalContributions: number;
    fromDate: string; // ISO 8601
    toDate: string; // ISO 8601
  };