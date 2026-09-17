import { createServer, type Server } from "node:http";

export interface LoopbackResult {
  code: string;
}

const SUCCESS_PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>DevTunnel CLI — signed in</title></head>
<body style="font-family: -apple-system, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem; color: #1a1a1a;">
  <h1 style="font-size: 1.25rem;">You're signed in</h1>
  <p>Go back to your terminal — <code>dev login</code> is finishing up.</p>
  <p>You can close this tab.</p>
</body>
</html>`;

const MISSING_CODE_PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>DevTunnel CLI — sign-in failed</title></head>
<body style="font-family: -apple-system, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem; color: #1a1a1a;">
  <h1 style="font-size: 1.25rem;">Sign-in failed</h1>
  <p>DevTunnel didn't send back a login code. Go back to your terminal and run <code>dev login</code> again.</p>
</body>
</html>`;

/**
 * Starts a tiny HTTP server on `127.0.0.1` with an OS-assigned ephemeral
 * port, and resolves once `GET /callback?code=...` is hit — the redirect
 * `GET /auth/cli/callback` on the backend sends the browser to once
 * GitHub sign-in finishes (see devtunnel-backend/src/routes/authCli.ts).
 *
 * Only ever listens on the loopback interface, never `0.0.0.0` — nothing
 * about this flow should be reachable from outside the machine running
 * `dev login`.
 */
export function startLoopbackServer(): Promise<{
  port: number;
  waitForCallback: (timeoutMs: number) => Promise<LoopbackResult>;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    let resolveCallback: ((result: LoopbackResult) => void) | null = null;
    let rejectCallback: ((err: Error) => void) | null = null;

    const server: Server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }

      const code = url.searchParams.get("code");
      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" }).end(MISSING_CODE_PAGE);
        rejectCallback?.(new Error("Backend redirected without a login code."));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(SUCCESS_PAGE);
      resolveCallback?.({ code });
    });

    server.on("error", reject);

    // Port 0 asks the OS for any free ephemeral port — avoids clashing
    // with anything else already running on the machine.
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to determine loopback server port."));
        return;
      }

      resolve({
        port: address.port,
        waitForCallback: (timeoutMs: number) =>
          new Promise<LoopbackResult>((res, rej) => {
            resolveCallback = res;
            rejectCallback = rej;
            const timer = setTimeout(
              () => rej(new Error("Timed out waiting for GitHub sign-in to complete.")),
              timeoutMs,
            );
            timer.unref();
          }),
        close: () => server.close(),
      });
    });
  });
}