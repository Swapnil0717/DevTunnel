# @devtunnelcli/cli

The `dev` command: automates the GitHub contribution workflow for [DevTunnel](https://devtunnel.tech). Fork, branch, test and open a pull request with a few simple commands, on a DevTunnel task or on **any public GitHub issue**.

## Install

Requires Node.js 18.18 or newer.

```bash
npm install -g @devtunnelcli/cli
dev --version
```

Or run it without installing:

```bash
npx @devtunnelcli/cli login
```

The CLI talks to the hosted DevTunnel API (`https://api.devtunnel.tech`) by default, so nothing else needs to be running on your machine.

## Quick start

```bash
dev login                      # sign in with GitHub (opens your browser)
dev start owner/repo#123       # fork, clone, and check out a branch for this issue
# ...make your changes...
dev test                       # run the project's own checks
dev submit                     # commit, push, and open the pull request
```

## Commands

### `dev login`

Opens your browser to sign in with GitHub, then stores a CLI token at `~/.devtunnel/credentials.json` (mode `0600`, owner read/write only).

```
$ dev login
→ Opening your browser to sign in with GitHub…
✓ Signed in as octocat.
```

If a browser cannot be opened automatically, the URL is printed. The browser must be on the same machine as the CLI, as with `gh auth login`.

### `dev logout`

Revokes the token on the server and deletes the local credentials file.

### `dev start <id>`

Forks a repository (or claims a DevTunnel task or project) and checks out a working branch.

`<id>` can be:

| Form | Meaning |
|---|---|
| `owner/repo#123` | A GitHub issue in any public repository |
| `owner/repo` or a `github.com` URL | A repository, without an issue |
| a task id | A DevTunnel task |
| a project id, with `--project` | A whole DevTunnel project |

| Option | Meaning |
|---|---|
| `--project` | Treat `<id>` as a project id instead of a task id |
| `--zip` | Write a zip archive of the branch instead of a working clone |
| `--dir <path>` | Directory to clone into (defaults to the repository name) |

New branches start from the **upstream** repository's current default branch, not from your fork's possibly stale copy.

### `dev test`

Pulls the latest changes and runs the project's own checks. Install, lint, typecheck, test and build commands are read from `.github/workflows/*.yml`. Steps that publish, deploy, upload, use secrets or use `sudo` are skipped.

| Option | Meaning |
|---|---|
| `--dir <path>` | Directory to run in (defaults to the current directory) |
| `--skip-update` | Do not fetch and rebase onto upstream first |
| `--no-ci` | Ignore `.github/workflows` and auto-detect what to run |

### `dev submit [id]`

Commits, pushes, and opens (or updates) the pull request. With no argument it infers the upstream repository and issue from the current checkout. If the repository has a pull request template, the PR body is a short summary followed by that template; otherwise a plain summary is used.

| Option | Meaning |
|---|---|
| `--project` | Treat `<id>` as a project id |
| `--dir <path>` | Directory to run in |
| `-m, --message <text>` | Commit description (skips the prompt) |
| `--type <type>` | Commit type: `feat`, `fix`, `docs` or `chore` (skips the prompt) |
| `--tested <note>` | How you tested this, included in the PR body |

A pull request opened with `dev submit` counts toward your DevTunnel contribution calendar and totals. `dev start` alone does not count.

## How `dev login` works

The CLI uses the same loopback pattern as `gh`, `vercel` and `netlify` (RFC 8252), with a PKCE-style verifier and challenge so a login code intercepted mid-flow cannot be redeemed by anything else.

1. `dev login` starts a local HTTP server on an OS-assigned port, bound to `127.0.0.1` only, and generates a random verifier and its `sha256` challenge.
2. It opens your browser to `GET /auth/cli/start?port=…&challenge=…` on the DevTunnel API.
3. The backend runs the GitHub sign-in round trip against a dedicated CLI callback URL, then redirects your browser to `http://127.0.0.1:<port>/callback?code=<one-time code>`.
4. The CLI reads the code and immediately exchanges it, with the original verifier, at `POST /auth/cli/token` for a long-lived bearer token.
5. The token is written to `~/.devtunnel/credentials.json` and sent as `Authorization: Bearer <token>` on later calls.

Server side: [`devtunnel-backend/src/routes/authCli.ts`](../devtunnel-backend/src/routes/authCli.ts) and [`CLI_AUTH_SETUP.md`](../devtunnel-backend/CLI_AUTH_SETUP.md).

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `DEVTUNNEL_API_URL` | `https://api.devtunnel.tech` | Point the CLI at a local or staging backend |

Files on disk: only `~/.devtunnel/credentials.json` (`{ token, apiBaseUrl, user, createdAt }`). `dev logout` removes it.

## Develop the CLI

```bash
cd devtunnel-cli
npm install
npm run build        # tsup -> dist/
npm link             # makes `dev` point at your local build
```

Or run it straight from source without linking:

```bash
npm run dev -- login
```

Other scripts: `npm run typecheck`.

## Publishing a new version

Publishing is done by someone with publish rights on the `@devtunnelcli` npm organization (with 2FA enabled):

```bash
npm login
cd devtunnel-cli
npm version patch      # or minor / major
npm publish            # builds via prepublishOnly, then uploads
```

## License

[MIT](../LICENSE)