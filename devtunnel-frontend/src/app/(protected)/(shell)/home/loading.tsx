import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { HomePageSkeleton } from "@/components/home/home-page-skeleton";

/**
 * Route-level loading state for /home — the recent.design "portfolio page
 * load animation" reference: a blueprint drawing sheet that builds itself in
 * top to bottom in place of Home's real content while the first request is in
 * flight, and that `BlueprintReveal` (in `page.tsx`) replays over the loaded
 * page before wiping away.
 *
 * What it draws is `HomePageSkeleton` — the same layout `page.tsx` renders,
 * section for section ("Welcome back" heading, journey card, stat strip, recommended projects, recommended / your tasks, recently active),
 * built from the very components Home's in-page `<Suspense>` fallbacks use,
 * so the hatched blocks sit where the real content will land.
 *
 * The sheet's own padding and column are the real `<main>`'s: `px-4 py-6
 * sm:px-7 sm:pb-8 sm:pt-7` as the outer padding, and the centred
 * `max-w-[1040px]` column inside it (that column is `HomePageSkeleton`'s root).
 * Put the width cap on the padding box instead and the column is 56px
 * narrower than the real one on wide screens.
 */
export default function HomeLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 01 — Home"
      revLabel="Rev — loading your workspace"
      contentClassName="px-4 py-6 sm:px-7 sm:pb-8 sm:pt-7"
    >
      <HomePageSkeleton tone="blueprint" />
    </BlueprintSheet>
  );
}
