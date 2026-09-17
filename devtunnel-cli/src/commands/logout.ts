import pc from "picocolors";
import { readCredentials, clearCredentials } from "../lib/credentials";
import { apiPost } from "../lib/api";

export async function logoutCommand(): Promise<void> {
  const credentials = readCredentials();
  if (!credentials) {
    console.log(`${pc.dim("You're not signed in.")}`);
    return;
  }

  try {
    await apiPost("/auth/cli/logout", {}, { token: credentials.token });
  } catch (err) {
    // Best-effort, same posture as the backend's own POST /auth/logout —
    // a network hiccup revoking server-side must never block clearing the
    // local credential, which is the part actually under the user's
    // control right now.
    console.log(
      `${pc.yellow("!")} Couldn't reach the server to revoke the token remotely (${
        err instanceof Error ? err.message : String(err)
      }). Clearing local credentials anyway.`,
    );
  }

  clearCredentials();
  console.log(`${pc.green("✓")} Signed out.`);
}