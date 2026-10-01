// Layout audit: visits every route at several screen sizes, clicks every tab,
// takes screenshots and measures the main content width. Flags:
//   - WIDTH-SHRINK : main content narrower than the widest tab/state of that page
//   - H-OVERFLOW   : page scrolls sideways
//   - OFFSCREEN    : elements poking outside the viewport
//   - NARROW       : main content much narrower than the space available
//   - CONSOLE/PAGE errors
// Usage:  BASE_URL=http://localhost:3000 node audit.mjs
// Env:    ADMIN=1 also audits /admin pages (needs an admin auth.json)
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const OUT = "audit-output";
const SIDEBAR = 240; // desktop sidebar width (sm:ml-[240px])
const VIEWPORTS = [
  { name: "desktop-1920", width: 1920, height: 1080 },
  { name: "laptop-1366", width: 1366, height: 768 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "phone-390", width: 390, height: 844 },
];

const hasAuth = fs.existsSync("auth.json");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const newCtx = (vp, withAuth) =>
  browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    storageState: withAuth && hasAuth ? "auth.json" : undefined,
  });

// ---------- 1. build the route list ----------
const staticPublic = [
  "/", "/projects", "/tasks", "/issues", "/opensource-tools",
  "/github-projects", "/github-open-source-tools", "/submissions", "/login",
];
const staticProtected = ["/home", "/dashboard", "/profile", "/settings", "/submissions/new"];
const staticAdmin = [
  "/admin", "/admin/projects", "/admin/tasks", "/admin/opensource-tools",
  "/admin/activity", "/admin/ai/projects", "/admin/ai/tasks", "/admin/ai/tools",
  "/admin/ai/confirmation", "/admin/tasks/new-issues",
  "/admin/tasks/new-issues/since-onboarding",
];

// Find real detail-page URLs by reading links on the list pages.
async function firstLink(page, listPath, regex) {
  try {
    await page.goto(BASE + listPath, { waitUntil: "networkidle", timeout: 45000 });
    const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
    return hrefs.find((h) => h && regex.test(h)) || null;
  } catch { return null; }
}
const disc = await newCtx(VIEWPORTS[0], false);
const dp = await disc.newPage();
const dynamic = [];
const projectDetail = await firstLink(dp, "/projects", /^\/projects\/[^/]+$/);
const taskDetail = await firstLink(dp, "/tasks", /^\/projects\/[^/]+\/tasks\/[^/]+$/);
const ghProject = await firstLink(dp, "/github-projects", /^\/github-projects\/[^/]+$/);
const ghTool = await firstLink(dp, "/github-open-source-tools", /^\/github-open-source-tools\/[^/]+$/);
const tool = await firstLink(dp, "/opensource-tools", /^\/opensource-tools\/[^/]+$/);
const sub = await firstLink(dp, "/submissions", /^\/submissions\/(?!new)[^/]+$/);
// You can force specific pages here, e.g. a project that has no tasks:
const extra = (process.env.EXTRA_ROUTES || "").split(",").map((s) => s.trim()).filter(Boolean);
for (const r of [projectDetail, taskDetail, ghProject, ghTool, tool, sub, ...extra]) {
  if (!r) continue;
  dynamic.push(r);
  if (!/\/contribute$/.test(r) && !/^\/submissions/.test(r)) dynamic.push(r + "/contribute");
}
await disc.close();

const routes = [
  ...staticPublic,
  ...dynamic,
  ...(hasAuth ? staticProtected : []),
  ...(process.env.ADMIN && hasAuth ? staticAdmin : []),
];
console.log(`Auditing ${routes.length} routes x ${VIEWPORTS.length} viewports on ${BASE}`);
if (!hasAuth) console.log("(no auth.json: logged-in pages skipped, run `npm run login` to include them)");

// ---------- 2. measure ----------
const measure = () => {
  const main = document.querySelector("main");
  const r = main ? main.getBoundingClientRect() : null;
  const vw = window.innerWidth;
  const off = [];
  document.querySelectorAll("body *").forEach((el) => {
    const b = el.getBoundingClientRect();
    if (b.width > 0 && (b.right > vw + 1 || b.left < -1)) {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "sticky")
        off.push(el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 2).join(".") : ""));
    }
  });
  return {
    mainWidth: r ? Math.round(r.width) : null,
    mainLeft: r ? Math.round(r.left) : null,
    hOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    offscreen: off.slice(0, 5),
    vw,
  };
};

const slug = (s) => (s.replace(/\//g, "_").replace(/^_/, "") || "home");
const results = [];

for (const vp of VIEWPORTS) {
  for (const route of routes) {
    const isProtected = staticProtected.includes(route) || route.startsWith("/admin");
    const ctx = await newCtx(vp, isProtected || hasAuth);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push("PAGE: " + e.message.slice(0, 160)));
    page.on("console", (m) => m.type() === "error" && errors.push("CONSOLE: " + m.text().slice(0, 160)));
    const rec = { route, viewport: vp.name, states: [], issues: [] };
    try {
      const resp = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(2500); // let the blueprint intro animation finish
      rec.status = resp?.status();
      if (page.url().includes("/login") && route !== "/login") {
        rec.issues.push("REDIRECTED-TO-LOGIN (needs auth.json)");
      }
      const states = [{ label: "page", action: null }];
      const tabs = await page.$$('[role="tab"]');
      const tabNames = [];
      for (const t of tabs) tabNames.push((await t.innerText()).trim().replace(/\s+/g, " "));
      tabNames.forEach((n, i) => states.push({ label: `tab: ${n}`, action: i }));

      for (const st of states) {
        if (st.action !== null) {
          await (await page.$$('[role="tab"]'))[st.action].click();
          await page.waitForTimeout(500);
        }
        const m = await page.evaluate(measure);
        const file = `${OUT}/${vp.name}/${slug(route)}__${slug(st.label)}.png`;
        fs.mkdirSync(path.dirname(file), { recursive: true });
        await page.screenshot({ path: file, fullPage: true });
        rec.states.push({ label: st.label, ...m, screenshot: file });
      }

      // ---------- 3. flag problems ----------
      const widths = rec.states.map((s) => s.mainWidth).filter(Boolean);
      if (widths.length > 1 && Math.max(...widths) - Math.min(...widths) > 4) {
        rec.issues.push(
          "WIDTH-SHRINK: main width differs between states: " +
            rec.states.map((s) => `${s.label}=${s.mainWidth}px`).join(", ")
        );
      }
      const first = rec.states[0];
      if (first.mainWidth) {
        const avail = vp.width - (vp.width >= 640 ? SIDEBAR : 0);
        const expectedMax = Math.min(avail, 1152); // max-w-6xl = 1152px (5xl = 1024)
        if (first.mainWidth < Math.min(expectedMax, 1024) * 0.85)
          rec.issues.push(`NARROW: main is ${first.mainWidth}px, space available ~${avail}px`);
      }
      for (const s of rec.states) {
        if (s.hOverflow) rec.issues.push(`H-OVERFLOW in "${s.label}" (page scrolls sideways)`);
        if (s.offscreen.length) rec.issues.push(`OFFSCREEN in "${s.label}": ${s.offscreen.join(" | ")}`);
      }
      if (rec.status >= 400) rec.issues.push(`HTTP ${rec.status}`);
    } catch (e) {
      rec.issues.push("ERROR: " + e.message.slice(0, 160));
    }
    rec.errors = [...new Set(errors)].slice(0, 5);
    results.push(rec);
    console.log(`${rec.issues.length ? "!!" : "ok"}  ${vp.name.padEnd(13)} ${route}`);
    await ctx.close();
  }
}
await browser.close();

// ---------- 4. consistency across pages ----------
const consistency = [];
for (const vp of VIEWPORTS.filter((v) => v.width >= 1366)) {
  const by = {};
  results.filter((r) => r.viewport === vp.name && r.states[0]?.mainWidth && !r.route.startsWith("/admin") && r.route !== "/" && r.route !== "/login")
    .forEach((r) => ((by[r.states[0].mainWidth] ||= []).push(r.route)));
  consistency.push({ viewport: vp.name, widthGroups: by });
}

// ---------- 5. write report ----------
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ base: BASE, results, consistency }, null, 2));
let md = `# Layout audit - ${BASE}\n\n`;
const bad = results.filter((r) => r.issues.length || r.errors.length);
md += `${results.length} checks, ${bad.length} with problems.\n\n## Problems\n\n`;
for (const r of bad) {
  md += `### ${r.route}  (${r.viewport})\n`;
  r.issues.forEach((i) => (md += `- ${i}\n`));
  r.errors.forEach((i) => (md += `- ${i}\n`));
  md += `- screenshot: ${r.states[0]?.screenshot || "n/a"}\n\n`;
}
md += `## Content width per page (for consistency)\n\nPages in the same group have the same content width. Different groups = inconsistent container widths.\n\n`;
for (const c of consistency) {
  md += `**${c.viewport}**\n`;
  for (const [w, rs] of Object.entries(c.widthGroups)) md += `- ${w}px: ${rs.join(", ")}\n`;
  md += "\n";
}
fs.writeFileSync(`${OUT}/report.md`, md);
console.log(`\nDone. Open ${OUT}/report.md and send it (plus ${OUT}/ screenshots) to Claude.`);
