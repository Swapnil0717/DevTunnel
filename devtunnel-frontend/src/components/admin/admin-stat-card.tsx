interface AdminStatCardProps {
    label: string;
    /**
     * `null` renders as an honest "—" instead of a number. See
     * `app/admin/(protected)/page.tsx` for why every value is `null` today
     * — there is no `/admin/*` aggregation endpoint on the backend yet, and
     * Frontend_Development_Rules.txt rule 58 forbids inventing statistics.
     */
    value: number | null;
  }
  
  /** A single Module A2 — Admin Dashboard metric (Projects, Published, Tasks, ...). */
  export function AdminStatCard({ label, value }: AdminStatCardProps) {
    return (
      <div className="rounded-[10px] border border-border bg-surface px-4 py-3.5">
        <p className="m-0 mb-1 text-[11px] uppercase tracking-wide text-text-faint">{label}</p>
        <p className="m-0 text-xl font-medium text-text">
          {value === null ? <span aria-label={`${label}: not available yet`}>—</span> : value}
        </p>
      </div>
    );
  }