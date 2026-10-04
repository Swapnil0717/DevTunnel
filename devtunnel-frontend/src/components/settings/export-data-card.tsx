"use client";

import { useState } from "react";
import { exportMyData } from "@/lib/settings/api";
import { Spinner } from "@/components/ui/spinner";

/**
 * "Your data" — downloads a JSON copy of the account's data
 * (`GET /settings/export`). Rate-limited server-side, so the button is
 * disabled while a request is in flight and shows a plain error on failure.
 */
export function ExportDataCard() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setError(null);
    setBusy(true);
    try {
      const blob = await exportMyData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `devtunnel-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Couldn't prepare your data. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[10px] border border-border bg-surface p-5">
      <h2 className="m-0 mb-1 text-sm font-medium text-text">Your data</h2>
      <p className="m-0 mb-3 text-[12.5px] text-text-muted">
        Download a copy of your profile, skills, activity and submissions as a JSON file. GitHub
        tokens and sign-in secrets are never included.
      </p>
      <button
        type="button"
        onClick={handleDownload}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-md border border-border bg-transparent px-3.5 py-1.5 text-[13px] font-medium text-text transition-colors hover:border-text-dim disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <Spinner /> : null}
        {busy ? "Preparing…" : "Download my data"}
      </button>
      {error ? (
        <p role="alert" className="m-0 mt-2 text-[12.5px] text-status-error-text">
          {error}
        </p>
      ) : null}
    </section>
  );
}
