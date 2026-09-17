import {
    GitBranchIcon,
    FileIcon,
    SettingsIcon,
    UserIcon,
    CheckCircleIcon,
    EyeIcon,
    SparkleIcon,
    SearchIcon,
    IssueIcon,
    UploadIcon,
  } from "@/components/layout/nav-icons";
  import type { ContributionIconId } from "@/lib/contribute/types";
  
  /**
   * Maps the `iconId` strings in `lib/contribute/contribution-ways.ts` to
   * icons this app already ships (`components/layout/nav-icons.tsx`).
   *
   * The lookup lives here, not in the data module, for two reasons: the
   * catalog stays a plain `.ts` file with no JSX in it, and no new icon set
   * gets introduced for one page when the existing one already covers every
   * category (rule 51 — one source for shared UI, not a per-page copy).
   *
   * Every icon here is decorative: each one sits next to a text label that
   * carries the same meaning, so nothing on this page is communicated by an
   * icon alone (rule 43).
   */
  export const CONTRIBUTE_ICONS: Record<
    ContributionIconId,
    (props: { className?: string }) => JSX.Element
  > = {
    code: GitBranchIcon,
    docs: FileIcon,
    process: SettingsIcon,
    community: UserIcon,
    test: CheckCircleIcon,
    review: EyeIcon,
    design: SparkleIcon,
    triage: SearchIcon,
    issue: IssueIcon,
    release: UploadIcon,
  };
  