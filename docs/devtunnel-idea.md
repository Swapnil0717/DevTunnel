# DevTunnel — Product Idea and Vision

This document explains the idea behind DevTunnel: what problem it solves, who it is for, where it is today, and where it is meant to go. It is a product document, not a technical one. For how the system is built, see [`ARCHITECTURE.md`](../ARCHITECTURE.md). For the phased plan, see [`ROADMAP.md`](../ROADMAP.md).

DevTunnel is open source under the [MIT License](../LICENSE).

> **Reading this document:** each part is marked **Available today** or **Planned**. Anything marked Planned is part of the vision and is not available yet.

---

## 1. The idea in one sentence

DevTunnel connects contributors with open source projects: tasks are matched to your role, level and tech stack, and a CLI opens the pull request. Real project activity builds a trusted history of what a developer has actually worked on.

The longer-term vision is a software project ecosystem, a **project network plus developer infrastructure**, where developers, founders, startups and companies create and collaborate on real software projects.

## 2. The problem

- **Contributors** want real projects to work on, but finding a suitable issue, forking, branching, testing and opening a pull request is slow and full of friction, especially for a first contribution.
- **Project owners** need help, but good first tasks are hard to find and describe, and contributors rarely arrive already matched to the work.
- **Skills are self-reported.** Resumes and quizzes say little about what someone has really shipped.

## 3. Two pillars

DevTunnel combines two things:

```
                         DEVTUNNEL
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
      PROJECT NETWORK                  INFRASTRUCTURE
   projects · people · work      tunneling · domains · monitoring
       (Available today)                  (Planned)
```

1. **A software project network** — a place to discover, contribute to and collaborate on real software projects. This is what DevTunnel is today.
2. **Developer infrastructure** — tunneling, custom domains, monitoring and logging to build, test and share those projects. This is planned and **not built yet**.

## 4. The project is the center

The central entity of DevTunnel is the **software project**. A project can have a description, tech stack, requirements, a repository, tasks, contributors and access rules.

```
PROJECT CREATED → PUBLISHED → DISCOVERED → CONTRIBUTED TO → GROWN
```

## 5. Where DevTunnel is today

**Available today**

- Curated **projects**, **tasks** and **open source tools**, filterable by tech stack, role (Frontend, Backend, Full stack, Documentation, Testing, DevOps) and experience level (Beginner, Intermediate, Advanced).
- Live **GitHub catalogs** (projects, tools, issues) and **community submissions**.
- The **`dev` CLI**: `dev login`, `dev start`, `dev test`, `dev submit`. It works on DevTunnel tasks and on **any public GitHub issue**, and the work still counts as a DevTunnel contribution.
- **Task progress recorded from real actions**: `OPEN` → `IN_PROGRESS` (`dev start`) → `IN_REVIEW` (`dev submit` opened a pull request) → `DONE`. "In review" means a pull request is open, not merged.
- **Contributor profiles** with a contribution calendar, stats and milestones.
- **AI help, always labeled AI-generated**: search the catalog in plain words, project and tool summaries, issue explanations, and issue insights.
- A **private admin portal** for curating projects, tasks and tools, with an AI Discovery agent that proposes items for approval.
- Free core platform.

**A firm boundary:** DevTunnel is a coordination and discovery layer on top of GitHub. The admin side can load and curate data, but it **cannot merge** into the original repository. Merge authority always stays with the repository owner, and pull requests are opened with the contributor's own GitHub token.

## 6. Project types

| Type | What it is | Status |
|---|---|---|
| **Open source** | Publicly discoverable projects open to community contribution | **Available today** |
| **Private** | Restricted-access projects with defined requirements (skills, experience, prior activity) | Planned |
| **Paid / bounty** | Projects with funded tasks; contributors are paid for approved work | Planned |
| **Validation** | Short, real tasks companies use to evaluate developer skill through actual output | Planned |

### Open source projects (available today)

Used to grow a project, find contributors, build a community, get help with bugs and features, and let developers gain real experience. Example: someone builds an open source SaaS project and needs help with frontend, backend, documentation and testing; other developers discover it and contribute.

### Private projects (planned)

Available only to selected developers. The owner defines requirements such as technologies, skills, experience level, previous project work and previous DevTunnel activity. Over time this could include restricted access, private tasks, team collaboration and shared infrastructure.

### Paid projects, tasks and bounties (planned)

```
Owner funds task → Developer completes work → Owner reviews → Approved → Developer is paid
```

DevTunnel could eventually earn a platform fee on successful paid work.

### Validation projects (planned)

Instead of relying only on a resume, an interview and a coding test, a company could use a developer's DevTunnel history plus a short real-world task (a bug fix, a feature, a contribution to an existing codebase) and review the actual work.

## 7. Who DevTunnel helps

| Who | What they need | How DevTunnel helps |
|---|---|---|
| **Individual developers** | Real projects, experience, a track record | Find matched tasks, ship pull requests with the CLI, build a history from real work. Paid tasks and bounties are planned |
| **Developer teams** | A shared project with defined roles and tasks | Collaborate on shared projects (planned for private and team features) |
| **Open source project owners** | Contributors and a way to show available work | Publish the project, organize tasks, find contributors, grow the community |
| **Startup founders** | Help building an early product before hiring a team | Open suitable parts of the project to collaboration; introduce paid tasks and private projects as the startup grows (planned) |
| **Startups** | To scale from open collaboration to paid work | Paid tasks and private team projects (planned) |
| **Companies** | Better evidence of what a developer can do | Evaluate developers through real project history and validation projects (planned) |

Developers arrive with different goals, and DevTunnel is meant to serve each of them:

```
Need experience      → join an open source project        (today)
Need collaborators   → find a project team                (partly today)
Need income          → complete paid tasks                (planned)
Need to prove skills → complete a validation project      (planned)
```

## 8. Developer project history

The principle: **developer history is built through real project activity.**

Everything on a profile should come from something that happened, such as a task started or a pull request opened, and never from a box someone ticked or a self-reported skill. Today a profile shows contributions, a calendar, stats and milestones. Over time this history can become deeper and more verifiable, so project owners and companies can see what a developer has actually worked on.

## 9. Developer infrastructure (planned)

The infrastructure vision is to help developers, teams and founders build, test, share and manage projects. **None of it is built yet.**

| Capability | Idea |
|---|---|
| **Tunneling** | Expose a locally running app through a secure public URL, so it can be shared and tested without deploying |
| **Custom domains** | Custom domains or URLs for development and testing environments |
| **Monitoring** | Check whether an environment is running, track basic activity, identify failures |
| **Logging** | Request and application logs for debugging and error investigation |
| **Testing and sharing** | A founder, team or tester opens the public URL while the developer keeps changing the code |

```
Developer builds locally → runs the app → starts DevTunnel → gets a public URL
→ founder or team opens it → tests → developer makes changes
```

## 10. How the two parts fit together

```
A project is created → developers discover it → a developer joins and builds a feature
→ exposes it through DevTunnel → the founder tests it → work is reviewed
→ the developer's project history is updated
```

```
PROJECT + COLLABORATION + REAL WORK + INFRASTRUCTURE = THE DEVTUNNEL ECOSYSTEM
```

## 11. Value for each user

- **Project owner:** "I need people to help me build my project."
- **Developer:** "I need real projects where I can contribute and build experience."
- **Startup founder:** "I need to grow my project before I can afford a full team."
- **Company:** "I want better evidence of what a developer can actually do."
- **Development team:** "I need infrastructure to test, share and manage development environments."

## 12. Matching and intelligence

Matching, scoring and recommendations start as **simple, deterministic and explainable rules**, not machine learning. As real contribution data accumulates, they are meant to evolve gradually:

```
1. Simple rules
2. Weighted scoring
3. Similarity + repository analysis
4. Historical data
5. Machine learning / advanced AI
```

AI features that exist today (search, summaries, explanations, insights) are optional, signed-in only, and always labeled AI-generated.

## 13. Future monetization model

**Today the core platform is free.** The ideas below are planned and not available yet. The software itself is open source (MIT); revenue is meant to come from hosted services, not from restricting the code.

1. **Infrastructure.** Free: limited tunnels, temporary URLs, basic usage and logs. Premium: multiple active tunnels, persistent URLs, custom domains and subdomains, more bandwidth, advanced monitoring and logging, longer-running and private environments. *Monthly subscriptions* for developers, founders, startups and teams.
2. **Paid tasks and bounties.** Owner posts paid work, the developer completes it, it is approved, payment is made, DevTunnel earns a *platform fee*.
3. **Private projects and team plans.** Private projects, more projects and team members, advanced access controls, shared and private environments, more monitoring. *Monthly or annual subscriptions.*
4. **Company validation.** Validation projects, evaluation workflows, private validation environments, advanced project history and review tools. *Company subscription or pay per validation project.*

## 14. Phases

| Phase | Goal | Focus |
|---|---|---|
| **1 — Build and validate** (current) | Confirm users want to find real work and ship pull requests | Project discovery, open collaboration, tasks, profiles, contribution history, real users and contributions. Core platform free |
| **Late 1 — First revenue** | Get the first paying customers | Premium infrastructure: more tunnels, persistent URLs, higher limits, premium domains, advanced logs |
| **2 — Project economy** | Real economic activity around projects | Paid tasks, bounties, payment workflow, platform fees, more private project features |
| **3 — Teams and startups** | Predictable recurring revenue | Team plans, advanced private projects, shared infrastructure, monitoring, logging, custom domains, access controls |
| **4 — Company validation** | Higher-value business use | Validation projects, deeper project history, company evaluation tools, private validation workflows |

Details and status are in [`ROADMAP.md`](../ROADMAP.md).

## 15. Growth flywheel

```
More projects → more opportunities → more developers join → more contributors
→ more projects grow → more real project history → better discovery and validation
→ more founders and companies join → more projects
```

and, once infrastructure exists:

```
More projects → more development activity → more need for testing infrastructure
→ more DevTunnel usage → more premium customers → more revenue
→ better infrastructure → more valuable projects
```

## 16. The simplest version

DevTunnel helps people find and build real software projects together. Developers find projects to contribute to, and a CLI takes them from picking an issue to an open pull request. Founders and project owners find collaborators. Over time, projects can offer paid tasks and bounties, companies can validate developers through actual work, and DevTunnel can provide the infrastructure to test and manage projects during development.

**The core idea: a project network plus developer infrastructure.**