# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in DevTunnel, please **do not** open a public GitHub issue.

Report it privately by emailing **contact@devtunnel.tech** with the subject line `Security report`. If GitHub private vulnerability reporting is enabled on this repository, you can use that instead.

Please include as much of the following as you can:

- A description of the vulnerability and its potential impact
- Steps to reproduce the issue
- Any relevant logs, screenshots, or proof-of-concept code
- Your assessment of severity, if known

## What to expect

- **Acknowledgment:** we aim to acknowledge your report within 48 hours.
- **Investigation:** we will investigate and assess the issue, and may follow up with questions.
- **Resolution:** once confirmed, we will work on a fix and agree a disclosure timeline with you.
- **Credit:** with your permission, we will credit you for the discovery once the issue is resolved.

## Supported versions

Security fixes are applied to the latest code on the `main` branch and to the latest published release of the `@devtunnelcli/cli` package. Older versions are not supported.

## Scope

This policy covers the code in this repository: the frontend (including the admin portal), the backend API, and the CLI, as well as the hosted service at devtunnel.tech.

It does **not** cover:

- Third-party services DevTunnel integrates with (for example GitHub, Supabase, Cloudflare). Please report those to the relevant provider.
- Social engineering or physical security issues.
- Findings from automated scanners with no demonstrated impact.

## Handling secrets

If you find a leaked credential (for example in the git history), report it privately in the same way. Do not use it.

## Responsible disclosure

Please give us reasonable time to investigate and fix a vulnerability before disclosing it publicly. We will work with security researchers in good faith.

Thank you for helping keep DevTunnel and its users safe.