# CLI authentication: one-time setup

`dev login` signs a user in from the terminal using GitHub and a loopback redirect (RFC 8252). This page covers the one-time deployment steps the backend needs for it. For how the flow works from the user's side, see [`../devtunnel-cli/README.md`](../devtunnel-cli/README.md#how-dev-login-works).

## 1. Apply the migration

Apply `sql/029_add_cli_tokens.sql` (it creates `devtunnel.cli_tokens`, which stores only a hash of each CLI token). If you applied every migration in order, this is already done. One-time login codes use the `cli_auth_codes` table from `sql/043_add_kv_replacements.sql`.

## 2. Register the second callback URL

Your GitHub app needs a **second** callback URL next to the web one. A GitHub App supports several callback URLs.

In GitHub → Settings → Developer settings → your app → "Identifying and authorizing users" → Callback URL, add:

```
https://<your-api-domain>/auth/cli/callback
```

It must match `GITHUB_CLI_CALLBACK_URL` in `wrangler.toml` exactly (including the path). The web callback (`/auth/callback`) stays as it is.

## 3. Deploy

```bash
npm run deploy
```

## 4. Verify

```bash
DEVTUNNEL_API_URL=https://<your-api-domain> dev login
```

A browser opens to GitHub. After you approve, the terminal prints `Signed in as <username>`, and a token is stored in `~/.devtunnel/credentials.json`.

## How it works, briefly

1. `dev login` starts a local server on `127.0.0.1` and opens `GET /auth/cli/start?port=…&challenge=…`.
2. The backend runs the GitHub round trip against the CLI callback URL, then mints a one-time code (valid for 5 minutes) and redirects the browser to `http://127.0.0.1:<port>/callback?code=…`.
3. The CLI exchanges that code and its original verifier at `POST /auth/cli/token` and receives a bearer token, valid for 180 days.
4. `dev logout` calls `POST /auth/cli/logout` to revoke it.

The web and CLI flows share no cookies and no state.

## Troubleshooting

- **GitHub says the redirect URI is not associated with the app:** the CLI callback URL from step 2 is missing or does not match exactly.
- **`dev login` hangs after approving:** the browser must be on the same machine as the CLI, because the redirect goes to `127.0.0.1` on that machine.
- **Wrong server:** set `DEVTUNNEL_API_URL` to the backend you deployed.