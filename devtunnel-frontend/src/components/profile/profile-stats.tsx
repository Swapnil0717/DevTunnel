/**
 * Contributions / Projects / Pull requests counts
 * (5_devtunnel_profile_page.html). There's no aggregation endpoint for
 * any of these yet — devtunnel-backend only has `/health` and `/auth/*`
 * routes today, nothing that counts a user's contributions, project
 * memberships, or PRs. Rendering specific numbers here without a real
 * source would be inventing statistics
 * (Frontend_Development_Rules.txt rule 58/59), so each card shows an
 * honest "not available yet" state instead of a sample figure. Swap the
 * "—" for the real count as soon as that endpoint exists — the layout
 * doesn't need to change, just the value passed in.
 */
 const STAT_LABELS = ["Contributions", "Projects", "Pull requests"] as const;

 export function ProfileStats() {
   return (
     <div className="mb-5 grid grid-cols-3 gap-3" aria-label="Contribution stats">
       {STAT_LABELS.map((label) => (
         <div key={label} className="rounded-lg bg-surface px-3.5 py-3">
           <p className="m-0 mb-1 text-[11px] text-text-dim">{label}</p>
           <p className="m-0 text-xl font-medium text-text-faint" aria-hidden="true">
             —
           </p>
           <span className="sr-only">Not available yet</span>
         </div>
       ))}
     </div>
   );
 }