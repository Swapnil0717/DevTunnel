// Opens a real browser so YOU sign in with GitHub once. Saves the session
// to auth.json so audit.mjs can also check logged-in pages (home, profile...).
// Usage: BASE_URL=https://devtunnel.tech node save-auth.mjs
import { chromium } from "playwright";
const BASE = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(`${BASE}/login`);
console.log("\nSign in in the opened browser window.");
console.log("When you can see your Home page, come back here and press ENTER.\n");
await new Promise((r) => process.stdin.once("data", r));
await ctx.storageState({ path: "auth.json" });
console.log("Saved auth.json (keep it private, do not commit it).");
await browser.close();
process.exit(0);
