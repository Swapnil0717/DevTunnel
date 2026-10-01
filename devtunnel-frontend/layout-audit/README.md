# DevTunnel layout audit (Playwright)

One-time setup (inside this folder):
    npm run setup

Audit the LIVE site (no need to run the app locally):
    BASE_URL=https://devtunnel.tech npm run audit

Or audit your local app (start `npm run dev` in devtunnel-frontend first):
    BASE_URL=http://localhost:3000 npm run audit

Include logged-in pages (optional):
    BASE_URL=https://devtunnel.tech npm run login     # sign in, press ENTER
    BASE_URL=https://devtunnel.tech npm run audit

Windows PowerShell syntax for env vars:
    $env:BASE_URL="https://devtunnel.tech"; npm run audit

Extra pages to force (e.g. a project with no tasks):
    EXTRA_ROUTES=/projects/appwrite,/github-projects/some-slug npm run audit

Output: audit-output/report.md (summary), report.json, and screenshots/<viewport>/.
