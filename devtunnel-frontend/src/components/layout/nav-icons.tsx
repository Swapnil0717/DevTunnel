/**
 * Small inline outline icons for the app shell (sidebar nav + entry
 * actions). Kept as plain SVG instead of an icon-font/library so we don't
 * pull in a new dependency for a handful of glyphs (Frontend_Development_Rules.txt
 * rule 34 — avoid large libraries for functionality that can be
 * implemented simply). Always decorative — paired with real text next to
 * them, so they're aria-hidden (rule 43).
 */
 type IconProps = { className?: string };

 const base = {
   viewBox: "0 0 24 24",
   fill: "none",
   stroke: "currentColor",
   strokeWidth: 1.75,
   strokeLinecap: "round" as const,
   strokeLinejoin: "round" as const,
   "aria-hidden": true,
 };
 
 export function HomeIcon({ className = "" }: IconProps) {
   return (
     <svg {...base} className={className}>
       <path d="M4 11.5 12 4l8 7.5" />
       <path d="M6 10v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-8" />
       <path d="M10 19v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5" />
     </svg>
   );
 }
 
 export function FolderIcon({ className = "" }: IconProps) {
   return (
     <svg {...base} className={className}>
       <path d="M4 6a1 1 0 0 1 1-1h3.5l2 2H19a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6Z" />
     </svg>
   );
 }
 
 export function UserIcon({ className = "" }: IconProps) {
   return (
     <svg {...base} className={className}>
       <circle cx="12" cy="8" r="3.25" />
       <path d="M5.5 20v-1a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v1" />
     </svg>
   );
 }
 
 export function PlusIcon({ className = "" }: IconProps) {
   return (
     <svg {...base} className={className}>
       <path d="M12 5v14" />
       <path d="M5 12h14" />
     </svg>
   );
 }
 
 export function SearchIcon({ className = "" }: IconProps) {
   return (
     <svg {...base} className={className}>
       <circle cx="10.5" cy="10.5" r="6.5" />
       <path d="M20 20l-4.8-4.8" />
     </svg>
   );
 }
 
 export function SettingsIcon({ className = "" }: IconProps) {
   return (
     <svg {...base} className={className}>
       <circle cx="12" cy="12" r="3" />
       <path d="M12 3.5v2.1M12 18.4v2.1M20.5 12h-2.1M5.6 12H3.5M17.7 6.3l-1.5 1.5M7.8 16.2l-1.5 1.5M17.7 17.7l-1.5-1.5M7.8 7.8 6.3 6.3" />
     </svg>
   );
 }
 
 export function EditIcon({ className = "" }: IconProps) {
   return (
     <svg {...base} className={className}>
       <path d="M14.5 5.5 18.5 9.5 8 20H4v-4L14.5 5.5Z" />
       <path d="M13 7l4 4" />
     </svg>
   );
 }
 
 /** Month-navigation arrows for the profile contribution calendar. */
 export function ChevronLeftIcon({ className = "" }: IconProps) {
   return (
     <svg {...base} className={className}>
       <path d="M14.5 6 8.5 12l6 6" />
     </svg>
   );
 }
 
 export function ChevronRightIcon({ className = "" }: IconProps) {
   return (
     <svg {...base} className={className}>
       <path d="M9.5 6l6 6-6 6" />
     </svg>
   );
 }
 
 /**
  * Icons below this line are for the Admin Portal shell
  * (components/admin/admin-nav-items.ts) — same convention as the set
  * above: plain inline SVG, aria-hidden, always paired with visible text.
  */
 
 /** Module A2 — Admin Dashboard. */
 export function GridIcon({ className = "" }: IconProps) {
   return (
     <svg {...base} className={className}>
       <rect x="4" y="4" width="7" height="7" rx="1.2" />
       <rect x="13" y="4" width="7" height="7" rx="1.2" />
       <rect x="4" y="13" width="7" height="7" rx="1.2" />
       <rect x="13" y="13" width="7" height="7" rx="1.2" />
     </svg>
   );
 }
 
 /** Module A6 — Repository Information. */
 export function GitBranchIcon({ className = "" }: IconProps) {
   return (
     <svg {...base} className={className}>
       <circle cx="6" cy="6" r="2.2" />
       <circle cx="6" cy="18" r="2.2" />
       <circle cx="18" cy="6" r="2.2" />
       <path d="M6 8.2V15.8" />
       <path d="M18 8.2V11a5 5 0 0 1-5 5H8.5" />
     </svg>
   );
 }
 
 /** Module A7 — Project Files. */
 export function FileIcon({ className = "" }: IconProps) {
   return (
     <svg {...base} className={className}>
       <path d="M7 3.5h7l4 4V19a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
       <path d="M14 3.5V8h4.3" />
       <path d="M9 12.5h6" />
       <path d="M9 16h6" />
     </svg>
   );
 }
 
 /** Module A8 — Admin Task Creation / Task Management. */
 export function ChecklistIcon({ className = "" }: IconProps) {
   return (
     <svg {...base} className={className}>
       <rect x="4" y="5.3" width="3.4" height="3.4" rx="0.8" />
       <path d="M10 7h10" />
       <rect x="4" y="12" width="3.4" height="3.4" rx="0.8" />
       <path d="M10 13.7h10" />
       <rect x="4" y="18.7" width="3.4" height="3.4" rx="0.8" />
       <path d="M10 20.4h7" />
     </svg>
   );
 }
 
 /** Module A9 — Project Preview. */
 export function EyeIcon({ className = "" }: IconProps) {
   return (
     <svg {...base} className={className}>
       <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
       <circle cx="12" cy="12" r="2.6" />
     </svg>
   );
 }
 
 /** Module A10 — Publish System. */
 export function UploadIcon({ className = "" }: IconProps) {
   return (
     <svg {...base} className={className}>
       <path d="M12 15.5V4" />
       <path d="M7.5 8.5 12 4l4.5 4.5" />
       <path d="M5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-3" />
     </svg>
   );
 }
 
 /** Module A11 — GitHub Synchronization. */
 export function RefreshIcon({ className = "" }: IconProps) {
   return (
     <svg {...base} className={className}>
       <path d="M4.5 12a7.5 7.5 0 0 1 12.6-5.5" />
       <path d="M17.5 4v3.5H14" />
       <path d="M19.5 12a7.5 7.5 0 0 1-12.6 5.5" />
       <path d="M6.5 20v-3.5H10" />
     </svg>
   );
 }
 
 /** Module A12 — Reports / Activity. */
 export function ActivityIcon({ className = "" }: IconProps) {
   return (
     <svg {...base} className={className}>
       <path d="M3.5 12h4l2-6 4.5 12 2-6h4.5" />
     </svg>
   );
 }

 /**
  * Admin Portal Master Coding Specification, section 2 — Tasks ▸ "New
  * Issues" (GitHub issues not yet represented as a DevTunnel task). Reuses
  * the open-circle-dot shape GitHub itself uses for an open issue, so the
  * glyph reads correctly at a glance next to "New Issues" in the sidebar.
  */
 export function IssueIcon({ className = "" }: IconProps) {
   return (
     <svg {...base} className={className}>
       <circle cx="12" cy="12" r="8.25" />
       <circle cx="12" cy="12" r="2.15" fill="currentColor" stroke="none" />
     </svg>
   );
 }