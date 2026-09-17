# devtunnel-cli

A CLI to automate the GitHub contribution workflow for DevTunnel
(`CONTRIBUTING.md`) — fork, branch, test, submit — using as few and as
simple commands as possible.

## Install

```bash
npm install -g @devtunnelcli/cli
```

This installs the `dev` command globally. Verify it worked:

```bash
dev --version
```

No account or repo checkout needed first — `dev login` (below) is what
connects it to your GitHub account. The CLI talks to the hosted DevTunnel
API (`https://api.devtunnel.tech`) by default, so nothing else needs to be
running on your machine.

Prefer not to install anything permanently? Run it via `npx` instead:

```bash
npx @devtunnelcli/cli login
```

### Building from source (contributing to the CLI itself)

If you're working on the CLI's own code rather than just using it:

```bash
cd devtunnel-cli
npm install
npm run build
npm link        # makes the `dev` command available globally, pointing at your local build
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

## Publishing a new version (maintainers)

Editing this package's metadata doesn't put it on npm by itself — someone
with publish rights has to actually run the release:

```bash
npm login                # once per machine, needs an npm account that's a
                          # member of the devtunnelcli org on npm, with
                          # publish rights and 2FA enabled
cd devtunnel-cli
npm version patch        # or minor/major — bumps the version and tags it
npm publish              # builds via prepublishOnly, then uploads
```

After that succeeds, `npm install -g @devtunnelcli/cli` works for anyone,
anywhere — publishing is what actually makes a version fetchable from the
registry. Until the first `npm publish` runs, the install instructions
above will 404.

New members added to the `devtunnelcli` org's "Developers" team
(npmjs.com → Organizations → devtunnelcli → Members) automatically get
read/write access to packages under this scope, so anyone who needs to
cut a release should be added there rather than sharing one person's
login.