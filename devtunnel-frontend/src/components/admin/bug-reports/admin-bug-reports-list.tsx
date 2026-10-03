import type { AdminBugReport } from "@/lib/admin/bug-reports/types";

const AREA_LABEL: Record<AdminBugReport["area"], string> = {
  projects: "Projects",
  tasks: "Tasks and issues",
  cli: "CLI",
  profile: "Profile and settings",
  other: "Other",
};

const SEVERITY_LABEL: Record<AdminBugReport["severity"], string> = {
  minor: "Small annoyance",
  broken: "Something is broken",
  blocked: "Can't continue",
};

const SEVERITY_CLASS: Record<AdminBugReport["severity"], string> = {
  minor: "border-border text-text-muted",
  broken: "border-border text-text-secondary",
  blocked: "border-status-error-label/40 text-status-error-label",
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="mt-3">
      <dt className="text-[11.5px] text-text-muted">{label}</dt>
      <dd className="m-0 mt-0.5 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-text-secondary">
        {value}
      </dd>
    </div>
  );
}

/**
 * Read-only list of bug reports (newest first). Everything here was typed by a
 * visitor, so it is rendered as plain text only (React escapes it; no
 * `dangerouslySetInnerHTML`, no auto-linking). The page path is shown as text
 * rather than a link for the same reason.
 */
export function AdminBugReportsList({ reports }: { reports: AdminBugReport[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {reports.map((report) => (
        <li key={report.id} className="rounded-[10px] border border-border bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="m-0 min-w-0 break-words text-[14px] font-medium text-text">
              {report.title}
            </h2>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${SEVERITY_CLASS[report.severity]}`}
            >
              {SEVERITY_LABEL[report.severity]}
            </span>
          </div>

          <p className="m-0 mt-1 text-[11.5px] text-text-muted">
            {AREA_LABEL[report.area]} · {formatDate(report.createdAt)} ·{" "}
            {report.reporterUsername ? `@${report.reporterUsername}` : "Signed-out visitor"}
          </p>

          <dl className="m-0">
            <Field label="What happened" value={report.description} />
            <Field label="Steps to reproduce" value={report.steps} />
            <Field label="What they expected" value={report.expected} />
            <Field label="Page" value={report.pageUrl} />
            <Field label="Browser" value={report.userAgent} />
          </dl>
        </li>
      ))}
    </ul>
  );
}
