import { hostname } from "node:os";
import open from "open";
import pc from "picocolors";
import { getApiBaseUrl } from "../lib/config";
import { readCredentials, writeCredentials } from "../lib/credentials";
import { generatePkcePair } from "../lib/pkce";
import { startLoopbackServer } from "../lib/server";
import { apiPost, ApiError } from "../lib/api";

/** How long `dev login` waits for the browser round trip before giving up. */
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

interface CliTokenResponse {
  token: string;
  user: {
    id: string;
    username: string;
    name: string | null;
    avatarUrl: string | null;
  };
}

export async function loginCommand(): Promise<void> {
  const existing = readCredentials();
  if (existing) {
    console.log(
      `${pc.yellow("!")} Already signed in as ${pc.bold(existing.user.username)}. ` +
        `Run ${pc.cyan("dev logout")} first if you want to switch accounts.`,
    );
    return;
  }

  const apiBaseUrl = getApiBaseUrl();
  const { verifier, challenge } = generatePkcePair();

  const loopback = await startLoopbackServer();

  const startUrl = new URL("/auth/cli/start", apiBaseUrl);
  startUrl.searchParams.set("port", String(loopback.port));
  startUrl.searchParams.set("challenge", challenge);

  console.log(`${pc.cyan("→")} Opening your browser to sign in with GitHub…`);
  console.log(`  ${pc.dim(startUrl.toString())}`);

  try {
    await open(startUrl.toString());
  } catch {
    console.log(
      `${pc.yellow("!")} Couldn't open a browser automatically — open the URL above manually.`,
    );
  }

  let code: string;
  try {
    const result = await loopback.waitForCallback(LOGIN_TIMEOUT_MS);
    code = result.code;
  } catch (err) {
    loopback.close();
    console.error(`${pc.red("✗")} ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }
  loopback.close();

  try {
    const response = await apiPost<CliTokenResponse>("/auth/cli/token", {
      code,
      verifier,
      label: hostname(),
    });

    writeCredentials({
      token: response.token,
      apiBaseUrl,
      user: response.user,
      createdAt: new Date().toISOString(),
    });

    console.log(`${pc.green("✓")} Signed in as ${pc.bold(response.user.username)}.`);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : String(err);
    console.error(`${pc.red("✗")} Sign-in failed: ${message}`);
    process.exitCode = 1;
  }
}