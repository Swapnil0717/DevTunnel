"use client";

import { useMemo, useState } from "react";
import { SearchIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import { FilterSelect } from "@/components/ui/filter-select";
import { AdminNewIssuesTable } from "./admin-new-issues-table";
import type { AdminNewIssue } from "@/lib/admin/new-issues/types";
import type { GithubIssueState } from "@/lib/admin/task-onboarding/types";

type StateFilter = "ALL" | GithubIssueState;

const STATE_FILTERS: { value: StateFilter; label: string }[] = [
  { value: "ALL", label: "All states" },
  { value: "OPEN", label: "Open" },
  { value: "CLOSED", label: "Closed" },
];

/**
 * Client-side filter bar for `/admin/tasks/new-issues` (admin_workflow.txt
 * section 16 — "New Issues Section"), driven by one already-fetched
 * `GET /admin/new-issues` list (`lib/admin/new-issues/api.ts`) —
 * narrowing it in the browser is a UX improvement on top of one real
 * data source, never a second fabricated one
 * (Frontend_Development_Rules.txt rule 58). Same convention as
 * `AdminTasksExplorer`.
 *
 * Filters, matching what was asked for — GitHub repository, author,
 * issuer, tech stack — plus the project the issue belongs to and its
 * GitHub state:
 * - Search — matches issue title, issue number, project name, GitHub
 *   repository, issue author (username or display name), and labels.
 * - Repository / Project / Author — option lists are *derived from the
 *   fetched issues themselves* (`useMemo` below), never a hardcoded
 *   guess at what values might exist (rule 58).
 * - Tech stack — derived the same way, from each issue's project's own
 *   already-validated tech stack (`AdminNewIssueProjectRef.techStack`),
 *   since a GitHub issue doesn't carry a tech stack of its own.
 * - State — the fixed `GithubIssueState` enum already defined for Task
 *   Onboarding's own issue list, not a second taxonomy invented here.
 *
 * This is authenticated Admin application UI (`noIndex: true` on the
 * page), not public content, so filtering client-side after a full
 * server fetch has no crawlability impact
 * (Frontend_Development_Rules.txt rule 18).
 */
export function AdminNewIssuesExplorer({ issues }: { issues: AdminNewIssue[] }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<StateFilter>("ALL");
  const [repository, setRepository] = useState("ALL");
  const [author, setAuthor] = useState("ALL");
  const [techStack, setTechStack] = useState("ALL");
  const [projectSlug, setProjectSlug] = useState("ALL");

  const repositoryOptions = useMemo(() => {
    const values = new Set<string>();
    for (const issue of issues) values.add(issue.project.repositoryFullName);
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [issues]);

  const authorOptions = useMemo(() => {
    const values = new Set<string>();
    for (const issue of issues) values.add(issue.author.username);
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [issues]);

  const techStackOptions = useMemo(() => {
    const values = new Set<string>();
    for (const issue of issues) {
      for (const value of issue.project.techStack) values.add(value);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [issues]);

  const projectOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const issue of issues) {
      if (!seen.has(issue.project.slug)) {
        seen.set(issue.project.slug, issue.project.name);
      }
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [issues]);

  const filteredIssues = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return issues.filter((issue) => {
      if (state !== "ALL" && issue.state !== state) return false;
      if (repository !== "ALL" && issue.project.repositoryFullName !== repository) return false;
      if (author !== "ALL" && issue.author.username !== author) return false;
      if (techStack !== "ALL" && !issue.project.techStack.includes(techStack)) return false;
      if (projectSlug !== "ALL" && issue.project.slug !== projectSlug) return false;

      if (!normalizedQuery) return true;

      const haystack = [
        issue.title,
        `#${issue.number}`,
        issue.project.name,
        issue.project.repositoryFullName,
        issue.author.username,
        issue.author.name ?? "",
        ...issue.labels,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [issues, query, state, repository, author, techStack, projectSlug]);

  const hasActiveFilters =
    query.trim().length > 0 ||
    state !== "ALL" ||
    repository !== "ALL" ||
    author !== "ALL" ||
    techStack !== "ALL" ||
    projectSlug !== "ALL";

  return (
    <div>
      <div className="mb-3 flex flex-col gap-3">
        <div className="relative w-full sm:max-w-xs">
          <label htmlFor="admin-new-issues-search" className="sr-only">
            Search new issues by title, project, repository, author, or label
          </label>

          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />

          <input
            id="admin-new-issues-search"
            name="admin-new-issues-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by issue, project, repository, author, or label"
            className="w-full rounded-[8px] border border-border bg-surface py-2 pl-8 pr-3 text-[12.5px] text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            id="admin-new-issues-state"
            label="State"
            value={state}
            onChange={(value) => setState(value as StateFilter)}
            options={STATE_FILTERS}
          />

          <FilterSelect
            id="admin-new-issues-repository"
            label="Repository"
            value={repository}
            onChange={setRepository}
            options={[
              { value: "ALL", label: "All repositories" },
              ...repositoryOptions.map((value) => ({ value, label: value })),
            ]}
          />

          <FilterSelect
            id="admin-new-issues-author"
            label="Author"
            value={author}
            onChange={setAuthor}
            options={[
              { value: "ALL", label: "All authors" },
              ...authorOptions.map((value) => ({ value, label: `@${value}` })),
            ]}
          />

          <FilterSelect
            id="admin-new-issues-techstack"
            label="Tech stack"
            value={techStack}
            onChange={setTechStack}
            options={[
              { value: "ALL", label: "All tech stacks" },
              ...techStackOptions.map((value) => ({ value, label: value })),
            ]}
          />

          <FilterSelect
            id="admin-new-issues-project"
            label="Project"
            value={projectSlug}
            onChange={setProjectSlug}
            options={[
              { value: "ALL", label: "All projects" },
              ...projectOptions.map(([slug, name]) => ({ value: slug, label: name })),
            ]}
          />
        </div>
      </div>

      <p className="mb-3 text-[11.5px] text-text-faint" aria-live="polite">
        Showing {filteredIssues.length} of {issues.length} issue
        {issues.length === 1 ? "" : "s"}
      </p>

      {filteredIssues.length === 0 ? (
        <SectionMessage>
          {hasActiveFilters
            ? "No new issues match your search or the selected filters. Try different search terms or filters."
            : "No new GitHub issues right now — everything is either already onboarded as a task or ignored."}
        </SectionMessage>
      ) : (
        <AdminNewIssuesTable issues={filteredIssues} />
      )}
    </div>
  );
}