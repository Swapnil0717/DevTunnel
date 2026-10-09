# Contributing to DevTunnel

Thanks for your interest in DevTunnel. This guide explains how to set up the project, what a good pull request looks like, and how contributions are licensed.

DevTunnel is open source under the [MIT License](./LICENSE). By submitting a contribution you agree that it is licensed under the same terms. There is no separate contributor agreement to sign.

## Before you start

1. Read the [README](./README.md) to see what DevTunnel is and how the repository is laid out.
2. Read [ARCHITECTURE.md](./ARCHITECTURE.md) for how the frontend, backend and CLI fit together.
3. Check the [ROADMAP](./ROADMAP.md) to see what is in scope.
4. Browse open [issues](../../issues) to find something to work on. Issues labeled `good first issue` or `help wanted` are good starting points.

You can also find tasks on [devtunnel.tech](https://devtunnel.tech/tasks), and use the DevTunnel CLI to do the fork, branch and pull request steps for you:

```bash
npm install -g @devtunnelcli/cli
dev login
dev start owner/repo#123
```

## Ways to contribute

- Fix a bug or build a feature
- Improve documentation
- Report a bug or propose a task (use the issue templates)
- Review pull requests and help others in discussions

For anything large, open an issue first so the approach can be agreed before you spend time on it.

## Development setup

DevTunnel is three packages. Each has its own `package.json`; there is no root workspace.

| Package | Path | Run locally |
|---|---|---|
| Frontend | `devtunnel-frontend` | `npm install && npm run dev` |
| Backend | `devtunnel-backend` | `npm install && npm run dev` |
| CLI | `devtunnel-cli` | `npm install && npm run dev -- <command>` |

Setup details, environment variables and database migrations are in the [README](./README.md#getting-started) and in each package's own README. Never commit secrets: use `.dev.vars` (backend) and `.env.local` (frontend), both gitignored.

## Making a change

```bash
git clone https://github.com/<your-username>/DevTunnel.git
cd DevTunnel
git checkout -b feature/short-description
```

Branch names:

- `feature/...` new functionality
- `fix/...` bug fixes
- `docs/...` documentation only
- `chore/...` tooling, config, cleanup

Guidelines:

- Keep each pull request focused on one feature or fix.
- Follow the existing code style and naming in the package you are changing.
- The backend runs on Cloudflare Workers: use `fetch`-based clients, not Node-only or TCP libraries.
- Database changes are new, numbered files in `devtunnel-backend/sql/`. Do not edit an already-applied migration.
- Update documentation when your change affects setup, APIs or behavior.

### Checks to run before opening a pull request

There is no automated test suite yet, so please run the type checks and linter for every package you touched:

```bash
# backend
cd devtunnel-backend && npm run typecheck

# frontend
cd devtunnel-frontend && npm run typecheck && npm run lint

# CLI
cd devtunnel-cli && npm run typecheck && npm run build
```

If you add tests, include how to run them in your pull request.

### Commit messages

Use a short type prefix and a clear description (the same types `dev submit` offers: `feat`, `fix`, `docs`, `chore`):

```
feat: add project discovery search filters
fix: correct role match score calculation
docs: update architecture diagram for admin sync
```

### Opening the pull request

- Fill in the pull request template.
- Link the related issue (for example `Closes #12`).
- Make sure your branch is up to date with `main`.
- The project team will review your pull request, may ask for changes, and merges it once it is approved.

Or let the CLI do it: `dev test` runs the project's checks and `dev submit` commits, pushes and opens the pull request.

## Code of Conduct

Everyone taking part is expected to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Reporting bugs

Use the **Bug Report** issue template and include steps to reproduce, expected and actual behavior, and your environment (browser, OS, version). You can also use the "Found a bug" option in the DevTunnel site header.

## Reporting security issues

Do **not** open a public issue for a security vulnerability. Follow [SECURITY.md](./SECURITY.md).

## Questions

Use [Discussions](../../discussions) for questions, ideas and feedback that are not a bug or a task.

---

Thank you for helping build DevTunnel.