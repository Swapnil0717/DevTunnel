/**
 * Small inline outline icons for the app shell (sidebar nav + entry
 * actions). Kept as plain SVG instead of an icon-font/library so we don't
 * pull in a new dependency for five glyphs (Frontend_Development_Rules.txt
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