"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { CommandBlock } from "@/components/contribute/command-block";
import { SPONSOR_URL } from "@/lib/config";
import { ArrowRightIcon, BookIcon, ChevronLeftIcon, ChevronRightIcon } from "./nav-icons";

/**
 * The header's "Guide" popup, drawn as an open book: how a signed-in
 * contributor does each thing in DevTunnel, from the first sign-in to a
 * merged pull request.
 *
 * Layout: a two-page spread from `md` up (left page: chapter title, intro and
 * a tip; right page: the numbered steps), one page above the other below it.
 * The first spread is the cover and contents. Chapters are reachable from the
 * contents list, from the tabs on the book's edge (a scrolling row on a
 * phone), from the Previous / Next buttons and from the left / right arrow
 * keys. Turning a page slides the new spread in, but only for people who
 * haven't asked their system for reduced motion.
 *
 * What it says is taken from the app itself: the sidebar's pages, the task
 * stages in `lib/tasks/progress.ts` and the commands in `devtunnel-cli`. The
 * commands shown use the placeholder `<task-id>` on purpose — each task's own
 * Contribute page shows them with the real id filled in, so the real ones
 * can't go stale here. Only a signed-in person is offered the Guide (see
 * `AppHeader`), which is why it can talk about "your" tasks and profile.
 */

interface GuideStep {
  title: string;
  body: string;
  /** Shell commands shown in a copyable block under the step. */
  commands?: string[];
  /** An in-app page to jump to; opening it closes the Guide. */
  href?: string;
  hrefLabel?: string;
}

interface GuideChapter {
  id: string;
  /** Short label on the edge tab. */
  tab: string;
  title: string;
  intro: string;
  tip: string;
  steps: GuideStep[];
}

const CHAPTERS: readonly GuideChapter[] = [
  {
    id: "getting-started",
    tab: "Get started",
    title: "Getting started",
    intro:
      "You sign in with GitHub and tell DevTunnel what you work with, so it can recommend the right work for you.",
    tip: "Anyone can browse the lists. An account is what lets you claim tasks and track your progress.",
    steps: [
      {
        title: "Sign in with GitHub",
        body: "Your GitHub account is your DevTunnel account. There is no separate password.",
      },
      {
        title: "Finish onboarding once",
        body: "Choose your developer role, experience level, skills, technologies and interests. The match percentages on cards come from these.",
      },
      {
        title: "Start from Home",
        body: "Home shows your contributor journey, your task counts, recommended projects and recommended tasks.",
        href: "/home",
        hrefLabel: "Open Home",
      },
    ],
  },
  {
    id: "find-a-project",
    tab: "Find a project",
    title: "Find a project",
    intro:
      "DevTunnel has four kinds of list. Each makes a different promise, so start with the curated ones.",
    tip: "Only Projects and Open Source Tools on Devtunnel have DevTunnel tasks attached.",
    steps: [
      {
        title: "Projects on Devtunnel",
        body: "Curated and onboarded, with tasks attached. Search, filter by tech stack, or show only the ones recommended for you.",
        href: "/projects",
        hrefLabel: "Browse projects",
      },
      {
        title: "Open Source Tools on Devtunnel",
        body: "Curated tools you can contribute to. Filter by language and label.",
        href: "/opensource-tools",
        hrefLabel: "Browse tools",
      },
      {
        title: "Ask AI to search",
        body: "On the project and tool lists, describe what you want in your own words and the list narrows to match.",
      },
      {
        title: "GitHub lists and Community",
        body: "Github Projects and Github Open source tools are live GitHub searches. Community holds projects other contributors submitted, unreviewed.",
        href: "/github-projects",
        hrefLabel: "Browse Github Projects",
      },
    ],
  },
  {
    id: "pick-a-task",
    tab: "Pick a task",
    title: "Pick a task",
    intro: "A task is a GitHub issue with a clear brief, ready for you to claim.",
    tip: "Choose one that fits your level. Difficulty is a filter on the Tasks page.",
    steps: [
      {
        title: "Browse Tasks / Issues",
        body: "Filter by role, difficulty, tech stack and project.",
        href: "/tasks",
        hrefLabel: "Open Tasks",
      },
      {
        title: "Open the task page",
        body: "It shows the project background, the task brief, the linked GitHub issue and an AI explanation in plain words.",
      },
      {
        title: "Check All Issues",
        body: "Every open issue across onboarded projects. A row opens the issue on GitHub.",
        href: "/issues",
        hrefLabel: "Open All Issues",
      },
      {
        title: "Press Contribute",
        body: "The task's Contribute page shows the CLI commands with its id already filled in, and the manual fork-to-pull-request route too.",
      },
    ],
  },
  {
    id: "use-the-cli",
    tab: "Use the CLI",
    title: "Work with the CLI",
    intro:
      "A handful of short commands take you from a claimed task to an open pull request.",
    tip: "Copy commands from the task's Contribute page, where the real task id is already in place. dev logout signs the CLI out.",
    steps: [
      {
        title: "Install once",
        body: "This gives you the dev command.",
        commands: ["npm install -g @devtunnelcli/cli"],
      },
      {
        title: "Sign in from the terminal",
        body: "Opens your browser to sign in with GitHub. Run it once per machine.",
        commands: ["dev login"],
      },
      {
        title: "Start the task",
        body: "Forks the repository, claims the task and checks out a working branch.",
        commands: ["dev start <task-id>"],
      },
      {
        title: "Test your change",
        body: "Pulls in upstream changes if you're behind, then runs every testable project in the repo. Run it as often as you like.",
        commands: ["dev test"],
      },
      {
        title: "Submit",
        body: "Commits, pushes and opens the pull request.",
        commands: ["dev submit <task-id>"],
      },
    ],
  },
  {
    id: "track-progress",
    tab: "Track progress",
    title: "Track your progress",
    intro: "Every task moves through the same four stages, and Home shows where you are.",
    tip: "Only dev start and dev submit change a task's stage, so what you see is always what actually happened.",
    steps: [
      { title: "Open", body: "Available to pick up." },
      {
        title: "Started",
        body: "You ran dev start. The repository is forked and you're working on it.",
      },
      {
        title: "PR submitted",
        body: "You ran dev submit. The pull request is open and waiting on review.",
      },
      {
        title: "Done",
        body: "The work is merged. The task counts on your Profile, next to your stats and milestones.",
        href: "/profile",
        hrefLabel: "Open Profile",
      },
    ],
  },
  {
    id: "your-account",
    tab: "Your account",
    title: "Community and settings",
    intro: "Give back, keep your profile current, and tell us when something breaks.",
    tip: "The more accurate your skills and technologies, the better your recommendations.",
    steps: [
      {
        title: "Submit to Community",
        body: "Add a project or tool you built or use. A short wizard imports its README.",
        href: "/submissions/new",
        hrefLabel: "Submit a project or tool",
      },
      {
        title: "Update Settings",
        body: "Change your bio, skills, technologies and interests.",
        href: "/settings",
        hrefLabel: "Open Settings",
      },
      {
        title: "Report a bug",
        body: "Use Found a bug in the top bar. A short form opens over the page, so you keep your place.",
      },
      ...(SPONSOR_URL
        ? [
            {
              title: "Sponsor us",
              body: "Optional. The Sponsor us button in the top bar opens the support page in a new tab.",
            },
          ]
        : []),
    ],
  },
];

/** Spread 0 is the cover and contents; spread N is `CHAPTERS[N - 1]`. */
const LAST_SPREAD = CHAPTERS.length;

const LINK_CLASS =
  "inline-flex items-center gap-1 rounded text-[12.5px] text-accent transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function PageNumber({ value, side }: { value: number; side: "left" | "right" }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute bottom-3 font-mono text-[11px] text-text-faint ${
        side === "left" ? "left-6" : "right-6"
      }`}
    >
      {value}
    </span>
  );
}

function Cover({ onOpen }: { onOpen: (spread: number) => void }) {
  return (
    <>
      <section className="relative flex flex-col justify-center bg-surface px-6 py-8 md:min-h-[400px] md:border-r md:border-border-subtle">
        <BookIcon className="h-9 w-9 text-accent" />
        <h3 className="m-0 mt-4 font-serif text-[28px] font-normal leading-tight text-text">
          The DevTunnel guide
        </h3>
        <p className="m-0 mt-3 max-w-[300px] text-[13.5px] leading-relaxed text-text-muted">
          How to do things as a signed-in contributor, from your first sign-in to a merged pull
          request.
        </p>
        <button
          type="button"
          onClick={() => onOpen(1)}
          className="mt-6 inline-flex w-fit items-center gap-2 rounded-md border border-border px-3.5 py-2 text-[13px] text-text transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Start reading
          <ArrowRightIcon className="h-4 w-4" />
        </button>
      </section>

      <section className="relative bg-surface-raised px-6 py-8 md:min-h-[400px]">
        <h3 className="m-0 font-serif text-[20px] font-normal text-text">Contents</h3>
        <ol className="m-0 mt-3 flex list-none flex-col p-0">
          {CHAPTERS.map((chapter, index) => (
            <li key={chapter.id} className="border-t border-border-subtle first:border-t-0">
              <button
                type="button"
                onClick={() => onOpen(index + 1)}
                className="flex w-full items-center gap-3 rounded py-2.5 text-left transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span
                  aria-hidden="true"
                  className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-accent/60 font-serif text-[11.5px] text-accent"
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 text-[14px] text-text">{chapter.title}</span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-text-faint" />
              </button>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function ChapterSpread({
  chapter,
  number,
  onNavigate,
}: {
  chapter: GuideChapter;
  number: number;
  onNavigate: () => void;
}) {
  return (
    <>
      <section className="relative bg-surface px-6 pb-12 pt-8 md:min-h-[400px] md:border-r md:border-border-subtle">
        <p className="m-0 text-[11.5px] uppercase tracking-[0.08em] text-accent">
          Chapter {number}
        </p>
        <h3 className="m-0 mt-2 font-serif text-[27px] font-normal leading-tight text-text">
          {chapter.title}
        </h3>
        <p className="m-0 mt-3 text-[14px] leading-relaxed text-text-secondary">{chapter.intro}</p>
        <p className="m-0 mt-5 rounded-[8px] border border-border-subtle bg-bg px-3.5 py-3 text-[12.5px] leading-relaxed text-text-muted">
          <span className="text-text-secondary">Good to know. </span>
          {chapter.tip}
        </p>
        <PageNumber value={number * 2} side="left" />
      </section>

      <section className="relative bg-surface-raised px-6 pb-12 pt-8 md:min-h-[400px]">
        <ol className="m-0 flex list-none flex-col p-0">
          {chapter.steps.map((step, index) => (
            <li
              key={step.title}
              className="flex gap-3 border-t border-border-subtle py-3.5 first:border-t-0 first:pt-0"
            >
              <span
                aria-hidden="true"
                className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-accent/60 font-serif text-[11.5px] text-accent"
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[14px] font-medium text-text">{step.title}</p>
                <p className="m-0 mt-0.5 text-[12.5px] leading-relaxed text-text-muted">
                  {step.body}
                </p>
                {step.commands ? (
                  <div className="mt-2">
                    <CommandBlock commands={step.commands} label={step.title} />
                  </div>
                ) : null}
                {step.href ? (
                  <Link href={step.href} onClick={onNavigate} className={`${LINK_CLASS} mt-1.5`}>
                    {step.hrefLabel ?? "Open"}
                    <ArrowRightIcon className="h-3.5 w-3.5" />
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        <PageNumber value={number * 2 + 1} side="right" />
      </section>
    </>
  );
}

const NAV_BUTTON =
  "inline-flex items-center gap-1.5 rounded-md border border-border px-3.5 py-2 text-[13px] text-text transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function GuideDialog({ onClose }: { onClose: () => void }) {
  const [spread, setSpread] = useState(0);

  // Left / right arrow keys turn the page (Esc and Tab are the Dialog's own).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      if (event.key === "ArrowRight") setSpread((s) => Math.min(LAST_SPREAD, s + 1));
      if (event.key === "ArrowLeft") setSpread((s) => Math.max(0, s - 1));
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const chapter = spread > 0 ? CHAPTERS[spread - 1] : null;

  return (
    <Dialog
      size="lg"
      title="DevTunnel guide"
      description="How to do things as a signed-in contributor."
      onRequestClose={onClose}
    >
      <div className="mt-4 flex flex-col gap-2 md:flex-row md:gap-0">
        <nav
          aria-label="Guide chapters"
          className="order-first -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:order-last md:mx-0 md:w-[128px] md:shrink-0 md:flex-col md:overflow-visible md:px-0 md:pb-0 md:pt-3"
        >
          <button
            type="button"
            onClick={() => setSpread(0)}
            aria-current={spread === 0 ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap rounded-md border px-3 py-1.5 text-left text-[12px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:rounded-l-none md:border-l-0 ${
              spread === 0
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border-subtle bg-bg text-text-muted hover:text-text"
            }`}
          >
            Contents
          </button>
          {CHAPTERS.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSpread(index + 1)}
              aria-current={spread === index + 1 ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-md border px-3 py-1.5 text-left text-[12px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:rounded-l-none md:border-l-0 ${
                spread === index + 1
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border-subtle bg-bg text-text-muted hover:text-text"
              }`}
            >
              {item.tab}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 overflow-hidden rounded-[10px] border border-border md:rounded-r-none">
          <div
            key={spread}
            className="grid grid-cols-1 motion-safe:animate-page-in md:grid-cols-2"
          >
            {chapter ? (
              <ChapterSpread chapter={chapter} number={spread} onNavigate={onClose} />
            ) : (
              <Cover onOpen={setSpread} />
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setSpread((s) => Math.max(0, s - 1))}
          className={`${NAV_BUTTON} ${spread === 0 ? "invisible" : ""}`}
          tabIndex={spread === 0 ? -1 : 0}
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Previous
        </button>
        <span className="font-mono text-[11.5px] text-text-faint">
          {spread === 0 ? "Cover" : `Chapter ${spread} of ${CHAPTERS.length}`}
        </span>
        {spread === LAST_SPREAD ? (
          <button type="button" onClick={onClose} className={NAV_BUTTON}>
            Close guide
          </button>
        ) : (
          <button type="button" onClick={() => setSpread((s) => s + 1)} className={NAV_BUTTON}>
            Next
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </Dialog>
  );
}
