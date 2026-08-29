# DevTunnel — System Architecture

This document provides a high-level overview of DevTunnel's system architecture. For the full, detailed module-by-module breakdown (frontend screens, backend routes, and algorithm specs), see [`docs/devtunnel-workflow.md`](./docs/devtunnel-workflow.md).

---

## High-Level System Diagram

```
                         ┌──────────────────────────┐
                         │         GITHUB           │
                         │                           │
                         │ Repositories              │
                         │ Issues                    │
                         │ Pull Requests             │
                         │ Actions / CI              │
                         │ Releases                  │
                         └────────────┬──────────────┘
                                      │
                         GitHub API / OAuth / Webhooks
                                      │
                 ┌────────────────────┴────────────────────┐
                 ▼                                         ▼
     ┌─────────────────────────┐             ┌─────────────────────────┐
     │   DEVTUNNEL MAIN WEB    │             │    DEVTUNNEL ADMIN      │
     │                         │             │                         │
     │ Contributors            │             │ Private Admin Portal   │
     │ Maintainers             │             │ Add GitHub Repository  │
     │ Projects                │             │ Add Author             │
     │ Tasks                   │             │ Add Project Details    │
     │ PRs                     │             │ Add Tasks               │
     │ Dashboard               │             │ Edit / Publish          │
     │ Releases                │             │                         │
     └────────────┬────────────┘             └────────────┬────────────┘
                  │                                       │
                  └────────────────┬──────────────────────┘
                                   ▼
                         ┌──────────────────────┐
                         │  DEVTUNNEL BACKEND    │
                         │                       │
                         │ Authentication        │
                         │ Project API           │
                         │ Task API              │
                         │ GitHub Integration    │
                         │ Contributor API       │
                         │ Maintainer API        │
                         │ Admin API             │
                         │ Validation            │
                         │ PR Management         │
                         │ Webhooks              │
                         └──────────┬────────────┘
                                    ▼
                         ┌──────────────────────┐
                         │       DATABASE        │
                         │                       │
                         │ Users                 │
                         │ Projects              │
                         │ Authors               │
                         │ Tasks                 │
                         │ Contributions         │
                         │ PRs                   │
                         │ Releases              │
                         │ Admin Data            │
                         └──────────────────────┘
```

---

## Core Services

### 1. Main Website
Where contributors and maintainers interact with DevTunnel — discovering projects, choosing roles, working on tasks, and tracking contributions.

### 2. Admin Portal
A private, internally-facing portal used to import GitHub repositories, curate project metadata, define tasks, and control what gets published to the main website.

**Important boundary:** The Admin can *load and curate* repository and task data, but has **no authority to merge pull requests into the original GitHub repository**. That authority remains exclusively with the original repository owner or their authorized maintainers.

### 3. Backend
A shared API layer handling authentication, project/task/contributor/maintainer/admin operations, GitHub integration, validation, and webhook processing — backed by a single relational database.

---

## Key Modules

| Module | Purpose |
|---|---|
| **Authentication** | GitHub OAuth 2.0 login for contributors and maintainers |
| **Project Discovery** | Search, filter, and rank projects by relevance to the contributor |
| **Project Preview** | Repository stats, tech stack, tasks, and a Project Health Score |
| **Project Workspace** | Overview, tasks, guidelines, roles, and contributor list for a given project |
| **Role & Prerequisite Matching** | Compares contributor skills against role requirements |
| **Task Management** | Contributor-facing task list + maintainer-facing kanban (Backlog → Ready → In Progress → Review → Testing → Completed) |
| **Admin Project Import** | Load a GitHub repo, define project metadata, tasks, and author |
| **Admin Publish Workflow** | Draft → Review → Published state machine gating what's public |
| **GitHub Synchronization** | Incremental sync of repository metadata into DevTunnel's database |

Full frontend screens, backend routes, and request/response flows for each module are documented in [`docs/devtunnel-workflow.md`](./docs/devtunnel-workflow.md).

---

## Algorithm Layer

DevTunnel's intelligence layer is organized into three functional groups:

```
                         ALGORITHM ENGINE
                                │
       ┌────────────────────────┼────────────────────────┐
       ▼                        ▼                        ▼
   MATCHING                  ANALYSIS                 DETECTION
       │                        │                        │
       ├── Project Match        ├── Difficulty           ├── Duplicate Tasks
       ├── Task Match           ├── Project Health        ├── Conflicts
       ├── Role Match           ├── PR Risk               ├── Relevant Files
       └── Recommendation       ├── Task Priority         └── Repository Changes
                                └── Contribution Data
```

**Design principle:** Start with simple, deterministic, explainable rules — not machine learning — for the first version. As real contribution data accumulates, progressively layer in more sophisticated approaches:

```
Phase 1 — Simple Rules
Phase 2 — Weighted Scoring
Phase 3 — Similarity + Repository Analysis
Phase 4 — Historical Data
Phase 5 — Machine Learning / Advanced AI
```

Examples of algorithms used across modules include OAuth 2.0 (authentication), weighted scoring (recommendations, project health), hybrid search + ranking (project discovery), skill matching (role fit), state machines (publish workflow), and incremental sync (GitHub integration). See `docs/devtunnel-workflow.md` for the full algorithm-by-module breakdown.

---

## Access & Permission Boundaries

A core architectural rule that spans multiple modules: **DevTunnel's Admin layer curates and publishes project data, but never gains write/merge access to a contributor's or repository owner's actual GitHub repository.**

```
DevTunnel Admin
      ↓
Load Repository + Tasks
      ↓
Curate / Publish on DevTunnel
      ✗ Cannot Merge to Original Repository

Original Repository Owner / Authorized Maintainer
      ↓
Reviews Contributor PRs
      ↓
Merges (on GitHub directly)
```

This keeps DevTunnel as a coordination and discovery layer on top of GitHub, not a replacement for repository ownership or GitHub's own permission model.

---

## Related Documents

- [`docs/devtunnel-idea.md`](./docs/devtunnel-idea.md) — product vision, project types, monetization model, and phased roadmap
- [`docs/devtunnel-workflow.md`](./docs/devtunnel-workflow.md) — full module-by-module architecture, API routes, and algorithm specs
- [`ROADMAP.md`](./ROADMAP.md) — phased build plan
- [`GLOSSARY.md`](./GLOSSARY.md) — definitions of DevTunnel-specific terms