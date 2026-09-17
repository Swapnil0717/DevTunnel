/**
 * The catalog of ways someone can contribute to a project, and the
 * reasons people give for starting — both rendered by the Contribute
 * page's "Ways to contribute" tab.
 *
 * This is deliberately static, frontend-only data. It describes open
 * source practice in general, not anything DevTunnel fetched about a
 * particular repository, so treating it as content (one module, one
 * edit to change it everywhere) rather than as an API response keeps it
 * honest: nothing on this list is a claim about *this* project's needs.
 * The parts that *are* project-specific — the task list, the open issue
 * count, the repository links — come from the payload the page was given
 * (Frontend_Development_Rules.txt rule 58).
 *
 * Ordering inside each category runs from "smallest first contribution"
 * to "biggest", because the page's job is to get someone from reading to
 * doing, and the most common reason that doesn't happen is that the only
 * visible options look too large.
 */

 import type {
    ContributionCategory,
    ContributionCategoryId,
    ContributionWay,
  } from "@/lib/contribute/types";
  
  export const CONTRIBUTION_CATEGORIES: ContributionCategory[] = [
    {
      id: "code",
      label: "Code",
      summary: "Changes to the source itself — the work most people picture, and not the only work that counts.",
      iconId: "code",
    },
    {
      id: "non-code",
      label: "Non-code",
      summary: "Docs, translation, design and support. No pull request to the source required.",
      iconId: "docs",
    },
    {
      id: "process",
      label: "Process and tooling",
      summary: "The scaffolding around the code — issues, CI, releases, the backlog.",
      iconId: "process",
    },
    {
      id: "community",
      label: "Community",
      summary: "Looking after the people around the project rather than the repository.",
      iconId: "community",
    },
  ];
  
  export const CONTRIBUTION_WAYS: ContributionWay[] = [
    // ── Code ────────────────────────────────────────────────────────────
    {
      id: "fix-bugs",
      category: "code",
      label: "Fix a bug",
      description:
        "Pick up a reported bug, reproduce it locally, and send the smallest change that fixes it. The usual first contribution.",
      iconId: "code",
      needsCode: true,
      effort: "Small",
      repoPath: "/issues?q=is%3Aissue+is%3Aopen+label%3Abug",
      linkLabel: "Open bugs",
    },
    {
      id: "write-tests",
      category: "code",
      label: "Write or improve tests",
      description:
        "Cover a path the suite misses, or turn a bug you just fixed into a regression test. Low risk of breaking anything, and maintainers rarely say no.",
      iconId: "test",
      needsCode: true,
      effort: "Small",
    },
    {
      id: "review-prs",
      category: "code",
      label: "Review pull requests",
      description:
        "Read someone else's open PR and leave specific feedback. You learn the codebase faster reviewing than reading, and it takes load off the maintainers.",
      iconId: "review",
      needsCode: true,
      effort: "Small",
      repoPath: "/pulls",
      linkLabel: "Open pull requests",
    },
    {
      id: "refactor",
      category: "code",
      label: "Refactor or improve performance",
      description:
        "Tidy a module, remove duplication, or make a slow path faster. Agree the direction in an issue first — unsolicited rewrites are the most commonly rejected kind of PR.",
      iconId: "code",
      needsCode: true,
      effort: "Medium",
    },
    {
      id: "new-feature",
      category: "code",
      label: "Implement a feature",
      description:
        "Build something requested in an issue and already agreed with a maintainer. The largest kind of contribution, and the one that most needs a conversation before code.",
      iconId: "code",
      needsCode: true,
      effort: "Medium",
      repoPath: "/issues?q=is%3Aissue+is%3Aopen+label%3Aenhancement",
      linkLabel: "Feature requests",
    },
  
    // ── Non-code ────────────────────────────────────────────────────────
    {
      id: "docs",
      category: "non-code",
      label: "Improve the documentation",
      description:
        "Fix the setup step that no longer works, document the flag nobody explained, or add the example you wished existed when you started.",
      iconId: "docs",
      needsCode: false,
      effort: "Small",
    },
    {
      id: "answer-questions",
      category: "non-code",
      label: "Answer questions",
      description:
        "Reply to people stuck in issues or discussions. If you solved it yesterday, you're the right person to explain it today.",
      iconId: "community",
      needsCode: false,
      effort: "Small",
      repoPath: "/discussions",
      linkLabel: "Discussions",
    },
    {
      id: "triage",
      category: "non-code",
      label: "Triage issues",
      description:
        "Reproduce reports, add missing labels, close duplicates, and ask for the version and steps a report is missing. Turns a noisy backlog into a workable one.",
      iconId: "triage",
      needsCode: false,
      effort: "Ongoing",
      repoPath: "/issues?q=is%3Aissue+is%3Aopen+no%3Alabel",
      linkLabel: "Unlabelled issues",
    },
    {
      id: "translate",
      category: "non-code",
      label: "Translate the project",
      description:
        "Add or correct a locale in the interface, the README, or the docs site. Needs fluency, not a compiler.",
      iconId: "docs",
      needsCode: false,
      effort: "Medium",
    },
    {
      id: "design",
      category: "non-code",
      label: "Design UI, logos or graphics",
      description:
        "Redraw a confusing screen, propose an icon set, or contribute the illustration the README has been missing.",
      iconId: "design",
      needsCode: false,
      effort: "Medium",
    },
    {
      id: "write-about-it",
      category: "non-code",
      label: "Write a tutorial or talk about it",
      description:
        "A blog post, a video walkthrough, or a worked example. Reach is a real contribution, and it's the one maintainers can't make for themselves.",
      iconId: "docs",
      needsCode: false,
      effort: "Medium",
    },
  
    // ── Process and tooling ─────────────────────────────────────────────
    {
      id: "report-bugs",
      category: "process",
      label: "Report a bug properly",
      description:
        "Version, environment, what you expected, what happened, and the shortest steps that reproduce it. A good report is worth more than a rushed fix.",
      iconId: "issue",
      needsCode: false,
      effort: "Small",
      repoPath: "/issues/new/choose",
      linkLabel: "Open an issue",
    },
    {
      id: "feature-request",
      category: "process",
      label: "Open a well-written feature request",
      description:
        "Describe the problem you hit before the solution you want. Maintainers can then weigh it against everything else on the roadmap.",
      iconId: "issue",
      needsCode: false,
      effort: "Small",
      repoPath: "/issues/new/choose",
      linkLabel: "Open an issue",
    },
    {
      id: "ci",
      category: "process",
      label: "Improve CI or dev tooling",
      description:
        "Speed up the pipeline, add a lint or type check, or fix the local setup script that only works on one operating system.",
      iconId: "process",
      needsCode: true,
      effort: "Medium",
    },
    {
      id: "releases",
      category: "process",
      label: "Help with releases and changelogs",
      description:
        "Keep the changelog accurate, tidy release notes, or script a step someone currently does by hand every time.",
      iconId: "release",
      needsCode: false,
      effort: "Ongoing",
      repoPath: "/releases",
      linkLabel: "Releases",
    },
    {
      id: "roadmap",
      category: "process",
      label: "Groom the backlog",
      description:
        "Work through stale issues, group related ones, and surface what's actually next. Usually a role you grow into rather than start with.",
      iconId: "process",
      needsCode: false,
      effort: "Ongoing",
    },
  
    // ── Community ───────────────────────────────────────────────────────
    {
      id: "mentor",
      category: "community",
      label: "Mentor new contributors",
      description:
        "Walk someone through their first PR, or pair on an issue labelled for beginners. The fastest way a project grows a second maintainer.",
      iconId: "community",
      needsCode: false,
      effort: "Ongoing",
    },
    {
      id: "moderate",
      category: "community",
      label: "Moderate the community spaces",
      description:
        "Keep discussions, chat or the forum welcoming and on topic, and enforce the code of conduct consistently.",
      iconId: "community",
      needsCode: false,
      effort: "Ongoing",
    },
    {
      id: "organize",
      category: "community",
      label: "Organize talks or meetups",
      description:
        "Run a contributor call, give a talk, or get the project onto a conference schedule.",
      iconId: "community",
      needsCode: false,
      effort: "Ongoing",
    },
    {
      id: "funding",
      category: "community",
      label: "Help with funding",
      description:
        "Sponsorship outreach, grant applications, or setting up recurring funding so maintainers can keep working on it.",
      iconId: "community",
      needsCode: false,
      effort: "Ongoing",
    },
  ];
  
  /**
   * Why people start contributing, shown in the page rail.
   *
   * Kept short and second-person, and kept *out* of the main column on
   * purpose: someone who clicked "Contribute to this project" has already
   * decided to contribute, so motivation belongs beside the page, not in
   * front of the thing they came to do.
   */
  export const CONTRIBUTION_MOTIVATIONS: { id: string; label: string; detail: string }[] = [
    {
      id: "own-need",
      label: "You hit the problem yourself",
      detail: "Fixing it upstream means you stop carrying a local patch.",
    },
    {
      id: "learning",
      label: "Practice on a real codebase",
      detail: "Review, CI and tests on a live project teach what tutorials can't.",
    },
    {
      id: "portfolio",
      label: "Public, verifiable work",
      detail: "Merged pull requests are evidence anyone can check.",
    },
    {
      id: "community",
      label: "The people around it",
      detail: "Projects keep contributors through their maintainers, not their code.",
    },
    {
      id: "mission",
      label: "You believe in what it does",
      detail: "Privacy, accessibility, education — the project stands for something.",
    },
    {
      id: "gap",
      label: "You can see the gap",
      detail: "Stale docs, a missing translation, an unanswered issue.",
    },
  ];
  
  /** Category lookup, so a card can show its group name without a find(). */
  export const CONTRIBUTION_CATEGORY_LABEL: Record<ContributionCategoryId, string> =
    CONTRIBUTION_CATEGORIES.reduce(
      (acc, category) => {
        acc[category.id] = category.label;
        return acc;
      },
      {} as Record<ContributionCategoryId, string>,
    );