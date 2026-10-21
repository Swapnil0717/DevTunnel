"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PROJECT_GITHUB_URL } from "@/lib/config";
import { Ic } from "./icon";

type MenuKey = "explore" | "contribute" | "resources";

type MenuItem = {
  href: string;
  icon: string;
  title: string;
  /** Description in the desktop panel. */
  desc: ReactNode;
  /** Shorter description in the mobile menu. */
  short: string;
};

const repoFile = (name: string) => `${PROJECT_GITHUB_URL}/blob/main/${name}`;

const CURATED: MenuItem[] = [
  {
    href: "/projects",
    icon: "folder",
    title: "Projects",
    desc: "Open source projects with their stack, repository and tasks. Filter by tech.",
    short: "Filter by tech stack",
  },
  {
    href: "/tasks",
    icon: "task",
    title: "Tasks",
    desc: "Work with a role, level and tech stack, ready to claim with the CLI.",
    short: "By role, level and stack",
  },
  {
    href: "/opensource-tools",
    icon: "pkg",
    title: "Open source tools",
    desc: "Tools filterable by language and label, each with a setup guide.",
    short: "With setup guides",
  },
];

const LIVE: MenuItem[] = [
  {
    href: "/github-projects",
    icon: "gh",
    title: "GitHub Projects",
    desc: "Browse public repositories by stars, then contribute to any of them.",
    short: "Live from GitHub",
  },
  {
    href: "/github-open-source-tools",
    icon: "pkg",
    title: "GitHub Open Source Tools",
    desc: "Developer tools found on GitHub, with stars and activity.",
    short: "Live from GitHub",
  },
  {
    href: "/issues",
    icon: "issue",
    title: "All Issues",
    desc: "Open issues across repositories. Any public one works with the CLI.",
    short: "Any public issue works with the CLI",
  },
];

const HOW: MenuItem[] = [
  {
    href: "/#cli",
    icon: "term",
    title: "The dev CLI",
    desc: "Login, start, test and submit from your terminal. Opens the PR for you.",
    short: "Login, start, test, submit",
  },
  {
    href: "/#lifecycle",
    icon: "flow",
    title: "Task lifecycle",
    desc: "Open, in progress, PR submitted, done. Recorded from real actions.",
    short: "Four recorded stages",
  },
  {
    href: "/#features",
    icon: "spark",
    title: "AI help",
    desc: "Search in plain words and get issues explained. Always labeled AI-generated.",
    short: "Always labeled AI-generated",
  },
];

const START: MenuItem[] = [
  {
    href: "/issues",
    icon: "issue",
    title: "A GitHub issue",
    desc: "Any public repository. Counts as a DevTunnel contribution.",
    short: "",
  },
  {
    href: "/tasks",
    icon: "task",
    title: "A DevTunnel task",
    desc: "Curated, with a role and difficulty.",
    short: "",
  },
  {
    href: "/projects",
    icon: "folder",
    title: "A whole project",
    desc: (
      <>
        Claim the project itself with{" "}
        <span className="mono-flag">--project</span>.
      </>
    ),
    short: "",
  },
];

const LEARN: MenuItem[] = [
  {
    href: "/#faq",
    icon: "book",
    title: "FAQ",
    desc: "What DevTunnel is, what it costs, and how the CLI works.",
    short: "Cost, CLI, how it works",
  },
  {
    href: repoFile("CONTRIBUTING.md"),
    icon: "heart",
    title: "Contributing guide",
    desc: "How to contribute to DevTunnel itself.",
    short: "",
  },
  {
    href: repoFile("ARCHITECTURE.md"),
    icon: "layers",
    title: "Architecture",
    desc: "How the frontend, backend and CLI fit together.",
    short: "",
  },
];

const PROJECT: MenuItem[] = [
  {
    href: repoFile("CHANGELOG.md"),
    icon: "log",
    title: "Changelog",
    desc: "What has changed, release by release.",
    short: "",
  },
  {
    href: repoFile("SECURITY.md"),
    icon: "shield",
    title: "Security",
    desc: "How to report a vulnerability privately.",
    short: "Report a vulnerability",
  },
  {
    href: "/contact",
    icon: "mail",
    title: "Contact",
    desc: "Reach the team at contact@devtunnel.tech.",
    short: "",
  },
];

const MOBILE_RESOURCES: MenuItem[] = [
  LEARN[0]!,
  {
    href: repoFile("ROADMAP.md"),
    icon: "map",
    title: "Roadmap",
    desc: "",
    short: "Phase 1: build and validate",
  },
  PROJECT[1]!,
];

const isExternal = (href: string) => href.startsWith("http");

/** A link that is a Next.js <Link> inside the site and a new-tab <a> outside it. */
function NavLink({
  href,
  className,
  onClick,
  children,
}: {
  href: string;
  className?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  if (isExternal(href)) {
    return (
      <a
        href={href}
        className={className}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}

function MenuRow({
  item,
  mobile,
  onNavigate,
}: {
  item: MenuItem;
  mobile?: boolean;
  onNavigate: () => void;
}) {
  return (
    <NavLink href={item.href} className="mi" onClick={onNavigate}>
      <span className="tile">
        <Ic id={item.icon} />
      </span>
      <span>
        <span className="mt">{item.title}</span>
        <span className="md">{mobile ? item.short : item.desc}</span>
      </span>
    </NavLink>
  );
}

const MENU_LABELS: Record<MenuKey, string> = {
  explore: "Explore",
  contribute: "Contribute",
  resources: "Resources",
};

/**
 * Landing page header: the bar, three mega menus (desktop) and the burger
 * sheet (mobile). Only the bar's links go to real pages; everything in the
 * panels points at pages or repository files that exist.
 */
export function HomeHeader() {
  const router = useRouter();
  const [open, setOpen] = useState<MenuKey | null>(null);
  const [mobile, setMobile] = useState(false);
  const [acc, setAcc] = useState<MenuKey | null>("explore");

  const closeAll = useCallback(() => {
    setOpen(null);
    setMobile(false);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(null);
        setMobile(false);
        return;
      }
      // "/" jumps to search, unless the visitor is typing somewhere.
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      router.push("/projects");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

  const toggleMenu = (key: MenuKey) => setOpen((cur) => (cur === key ? null : key));
  const hoverMenu = (key: MenuKey) => setOpen((cur) => (cur ? key : cur));

  const barButton = (key: MenuKey) => (
    <button
      key={key}
      className={`nb${open === key ? " on" : ""}`}
      type="button"
      aria-expanded={open === key}
      aria-controls={`menu-${key}`}
      onClick={() => toggleMenu(key)}
      onMouseEnter={() => hoverMenu(key)}
    >
      {MENU_LABELS[key]} <Ic id="chev" className="chev" />
    </button>
  );

  const mobileGroups: Array<{ key: MenuKey; items: MenuItem[] }> = [
    { key: "explore", items: [...CURATED, ...LIVE] },
    { key: "contribute", items: HOW },
    { key: "resources", items: MOBILE_RESOURCES },
  ];

  return (
    <>
      <header style={{ position: "relative", zIndex: 30 }}>
        <div className="bar">
          <button
            className="burger"
            type="button"
            aria-label={mobile ? "Close menu" : "Open menu"}
            aria-expanded={mobile}
            aria-controls="m-sheet"
            onClick={() => setMobile((v) => !v)}
          >
            <Ic id={mobile ? "x" : "menu"} />
          </button>
          <Link className="logo" href="/" aria-label="DevTunnel home" onClick={closeAll}>
            <Image src="/logo.png" alt="DevTunnel" width={1643} height={262} priority />
          </Link>

          <nav className="nav" aria-label="Primary">
            {barButton("explore")}
            {barButton("contribute")}
            {barButton("resources")}
            <Link className="nb" href="/submissions">
              Community
            </Link>
          </nav>

          <div className="right">
            <Link className="search" href="/projects" aria-label="Search projects, tasks and issues">
              <Ic id="search" />
              <span>Search projects, tasks, issues…</span>
              <kbd className="kbd">/</kbd>
            </Link>
            <Link className="cta" href="/login">
              <Ic id="gh" size={17} />
              Sign in
            </Link>
          </div>
        </div>

        <button
          className="scrim"
          type="button"
          aria-label="Close menu"
          hidden={open === null}
          onClick={() => setOpen(null)}
        />

        {/* ============ EXPLORE ============ */}
        <div
          className="panel"
          id="menu-explore"
          hidden={open !== "explore"}
          role="region"
          aria-label="Explore DevTunnel"
        >
          <div className="pgrid">
            <div className="pcol">
              <p className="plabel">Curated on DevTunnel</p>
              {CURATED.map((i) => (
                <MenuRow key={i.href} item={i} onNavigate={closeAll} />
              ))}
            </div>
            <div className="pcol">
              <p className="plabel">
                Live from GitHub{" "}
                <span className="live">
                  <span className="dot" />
                  cached, refreshed often
                </span>
              </p>
              {LIVE.map((i) => (
                <MenuRow key={i.href} item={i} onNavigate={closeAll} />
              ))}
            </div>
            <div className="widget">
              <p className="plabel" style={{ margin: 0 }}>
                Match your profile
              </p>
              <h3 className="wtitle">Find work that fits the skills you have</h3>
              <div className="chips">
                {["Frontend", "Backend", "Full stack", "Documentation", "Testing", "DevOps"].map((r) => (
                  <span key={r} className="tag t-skill">
                    {r}
                  </span>
                ))}
              </div>
              <div className="chips">
                {["Beginner", "Intermediate", "Advanced"].map((l) => (
                  <span key={l} className="tag t-int">
                    {l}
                  </span>
                ))}
              </div>
              <p className="wtext">Six roles and three levels, the same ones you pick in onboarding.</p>
              <Link className="more" href="/tasks" onClick={closeAll}>
                Browse tasks <Ic id="arrow" size={15} />
              </Link>
            </div>
          </div>
          <div className="pfoot">
            <span>No task needed. Any public GitHub issue works:</span>
            <code>dev start owner/repo#123</code>
            <Link href="/#cli" onClick={closeAll}>
              See all commands <Ic id="arrow" size={15} />
            </Link>
          </div>
        </div>

        {/* ============ CONTRIBUTE ============ */}
        <div
          className="panel"
          id="menu-contribute"
          hidden={open !== "contribute"}
          role="region"
          aria-label="Contribute with DevTunnel"
          style={{ left: 130 }}
        >
          <div className="pgrid">
            <div className="pcol">
              <p className="plabel">How it works</p>
              {HOW.map((i) => (
                <MenuRow key={i.href} item={i} onNavigate={closeAll} />
              ))}
            </div>
            <div className="pcol">
              <p className="plabel">Start from</p>
              {START.map((i) => (
                <MenuRow key={i.href} item={i} onNavigate={closeAll} />
              ))}
            </div>
            <div className="widget">
              <p className="plabel" style={{ margin: 0 }}>
                Quick start
              </p>
              <h3 className="wtitle">Your first pull request, five commands</h3>
              <div className="term">
                <i>$</i> npm i -g <b>@devtunnelcli/cli</b>
                <br />
                <i>$</i> dev login
                <br />
                <i>$</i> dev start owner/repo#123
                <br />
                <i>$</i> dev test
                <br />
                <i>$</i> dev submit
              </div>
              <Link className="more" href="/login" onClick={closeAll}>
                <Ic id="gh" size={15} /> Sign in with GitHub
              </Link>
            </div>
          </div>
          <div className="pfoot">
            <span>Node.js 18.18 or newer. Prefer no install?</span>
            <code>npx @devtunnelcli/cli &lt;command&gt;</code>
            <Link href="/#faq" onClick={closeAll}>
              Questions <Ic id="arrow" size={15} />
            </Link>
          </div>
        </div>

        {/* ============ RESOURCES ============ */}
        <div
          className="panel"
          id="menu-resources"
          hidden={open !== "resources"}
          role="region"
          aria-label="Resources"
          style={{ left: 262 }}
        >
          <div className="pgrid">
            <div className="pcol">
              <p className="plabel">Learn</p>
              {LEARN.map((i) => (
                <MenuRow key={i.href} item={i} onNavigate={closeAll} />
              ))}
            </div>
            <div className="pcol">
              <p className="plabel">Project</p>
              {PROJECT.map((i) => (
                <MenuRow key={i.href} item={i} onNavigate={closeAll} />
              ))}
            </div>
            <div className="widget">
              <p className="plabel" style={{ margin: 0 }}>
                Roadmap
              </p>
              <h3 className="wtitle">Phase 1: build and validate</h3>
              <p className="wtext">
                The core platform is free. Paid tasks and premium infrastructure are planned and not
                available yet.
              </p>
              <div className="chips">
                <span className="tag t-tech">Core platform: free</span>
                <span className="tag t-int">Paid tasks: planned</span>
              </div>
              <NavLink className="more" href={repoFile("ROADMAP.md")} onClick={closeAll}>
                <Ic id="map" size={15} /> Read the roadmap
              </NavLink>
            </div>
          </div>
          <div className="pfoot">
            <span>Terms, privacy and cookies live in the footer.</span>
            <Link href="/privacy" onClick={closeAll}>
              Privacy <Ic id="arrow" size={15} />
            </Link>
          </div>
        </div>
      </header>

      {/* ============ MOBILE MENU ============ */}
      <nav id="m-sheet" className="sheet" aria-label="Primary mobile" hidden={!mobile}>
        <Link className="msearch" href="/projects" onClick={closeAll}>
          <Ic id="search" />
          Search projects, tasks, issues…
        </Link>
        {mobileGroups.map(({ key, items }) => {
          const on = acc === key;
          return (
            <div key={key} style={{ display: "contents" }}>
              <button
                className={`acc${on ? " on" : ""}`}
                type="button"
                aria-expanded={on}
                onClick={() => setAcc(on ? null : key)}
              >
                {MENU_LABELS[key]} <Ic id="chev" className="chev" />
              </button>
              <div className="sub" hidden={!on}>
                {items.map((i) => (
                  <MenuRow key={i.href + i.title} item={i} mobile onNavigate={closeAll} />
                ))}
              </div>
            </div>
          );
        })}
        <Link className="link" href="/submissions" onClick={closeAll}>
          Community
        </Link>
        <Link className="cta" href="/login" onClick={closeAll}>
          <Ic id="gh" size={18} />
          Sign in with GitHub
        </Link>
      </nav>
      <button
        className="mscrim"
        type="button"
        aria-label="Close menu"
        hidden={!mobile}
        onClick={() => setMobile(false)}
      />
    </>
  );
}
