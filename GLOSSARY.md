# Glossary

Terms used across the DevTunnel code, docs and issues.

**Admin portal**
The private part of the frontend (`/admin`) used to import GitHub repositories, curate projects, tasks and tools, review new issues, approve AI Discovery proposals and read bug reports. It cannot merge into any GitHub repository.

**AI Discovery**
A backend agent that runs daily (and on demand) to propose projects, tasks and open source tools. Proposals wait in an admin approval queue and are never published automatically.

**AI-generated label**
Every AI search result, summary, explanation and insight in the UI is labeled as AI-generated and rendered as plain text.

**Catalog (GitHub catalog)**
The live, cached views of GitHub data: GitHub Projects, GitHub Open Source Tools and All Issues. Distinct from the curated projects and tools that DevTunnel's admins publish.

**Community submission**
A project or tool submitted by a signed-in contributor, visible publicly and upvotable.

**Contribution**
A recorded piece of work: a pull request opened with `dev submit` (on a DevTunnel task or any public repository) counts toward the contribution calendar and totals. `dev start` alone does not count.

**Contribute page**
The `/contribute` page of a project, task, tool or issue. It shows the exact `dev` commands for that item and tracks progress.

**`dev` CLI**
The `@devtunnelcli/cli` command line tool: `dev login`, `dev logout`, `dev start`, `dev test`, `dev submit`.

**Experience level**
`BEGINNER`, `INTERMEDIATE` or `ADVANCED`. Chosen in onboarding and set on tasks.

**Open source tool**
A curated tool (as opposed to a project) with a setup guide, filterable by language and label. A tool can be linked to a project and contributed to like one.

**Onboarding (contributor)**
The first-run flow where a contributor picks their intent, role, level and tech stack.

**Onboarding wizard (admin)**
The step-by-step admin flows for adding a project, a task or an open source tool to the curated catalog.

**Project**
A software project on DevTunnel with a description, tech stack, repository and tasks. A whole project can be claimed with `dev start <project-id> --project`.

**Role**
What kind of work a task needs: `FRONTEND`, `BACKEND`, `FULL_STACK`, `DOCUMENTATION`, `TESTING` or `DEVOPS`.

**Session / CLI token**
Browser sign-in uses an `httpOnly` session cookie. The CLI uses a separate long-lived bearer token. Both are stored server-side as hashes.

**Stored-first**
How AI features behave: if a fresh result already exists in the database it is returned without calling a model.

**Task**
A discrete unit of work on a project, with a role, difficulty, tech stack and a linked GitHub issue.

**Task status**
`OPEN` (unclaimed) → `IN_PROGRESS` (`dev start`) → `IN_REVIEW` (`dev submit` opened a pull request) → `DONE`. "In review" means a pull request is open, not that it was merged.

**Validation project / task** *(planned)*
Short, real tasks companies would use to evaluate developer skill through actual output. See the [roadmap](./ROADMAP.md).

**Paid task / bounty** *(planned)*
A task funded by a project owner that pays the contributor for approved work. Not available yet.