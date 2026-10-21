"use client";

import { useEffect, useRef, useState } from "react";
import { Ic } from "./icon";

/** "Copy" button for a command line. Shows "Copied" for a moment after a click. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const pending = timer;
    return () => window.clearTimeout(pending.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard access can be blocked (insecure context, permissions).
      // Nothing useful to do, and the text is still selectable.
      return;
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      className="hw-copy"
      type="button"
      onClick={copy}
      aria-label={`Copy ${text}`}
    >
      <Ic id={copied ? "check2" : "copy"} size={14} />
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
