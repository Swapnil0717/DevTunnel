"use client";

import { useEffect } from "react";

/**
 * The one error boundary that catches a crash in the ROOT `layout.tsx`
 * itself — a plain `app/error.tsx` can't, since it renders *inside* the
 * root layout and is unmounted along with everything else if that layout
 * throws. Next.js requires this file to render its own `<html>`/`<body>`,
 * since the real root layout is exactly what it's standing in for.
 *
 * Deliberately has zero shared imports (no `Logo`, no Tailwind classes
 * that assume `globals.css` loaded) — if the root layout itself is
 * broken, this needs to survive independently of it.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Root layout crashed", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif" }}>
        <main
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 24,
            textAlign: "center",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Something went wrong</h1>
          <p style={{ margin: 0, fontSize: 14, color: "#666" }}>
            DevTunnel hit an unexpected error loading this page.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              borderRadius: 6,
              border: "1px solid #ccc",
              background: "#fff",
              padding: "8px 20px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}