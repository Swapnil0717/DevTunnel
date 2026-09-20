import { SectionMessage } from "@/components/home/section-message";

/**
 * Admin Portal Master Coding Specification, section 3 — Admin Dashboard ▸
 * "User Activity / Traction Graph": a graph of user activity over time
 * (Daily Active Users, or Daily Contributor Activity if that's what the
 * existing database supports better).
 *
 * There is no `GET /admin/dashboard/activity` endpoint yet to plot real
 * points from, and rule 58 ("AI-generated code must not invent SEO data")
 * applies just as much to invented chart data as to invented statistics —
 * so, same convention as `AdminStatCard` rendering "—" instead of a
 * fabricated number, this renders the axes only: a real, honest empty
 * frame, not a curve drawn from numbers nobody measured. The axis lines
 * are decorative (`aria-hidden`) since the actual information — "no data
 * yet" — is carried by the visible `SectionMessage` text below it, not by
 * the SVG.
 */
export function AdminTractionChart() {
  return (
    <div className="rounded-[10px] border border-border bg-surface px-5 py-4">
      <svg
        viewBox="0 0 320 120"
        aria-hidden="true"
        className="mb-3 h-[100px] w-full text-border"
      >
        <line x1="28" y1="8" x2="28" y2="104" stroke="currentColor" strokeWidth="1" />
        <line x1="28" y1="104" x2="312" y2="104" stroke="currentColor" strokeWidth="1" />
        <text x="4" y="14" className="fill-text-faint text-[9px]">
          Users
        </text>
        <text x="300" y="118" className="fill-text-faint text-[9px]">
          Time
        </text>
      </svg>
      <SectionMessage>
        Daily active user activity will chart here once{" "}
        <code className="rounded bg-surface-raised px-1 py-0.5 font-mono text-[11px] text-text-secondary">
          GET /admin/dashboard/activity
        </code>{" "}
        exists on the backend.
      </SectionMessage>
    </div>
  );
}