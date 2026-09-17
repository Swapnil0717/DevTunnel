# devtunnel-cli

A CLI to automate the GitHub contribution workflow for DevTunnel
(`CONTRIBUTING.md`) — fork, branch, test, submit — using as few and as
simple commands as possible.

**This module implements `dev login` and `dev logout` only.** `dev start`,
`dev test`, and `dev submit` are separate modules, built on top of the
auth this one adds.

## Install (local dev, from the monorepo)

```bash
cd devtunnel-cli
npm install
npm run build
npm link        # makes the `dev` command available globally
```

Or run it straight from source without linking:

```bash
npm run dev -- login
```

## Commands

### `dev login`

Opens your system browser to sign in with GitHub, then stores a CLI token
at `~/.devtunnel/credentials.json` (permissions `0600` — owner read/write
only).

```
$ dev login
→ Opening your browser to sign in with GitHub…
  https://api.devtunnel.tech/auth/cli/start?port=51234&challenge=…
✓ Signed in as octocat.
```

If a browser can't be opened automatically (e.g. over SSH), the URL is
printed so you can open it manually on any machine — as long as that
machine can reach `http://127.0.0.1:<port>` back on the machine running
`dev login` (so this only really works for a browser on the *same*
machine, same as `gh auth login`'s default flow).

### `dev logout`

Revokes the token server-side and deletes the local credentials file.

```
$ dev logout
✓ Signed out.
```

## How `dev login` works

Same loopback pattern `gh`/`vercel`/`netlify` use for browser-based OAuth
from a CLI (RFC 8252), with a PKCE-style verifier/challenge so a
login code intercepted mid-flow can't be redeemed by anything else:

1. `dev login` starts a local HTTP server on an OS-assigned port, bound to
   `127.0.0.1` only, and generates a random `verifier` + `sha256(verifier)`
   `challenge`.
2. It opens your browser to `GET /auth/cli/start?port=…&challenge=…` on
   the DevTunnel API.
3. The backend runs the normal GitHub sign-in round trip against a
   dedicated CLI callback URL, then redirects your browser to
   `http://127.0.0.1:<port>/callback?code=<one-time code>` — back into the
   local server from step 1.
4. `dev login` reads that code and immediately exchanges it, along with
   the original `verifier`, at `POST /auth/cli/token` for a real,
   long-lived CLI bearer token.
5. That token is written to `~/.devtunnel/credentials.json` and sent as
   `Authorization: Bearer <token>` on every future authenticated CLI call.

See `devtunnel-backend/src/routes/authCli.ts` for the server side of this
flow, and `devtunnel-backend/CLI_AUTH_SETUP.md` for the one-time backend
deployment steps (migration + registering the second GitHub App callback
URL) this depends on.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `DEVTUNNEL_API_URL` | `https://api.devtunnel.tech` | Point the CLI at a local/staging backend instead of production. |

## Files on disk

```
~/.devtunnel/credentials.json   # { token, apiBaseUrl, user, createdAt } — mode 0600
```

Nothing else is written anywhere. `dev logout` removes this file and asks
the backend to revoke the token it contains.