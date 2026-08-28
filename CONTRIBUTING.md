# Contributing to DevTunnel

Thanks for your interest in contributing to DevTunnel. This document explains how contributions work, what's expected, and what rights are involved before you submit any code.

> **Important:** DevTunnel is source-available, not open source. Please read the [LICENSE](./LICENSE) and [Contributor License Agreement](./CLA.md) before contributing. Contributing does **not** grant you rights to use, copy, or deploy the Software outside of this repository.

---

## Before You Start

1. Read the [README.md](./README.md) to understand what DevTunnel is and how it's structured.
2. Read the [ARCHITECTURE.md](./ARCHITECTURE.md) to understand the system design and modules.
3. Check the [ROADMAP.md](./ROADMAP.md) to see what phase the project is in and what's currently in scope.
4. Browse open [Issues](../../issues) and the [Project Board](../../projects) to find something to work on.

## Contributor License Agreement (CLA)

Before your first pull request can be merged, you must agree to the [CLA](./CLA.md). This confirms:

- You have the right to submit the contribution.
- Your contribution may be used, modified, and distributed by the project owner as part of DevTunnel.
- You are not granted any ownership, license, or usage rights to the Software in return for contributing.

A CLA bot will prompt you to sign when you open your first PR.

## How to Contribute

### 1. Find or Propose Work
- Pick an existing issue labeled `good first issue`, `help wanted`, or a task tied to the current roadmap phase.
- To propose new work, open an issue using the **Task Proposal** template first — don't submit unsolicited large PRs.

### 2. Fork & Branch
```bash
git clone https://github.com/<your-username>/devtunnel.git
cd devtunnel
git checkout -b feature/short-description
```

Branch naming convention:
- `feature/...` — new functionality
- `fix/...` — bug fixes
- `docs/...` — documentation-only changes
- `chore/...` — tooling, config, cleanup

### 3. Make Your Changes
- Keep pull requests focused — one feature or fix per PR.
- Follow existing code style and naming conventions (style guide to be added once the codebase is initialized).
- Include tests where applicable.
- Update documentation if your change affects setup, APIs, or behavior.

### 4. Commit Messages
Use clear, descriptive commit messages:
```
feat: add project discovery search filters
fix: correct role match score calculation
docs: update architecture diagram for admin sync
```

### 5. Submit a Pull Request
- Fill out the PR template completely.
- Link the related issue (e.g. `Closes #12`).
- Ensure your branch is up to date with `main` before requesting review.
- A maintainer will review, request changes if needed, and merge once approved.

## Code of Conduct

All contributors are expected to follow the [Code of Conduct](./CODE_OF_CONDUCT.md). Be respectful, constructive, and collaborative.

## Reporting Bugs

Use the **Bug Report** issue template. Include:
- Steps to reproduce
- Expected vs. actual behavior
- Environment details (browser, OS, version, etc.)

## Reporting Security Issues

Do **not** open a public issue for security vulnerabilities. Follow the process in [SECURITY.md](./SECURITY.md).

## Questions

Use [Discussions](../../discussions) for general questions, ideas, or feedback that isn't a bug or task.

---

Thank you for helping build DevTunnel.