# DevTunnel — Complete System Architecture

```text
                         ┌──────────────────────────┐
                         │       GITHUB             │
                         │                          │
                         │ Repositories             │
                         │ Issues                   │
                         │ Pull Requests            │
                         │ Actions / CI             │
                         │ Releases                 │
                         └────────────┬─────────────┘
                                      │
                         GitHub API / OAuth / Webhooks
                                      │
                 ┌────────────────────┴────────────────────┐
                 │                                         │
                 ▼                                         ▼
     ┌─────────────────────────┐             ┌─────────────────────────┐
     │   DEV TUNNEL MAIN WEB   │             │   DEV TUNNEL ADMIN      │
     │                         │             │                         │
     │ Contributors            │             │ Private Admin Portal    │
     │ Maintainers             │             │                         │
     │ Projects                │             │ Add GitHub Repository   │
     │ Tasks                   │             │ Add Author              │
     │ PRs                     │             │ Add Project Details      │
     │ Dashboard               │             │ Add Tasks                │
     │ Releases                │             │ Edit / Publish           │
     └────────────┬────────────┘             └────────────┬────────────┘
                  │                                       │
                  └────────────────┬──────────────────────┘
                                   ▼
                         ┌──────────────────────┐
                         │ DEV TUNNEL BACKEND   │
                         │                      │
                         │ Authentication       │
                         │ Project API          │
                         │ Task API             │
                         │ GitHub Integration   │
                         │ Contributor API      │
                         │ Maintainer API       │
                         │ Admin API            │
                         │ Validation            │
                         │ PR Management        │
                         │ Webhooks             │
                         │ Database             │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │      DATABASE        │
                         │                      │
                         │ Users                │
                         │ Projects             │
                         │ Authors              │
                         │ Tasks                │
                         │ Contributions        │
                         │ PRs                  │
                         │ Releases             │
                         │ Admin Data           │
                         └──────────────────────┘
```

---

# 1. Main DevTunnel Website

The main website is where **contributors and maintainers interact with DevTunnel**.

```text
DevTunnel Main Website
│
├── Contributor
│
└── Maintainer
```

---

# 2. Contributor Modules

## Module C1 — Authentication

### Frontend

```text
/login
    │
    └── Login with GitHub
```

Screens:

* Login
* GitHub OAuth callback
* User onboarding
* Profile

### Backend

```text
POST /auth/github
GET  /auth/callback
GET  /auth/me
POST /auth/logout
```

**Algorithm:** OAuth 2.0 authorization flow

**Why:** Securely authenticate contributors through GitHub without handling their GitHub password.

**What it should do:**

```text
Contributor
    ↓
GitHub Authorization
    ↓
Permission Granted
    ↓
GitHub Identity
    ↓
DevTunnel User Account
```

---

# 3. Contributor Home Module

### Frontend

```text
Contributor Home

┌─────────────────────────────┐
│ Start an Open Source Project│
└─────────────────────────────┘

┌─────────────────────────────┐
│ Find an Open Source Project │
└─────────────────────────────┘
```

### Backend

```text
GET /projects
GET /projects/available
```

**Algorithm:** Recommendation / weighted scoring algorithm

**Why:** The home page can eventually prioritize projects that are more relevant to the contributor.

**What it should do:**

```text
Contributor Profile
       ↓
Skills + Interests + Experience
       ↓
Project Scores
       ↓
Recommended Projects
```

---

# 4. Project Discovery Module

### Frontend

```text
Find Projects

Search
Filters
 ├── Language
 ├── Technology
 ├── Difficulty
 ├── Skills
 ├── Project activity
 └── Available tasks

        ↓

Project Cards
```

### Backend

```text
GET /projects
GET /projects/search
GET /projects/:id
GET /projects/:id/tasks
```

**Algorithm:** Hybrid search + weighted ranking

**Why:** Normal keyword search alone may not provide the most useful projects.

**What it should do:**

```text
Search Query
     +
Filters
     +
Contributor Preferences
     ↓
Calculate Relevance
     ↓
Rank Projects
     ↓
Show Best Matches First
```

For example:

```text
React + Node.js

Project A → 95% relevance
Project B → 83%
Project C → 64%
```

---

# 5. Project Preview Module

### Frontend

```text
Project Preview

Project Name
Author
Description
GitHub Repository

Stars
Contributors
Language
License
Tech Stack

Available Tasks

Required Skills

Project Guidelines

[Enter Project]
```

### Backend

```text
GET /projects/:projectId
GET /projects/:projectId/stats
GET /projects/:projectId/tasks
GET /projects/:projectId/guidelines
```

**Algorithm:** Project health / metadata scoring

**Why:** Help contributors quickly understand whether a project is active and suitable.

**What it should do:**

```text
Repository Data
      ↓
Activity
Issues
PRs
Commits
Stars
Documentation
      ↓
Project Health Score
```

Example:

```text
Project Health: 86/100
```

This should be informational, not used as an absolute judgment of the project.

---

# 6. Project Workspace Module

```text
Project
│
├── Overview
├── Tasks
├── Guidelines
├── Tech Stack
├── Roles
├── Contribution Rules
└── Contributors
```

**Algorithm:** None required initially.

Later, you can use recommendation algorithms to personalize:

```text
Recommended Tasks
Recommended Roles
Relevant Documentation
```

---

# 7. Role & Prerequisite Module

### Frontend

```text
Choose Your Role

Frontend Developer
Backend Developer
Full Stack Developer
Documentation
Testing
DevOps
```

Then:

```text
Backend Developer

Required Skills:

✓ JavaScript
✓ Node.js
✓ REST APIs
○ PostgreSQL

[View Tasks]
```

### Backend

```text
GET /projects/:id/roles
GET /roles/:id
GET /roles/:id/prerequisites
```

**Algorithm:** Skill matching algorithm

**Why:** Determine how well the contributor's current skills match the role.

**What it should do:**

```text
Contributor Skills
        +
Role Requirements
        ↓
Skill Comparison
        ↓
Matched Skills
Missing Skills
        ↓
Role Match Score
```

Example:

```text
Backend Developer
Match: 87%

Matched:
✓ Node.js
✓ REST API
✓ JavaScript

Missing:
○ PostgreSQL
```

---

# 8. Task Management Module

### Contributor sees

```text
Available Tasks

TASK-101
Fix authentication bug

Difficulty: Medium
Role: Backend Developer

[View Task]
```

### Maintainer sees

```text
Task Management

Backlog
Ready
In Progress
Review
Testing
Completed
```

### Backend

```text
GET    /projects/:id/tasks
GET    /tasks/:id
POST   /tasks
PATCH  /tasks/:id
DELETE /tasks/:id
POST   /tasks/:id/start
```

### Algorithm 1: Task → Contributor Matching

**Why:** Show contributors tasks they are most likely to successfully complete.

**What it should do:**

```text
Contributor
     ↓
Skills
Experience
Role
Previous Work
     ↓
Task Requirements
     ↓
Match Score
     ↓
Recommended Tasks
```

Example:

```text
TASK-101 → 94%
TASK-108 → 87%
TASK-112 → 71%
```

### Algorithm 2: Task Difficulty Estimation

**Why:** Help maintainers categorize tasks consistently.

**What it should do:**

```text
Files affected
+
Dependencies
+
Required skills
+
Code complexity
+
Historical completion data
        ↓
Difficulty Score
        ↓
Easy / Medium / Hard / Advanced
```

---

# 9. Task Details Module

The task should contain:

```text
Task

Title
Description
Requirements
Guidelines
Prerequisites
Expected Result
Relevant Files
Tech Stack
Testing Requirements
Contribution Instructions
```

**Algorithm:** Relevant file detection

**Why:** Automatically identify files likely related to the task.

**What it should do:**

```text
Task Description
      +
Repository Structure
      +
Code Dependencies
      +
Tests
      +
Git History
      ↓
Relevant File Detection
      ↓
Suggested Files
```

Example:

```text
Task: Fix authentication timeout

Suggested files:

✓ src/auth/session.ts
✓ src/auth/login.ts
✓ src/middleware/auth.ts
✓ tests/auth/session.test.ts
```

The maintainer can approve/edit the suggested files.

---

# 10. Task Session Module

When the contributor presses:

```text
[ Start Task ]
```

DevTunnel creates a task session.

```text
User
 ↓
Project
 ↓
Role
 ↓
Task
 ↓
Task Session
 ↓
GitHub Repository
 ↓
Fork
 ↓
Branch
 ↓
Workspace
```

### Backend

```text
POST /tasks/:id/start
GET  /task-sessions/:id
PATCH /task-sessions/:id
```

**Algorithm:** Task-state machine

**Why:** Prevent invalid workflow transitions.

**What it should do:**

```text
Available
    ↓
Started
    ↓
In Progress
    ↓
Testing
    ↓
Submitted
    ↓
PR
    ↓
Completed
```

It should prevent situations such as:

```text
Completed → Started
```

unless explicitly allowed.

---

# 11. GitHub Repository Module

```text
Original Repository
        ↓
Contributor Fork
        ↓
Task Branch
        ↓
Contributor Workspace
```

### Original Repository Owner Login

If the **original owner of a GitHub repository logs into DevTunnel and loads their own repository**, DevTunnel should provide **all tasks related to that repository** that are available/synchronized in DevTunnel.

```text
Original Repository Owner
        ↓
Login to DevTunnel with GitHub
        ↓
DevTunnel identifies GitHub ownership
        ↓
Owner loads their repository
        ↓
Repository ownership verified
        ↓
All repository-related tasks
        ↓
Provided to the original owner
```

This allows the original owner to see the complete set of tasks associated with their repository instead of being limited to only tasks intended for contributors.

The ownership check should be based on the user's authenticated GitHub identity and the repository's GitHub owner/maintainer permissions.

### Backend responsibilities

* Check GitHub permissions
* Create fork
* Detect existing fork
* Create task branch
* Associate branch with task
* Track repository state
* Track commits
* Track PR

### API

```text
POST /github/fork
POST /github/branch
GET  /github/repository
GET  /github/branch
```

**Algorithm:** Repository state comparison

**Why:** Determine whether the fork/branch is synchronized with upstream.

**What it should do:**

```text
Upstream Repository
        +
Contributor Fork
        ↓
Compare commits
        ↓
Ahead / Behind / Diverged
```

Example:

```text
Contributor branch:
2 commits ahead
4 commits behind

→ Synchronization required
```

---

# 12. Workspace Module

The contributor chooses:

```text
Prepare Your Workspace

○ Task Workspace

○ Full Repository
```

### Task Workspace

```text
Relevant files
+
Relevant tests
+
Required configuration
+
Required dependencies
```

### Full Repository

```text
Complete repository
```

The important distinction is:

```text
GitHub Fork
    ↓
Always Complete Repository


Local Machine
    ↓
Task Workspace OR Full Repository
```

**Algorithm:** Dependency graph analysis

**Why:** A task file may depend on other files that the contributor did not explicitly select.

**What it should do:**

```text
Relevant File
     ↓
Imports / Dependencies
     ↓
Related Files
     ↓
Required Workspace Files
```

This makes the task workspace safer and more complete.

---

# 13. DevTunnel CLI Module

```text
DevTunnel CLI
│
├── Authentication
├── Task Setup
├── Workspace
├── Tunnel
├── Test
├── Submit
└── PR Update
```

Commands:

```bash
devtunnel login
devtunnel start
devtunnel share
devtunnel test
devtunnel submit
```

**Algorithm:** None required initially.

The CLI primarily orchestrates existing backend and Git operations.

---

# 14. `devtunnel start`

Backend interaction:

```text
CLI
 ↓
DevTunnel API
 ↓
Authenticate
 ↓
Identify User
 ↓
Identify Project
 ↓
Identify Task
 ↓
Verify GitHub Repository
 ↓
Verify Branch
 ↓
Prepare Workspace
 ↓
Install Dependencies
 ↓
Configure Environment
 ↓
Ready
```

**Algorithm:** Environment validation

**Why:** Catch configuration problems before the contributor starts coding.

**What it should do:**

```text
Repository
+
Node/Python/Java version
+
Dependencies
+
Environment variables
+
Configuration
        ↓
Environment Check
        ↓
Ready / Missing Requirements
```

---

# 15. DevTunnel Tunnel Module

```text
Contributor Application
localhost:3000
       ↓
DevTunnel CLI
       ↓
DevTunnel Tunnel
       ↓
Public HTTPS URL
       ↓
Maintainer / Reviewer
```

Example:

```text
https://task-101.devtunnel.tech
```

**Algorithm:** Dynamic routing

**Why:** Route requests to the correct contributor's local application.

**What it should do:**

```text
Public URL
    ↓
Identify Tunnel
    ↓
Identify Contributor
    ↓
Identify Local Service
    ↓
Forward Request
```

---

# 16. Validation Module

```text
devtunnel test
      ↓
Authenticate
      ↓
Identify Task
      ↓
Check Repository
      ↓
Check Upstream
      ↓
Synchronize
      ↓
Check Dependencies
      ↓
Build
      ↓
Tests
      ↓
Lint
      ↓
Task Validation
      ↓
Project CI
      ↓
Result
```

**Algorithm:** Rule-based validation engine

**Why:** Different tasks require different validation rules.

**What it should do:**

```text
Task Requirements
       +
Repository Rules
       +
Testing Rules
       ↓
Validation Engine
       ↓
PASS / FAIL
```

Example:

```text
Build              ✓
Unit Tests         ✓
Lint               ✓
Required Files     ✓
Task Test          ✗

Overall: FAILED
```

---

# 17. Repository Synchronization Module

```text
Contributor Branch
        +
Upstream Repository
        ↓
Compare
        ↓
Repository Changed?
     /       \
   No         Yes
   |           |
   |         Fetch
   |           |
   |       Synchronize
   |         /     \
   |      Clean   Conflict
   |        |        |
   |        ↓        ↓
   |     Continue   Stop
   |        |
   +--------+
        ↓
   Validation
```

**Algorithm:** Git three-way merge / conflict detection

**Why:** Detect conflicting changes while preserving contributor work.

**What it should do:**

```text
Base Commit
    +
Contributor Changes
    +
Upstream Changes
    ↓
Three-way comparison
    ↓
Safe Merge / Conflict
```

Additionally:

**Algorithm:** Change-impact analysis

**Why:** Warn contributors about upstream changes that affect their work even before a direct conflict occurs.

**What it should do:**

```text
Changed Files
      ↓
Compare with Contributor Files
      ↓
Find Overlap
      ↓
Calculate Risk
      ↓
Warning
```

---

# 18. Submission Module

After successful validation:

```text
devtunnel submit
        ↓
Check validation
        ↓
Prepare commit
        ↓
Push branch
        ↓
Create PR
        ↓
Update task
        ↓
Notify maintainer
```

### Backend

```text
POST /tasks/:id/submit
POST /github/push
POST /github/pull-request
PATCH /tasks/:id/status
```

**Algorithm:** Validation gate

**Why:** Prevent incomplete work from being submitted accidentally.

**What it should do:**

```text
Validation Result
       ↓
Passed?
  /        \
Yes        No
 ↓          ↓
Submit     Stop
```

---

# 19. Pull Request Module

The PR should contain:

```text
Task ID
Task Name
Contributor
Description
Validation Results
Relevant Task Information
```

**Algorithm:** PR risk scoring

**Why:** Help maintainers identify PRs that deserve more attention.

**What it should do:**

```text
Files Changed
Lines Changed
Tests
Critical Files
Dependencies
CI Results
Security-sensitive Code
        ↓
Risk Score
        ↓
Low / Medium / High
```

Example:

```text
PR #142

Risk: HIGH

Reasons:
- Authentication files changed
- No tests added
- Dependency changed
```

---

# 20. Contributor Dashboard Module

### Frontend

```text
Contributor Dashboard

Active Tasks
Submitted Tasks
Pull Requests
Merged Contributions
Closed Contributions
Projects
Contribution History
```

### Backend

```text
GET /contributor/tasks
GET /contributor/pull-requests
GET /contributor/contributions
GET /contributor/history
```

**Algorithm:** Contribution analytics

**Why:** Help contributors understand their progress.

**What it should do:**

```text
Tasks
PRs
Merged Contributions
Completion Time
Reviews
        ↓
Contribution Statistics
```

---

# 21. Maintainer Modules

```text
Maintainer
│
├── Dashboard
├── Projects
├── Tasks
├── Issues
├── Pull Requests
├── Contributors
├── Testing / CI
├── Security
├── Releases
├── Versions
└── Settings
```

---

# 22. Maintainer Project Module

```text
Maintainer
   ↓
Create Project
   ↓
Connect GitHub Repository
   ↓
Project Setup
   ↓
DevTunnel Project
```

Backend:

```text
POST /maintainer/projects
POST /maintainer/projects/connect-github
GET  /maintainer/projects
PATCH /maintainer/projects/:id
```

**Algorithm:** Repository health analysis

**Why:** Automatically identify missing project information or configuration.

**What it should do:**

```text
Repository
 ↓
README?
License?
Tests?
CI?
CONTRIBUTING?
Security?
Documentation?
 ↓
Project Health Report
```

---

# 23. Maintainer Project Health Module

```text
Project Health

Repository       ✓
README           ✓
License          ✓
Contribution     ✓
Security         ⚠
CI/CD            ✓
Documentation    ⚠
```

**Algorithm:** Rule-based health scoring

**Why:** Give maintainers a quick overview of project readiness.

**What it should do:**

```text
Project Checks
      ↓
Individual Scores
      ↓
Overall Health
      ↓
Recommendations
```

---

# 24. Maintainer Issue Module

```text
GitHub Issue
     ↓
DevTunnel
     ↓
View
Filter
Prioritize
Label
Assign
Convert to Task
```

Backend:

```text
GET  /maintainer/issues
GET  /maintainer/issues/:id
PATCH /maintainer/issues/:id
POST /maintainer/issues/:id/convert-task
```

**Algorithm:** Issue similarity / duplicate detection

**Why:** Prevent maintainers from creating duplicate tasks for the same problem.

**What it should do:**

```text
New Issue
    +
Existing Issues
    ↓
Text Similarity
    ↓
Potential Duplicate
```

Example:

```text
New Issue:
"Login session expires too quickly"

Similar:
TASK-101 — "Authentication timeout"
Similarity: 89%
```

---

# 25. Maintainer Task Creation

The maintainer creates:

```text
Task

Title
Description
Requirements
Role
Difficulty
Prerequisites
Relevant Files
Expected Result
Testing Requirements
```

Then:

```text
Draft
 ↓
Ready
 ↓
Published
```

**Algorithm:** Task priority scoring

**Why:** Help maintainers organize large numbers of tasks.

**What it should do:**

```text
Severity
+
User Impact
+
Security Impact
+
Dependency Impact
+
Maintainer Priority
      ↓
Priority Score
      ↓
Critical / High / Medium / Low
```

---

# 26. Maintainer PR Module

```text
Pull Requests

PR #142
Authentication Fix

PR #141
Documentation Update

PR #140
API Improvement
```

Opening one:

```text
PR #142

Task:
Authentication Fix

Contributor:
username

Tests              ✓
Build              ✓
Lint               ✓
Task Validation    ✓
Conflicts          No

[Review]
```

**Algorithm:** PR prioritization algorithm

**Why:** When many PRs arrive, help maintainers decide which should be reviewed first.

**What it should do:**

```text
PR Risk
+
Task Priority
+
Age
+
CI Status
+
Security Impact
+
Dependencies
      ↓
Review Priority
```

---

# 27. Review Module

```text
Contributor
     ↓
Submit
     ↓
PR
     ↓
Maintainer Review
     ↓
 ┌───┼─────────┐
 ↓   ↓         ↓
Approve Changes Close
       ↓
   Contributor
       ↓
   Update Code
       ↓
 devtunnel test
       ↓
   Update PR
```

**Algorithm:** Review recommendation

**Why:** Give maintainers useful signals before they manually inspect everything.

**What it should do:**

```text
PR
 ↓
Validation
 ↓
Tests
 ↓
Changes
 ↓
Risk
 ↓
Review Checklist
```

Example:

```text
Review checklist:

✓ Tests passing
✓ No merge conflicts
⚠ Authentication code changed
⚠ No test added
✓ Task requirements satisfied
```

The algorithm should **assist the reviewer, not automatically approve the PR**.

---

# 28. Release Module

```text
Merged PRs
     ↓
Release Preparation
     ↓
Changelog
     ↓
Version
     ↓
Tests
     ↓
Security
     ↓
Documentation
     ↓
Maintainer Approval
     ↓
GitHub Release
```

**Algorithm:** Semantic versioning analysis

**Why:** Help determine whether changes represent a patch, minor, or major release.

**What it should do:**

```text
Merged Changes
      ↓
Change Types
      ↓
Patch / Minor / Major
      ↓
Suggested Version
```

The maintainer should still confirm the version.

---

# 29. Separate Admin System

```text
devtunnel.tech
        ↓
MAIN WEBSITE
        ↓
Contributors + Maintainers


admin.devtunnel.tech
        ↓
ADMIN PORTAL
        ↓
You / DevTunnel Admin
```

The admin portal has its **own frontend and backend/API access**.

---

# 30. Admin Portal Purpose

Your Admin Portal is where **you curate the open-source projects available on DevTunnel**.

### Admin Repository and Task Access Restriction

The Admin can **load/import repositories and their related tasks into DevTunnel**, but the Admin **cannot merge contributions, branches, or Pull Requests into the original GitHub repository**.

The Admin's role is limited to:

```text
Admin
  ↓
Load GitHub Repository
  ↓
Load Repository Information
  ↓
Load Repository Tasks / Issues
  ↓
Configure / Curate Project
  ↓
Publish on DevTunnel
```

The Admin cannot perform:

```text
Admin
  ↓
Merge Contributor PR
  ✗
```

or:

```text
Admin
  ↓
Merge Branch into Original Repository
  ✗
```

Merging remains controlled by the **original repository owner / authorized GitHub maintainers**.

```text
Admin
  ↓
Add GitHub Repository
  ↓
Enter Project Information
  ↓
Enter Author Information
  ↓
Add Project Files
  ↓
Add Tasks
  ↓
Configure Project
  ↓
Preview
  ↓
Publish
```

---

# 31. Admin Frontend Modules

```text
Admin Portal
│
├── A1 Authentication
├── A2 Dashboard
├── A3 Projects
├── A4 Add Project
├── A5 Author Management
├── A6 Repository Details
├── A7 Project Files
├── A8 Task Management
├── A9 Project Preview
├── A10 Publish Management
├── A11 GitHub Sync
├── A12 Reports / Activity
└── A13 Admin Settings
```

---

# 32. A1 — Admin Authentication

```text
admin.devtunnel.tech
        ↓
Admin Login
        ↓
Admin Authentication
        ↓
Admin Dashboard
```

**Algorithm:** Role-based access control (RBAC)

**Why:** Only authorized administrators should access the admin system.

**What it should do:**

```text
User
 ↓
Identity
 ↓
Role
 ↓
Permission Check
 ↓
Allow / Deny
```

---

# 33. A2 — Admin Dashboard

```text
ADMIN DASHBOARD

Projects
    42

Published
    35

Drafts
    7

Tasks
    286

Contributors
    1,240

Active Projects
    31

Recent Activity
    ...
```

**Algorithm:** Dashboard aggregation

**Why:** Avoid manually calculating statistics from individual records.

**What it should do:**

```text
Projects
Tasks
Users
Contributions
PRs
Activity
      ↓
Aggregate
      ↓
Dashboard Metrics
```

---

# 34. A3 — Project Management

```text
Projects

Search

Project                         Status

React Example                   Published
Node Example                    Published
CLI Example                     Draft
API Example                     Review
```

Actions:

```text
View
Edit
Preview
Publish
Unpublish
Archive
```

**Algorithm:** Search + filtering + ranking

**Why:** Make a large project catalog easier to manage.

**What it should do:**

```text
Search
+
Status
+
Language
+
Activity
+
Tasks
      ↓
Filtered Projects
```

---

# 35. A4 — Add GitHub Project

Admin enters:

```text
GitHub Repository

Owner:
facebook

Repository:
react
```

or:

```text
Repository URL
https://github.com/...
```

Then DevTunnel can fetch public repository information from GitHub.

**Algorithm:** Repository metadata extraction

**Why:** Reduce manual data entry.

**What it should do:**

```text
GitHub URL
    ↓
GitHub API
    ↓
Repository Metadata
    ↓
Project Draft
```

Retrieve things such as:

```text
Repository Name
Description
Language
License
Stars
Forks
Topics
Default Branch
Issues
Contributors
```

---

# 36. A5 — Author Information

Store:

```text
Author

Name
GitHub Username
GitHub Profile
Avatar
Bio
Website
Organization
```

**Algorithm:** Entity/profile normalization

**Why:** Keep author information consistent when the same author appears across multiple projects.

**What it should do:**

```text
GitHub Username
      ↓
Find Existing Author
      ↓
Existing?
 /      \
Yes      No
 ↓        ↓
Reuse    Create
```

---

# 37. A6 — Repository Information

Admin can enter or retrieve:

```text
Repository

Repository Name
Owner
GitHub URL
Default Branch
Primary Language
License
Description
Stars
Forks
Issues
Contributors
Topics
```

**Algorithm:** Metadata synchronization

**Why:** Keep GitHub-derived information up to date.

**What it should do:**

```text
DevTunnel Project
       ↕
GitHub Repository
       ↓
Compare Metadata
       ↓
Update Changed Fields
```

---

# 38. A7 — Project Files

```text
Project Files

README.md
CONTRIBUTING.md
LICENSE
CODE_OF_CONDUCT.md
SECURITY.md

Task-specific files
    src/auth/
    tests/auth/
```

Classify:

```text
File Type

Documentation
Configuration
Source
Test
Infrastructure
Task Relevant
```

**Algorithm:** File classification + dependency analysis

**Why:** Automatically identify what different files are used for and which tasks they relate to.

**What it should do:**

```text
Repository Files
      ↓
Analyze names
Extensions
Directories
Imports
Dependencies
      ↓
File Classification
```

Example:

```text
src/auth/login.ts
→ Source
→ Authentication
→ Task Relevant
```

---

# 39. A8 — Admin Task Creation

```text
Create Task

Task ID:
TASK-101

Title:
Fix authentication bug

Description:
...

Role:
Backend Developer

Difficulty:
Medium

Required Skills:
Node.js
REST API

Relevant Files:
src/auth/

Requirements:
...

Expected Result:
...

Testing:
...
```

**Algorithm:** Task recommendation / generation assistance

**Why:** Help the admin identify relevant files, skills and difficulty while creating tasks.

**What it should do:**

```text
Task Description
      ↓
Repository Analysis
      ↓
Suggested:
- Skills
- Files
- Difficulty
- Tests
```

The admin remains in control.

---

# 40. A9 — Project Preview

```text
ADMIN PREVIEW

Project
Example Project

Author
Example Author

Repository
github.com/example/project

Description
...

Tech Stack
...

Available Tasks
12

Guidelines
...

[Edit]
[Publish]
```

**Algorithm:** Validation rules

**Why:** Catch incomplete project information before publication.

**What it should do:**

```text
Project Draft
      ↓
Required Field Check
      ↓
Task Check
      ↓
Author Check
      ↓
Repository Check
      ↓
Ready / Not Ready
```

---

# 41. A10 — Publish System

```text
DRAFT
  ↓
REVIEW
  ↓
PUBLISHED
```

Only `PUBLISHED` projects appear on the main website.

```text
Admin Database

Project A → PUBLISHED
Project B → PUBLISHED
Project C → DRAFT
Project D → REVIEW
```

Main website:

```text
Project A ✓
Project B ✓

Project C ✗
Project D ✗
```

**Algorithm:** State machine / publication workflow

**Why:** Prevent incomplete or unauthorized projects from appearing publicly.

**What it should do:**

```text
Draft
 ↓
Validation
 ↓
Review
 ↓
Publish
```

---

# 42. A11 — GitHub Synchronization

```text
DevTunnel Project
       ↓
Check GitHub
       ↓
Repository Changed?
       ↓
Update Metadata
```

### Admin Synchronization Limitation

GitHub synchronization for the Admin is **read/load and DevTunnel-curation oriented**. Loading a repository or its tasks into DevTunnel does not give the Admin permission to merge changes into the original GitHub repository.

```text
Admin
  ↓
Load Repository
  ↓
Load Tasks / Issues
  ↓
Sync Repository Information
  ↓
DevTunnel Database
```

The Admin cannot:

```text
Merge PRs into Original Repository
Merge Contributor Branches
Approve and Merge Contributor Work
```

Those actions remain with the original repository owner or GitHub users who have the required repository permissions.

**Algorithm:** Incremental synchronization

**Why:** Avoid repeatedly processing the entire repository when only a few things changed.

**What it should do:**

```text
Last Sync
    +
Current GitHub State
    ↓
Detect Changes
    ↓
Update Only Changed Data
```

---

# 43. Admin Backend

The Admin backend should have separate routes.

```text
/admin/auth
/admin/projects
/admin/projects/:id
/admin/projects/:id/files
/admin/projects/:id/tasks
/admin/projects/:id/author
/admin/projects/:id/publish
/admin/projects/:id/unpublish
/admin/github
/admin/activity
```

**Algorithm:** RBAC + API authorization

**Why:** The frontend being separate is not enough; the backend must independently verify every admin request.

**What it should do:**

```text
Admin Request
     ↓
Authentication
     ↓
Admin Role Check
     ↓
Permission Check
     ↓
API Operation
```

---

# 44. How Admin Speaks to Main Website

### Original Owner Repository Task Access

When a GitHub repository's original owner logs into DevTunnel, the backend should identify their GitHub account and repository ownership/maintainer permissions.

```text
GitHub Login
     ↓
Authenticated GitHub User
     ↓
Repository Ownership / Permission Check
     ↓
Repository Identified
     ↓
Fetch All DevTunnel Tasks
Associated With That Repository
     ↓
Provide Tasks to Original Owner
```

This applies when the original owner loads their repository through DevTunnel.

```text
Original Owner
      ↓
Own Repository
      ↓
All Related Tasks
      ↓
Owner Dashboard / Project Workspace
```

This does **not** grant the DevTunnel Admin the ability to merge into that repository.

```text
DevTunnel Admin
      ↓
Load Repository + Tasks
      ↓
Curate / Publish
      ✗ Merge to Original Repository

Original Repository Owner / Authorized Maintainer
      ↓
Review Contributor PR
      ↓
Merge
```

```text
                 ADMIN FRONTEND
                       │
                       ↓
                  ADMIN API
                       │
                       ↓
                   DATABASE
                       │
                       ↓
                  MAIN API
                       │
                       ↓
               MAIN WEBSITE
```

The database becomes the shared source for DevTunnel project data.

**Algorithm:** Event-driven synchronization

**Why:** Keep the main website updated when admin changes project information.

**What it should do:**

```text
Admin Action
     ↓
Database Change
     ↓
Project Published/Updated
     ↓
Main API Reads Updated Data
     ↓
Main Website Shows New Data
```

---

# 45. Complete Algorithm Layer

Once everything is combined, your algorithm layer looks like this:

```text
                         ALGORITHM ENGINE
                                │
       ┌────────────────────────┼────────────────────────┐
       │                        │                        │
       ▼                        ▼                        ▼
   MATCHING                  ANALYSIS                 DETECTION
       │                        │                        │
       ├── Project Match        ├── Difficulty           ├── Duplicate Tasks
       ├── Task Match           ├── Project Health       ├── Conflicts
       ├── Role Match           ├── PR Risk              ├── Relevant Files
       └── Recommendation       ├── Task Priority        └── Repository Changes
                                └── Contribution Data
```

### Recommended algorithm progression

```text
PHASE 1
Simple Rules
     ↓
PHASE 2
Weighted Scoring
     ↓
PHASE 3
Similarity + Repository Analysis
     ↓
PHASE 4
Historical Data
     ↓
PHASE 5
Machine Learning / Advanced AI
```
