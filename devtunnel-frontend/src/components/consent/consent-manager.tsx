"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { GA_MEASUREMENT_ID } from "@/lib/config";
import {
  CONSENT_CHANGE_EVENT,
  OPEN_SETTINGS_EVENT,
  clearAnalyticsCookies,
  readConsent,
  writeConsent,
  type ConsentChoice,
} from "@/lib/consent";

type GtagFn = (...args: unknown[]) => void;
type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: GtagFn;
};

/** Google's documented opt-out switch: `window['ga-disable-<ID>'] = true` stops all measurement. */
function setAnalyticsDisabled(id: string, disabled: boolean): void {
  (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = disabled;
}

/**
 * Cookie consent banner + the (consent-gated) Google Analytics 4 loader.
 *
 * Mounted once in the root layout. It renders nothing, and loads nothing,
 * unless `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set. The analytics script is only
 * injected after the visitor presses Accept; declining (or never answering)
 * means no request to Google is ever made. Accept and Decline are equally
 * prominent on purpose, and the choice can be changed any time through any
 * "Cookie settings" link (`openCookieSettings()` in lib/consent.ts).
 */
export function ConsentManager() {
  const measurementId = GA_MEASUREMENT_ID;
  const pathname = usePathname();
  const [choice, setChoice] = useState<ConsentChoice | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const scriptInjected = useRef(false);

  // Read the stored choice after mount (the server can't see it) and show the
  // banner only when there isn't one.
  useEffect(() => {
    const stored = readConsent();
    setChoice(stored);
    setOpen(stored === null);
    setReady(true);

    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, reopen);
  }, []);

  const w = typeof window === "undefined" ? null : (window as AnalyticsWindow);

  const loadAnalytics = useCallback(() => {
    if (!measurementId || !w) return;
    setAnalyticsDisabled(measurementId, false);
    if (scriptInjected.current) return;
    scriptInjected.current = true;

    w.dataLayer = w.dataLayer ?? [];
    w.gtag =
      w.gtag ??
      function gtag(...args: unknown[]) {
        w.dataLayer!.push(args);
      };
    w.gtag("js", new Date());
    // page_view is sent by hand below so client-side navigations are counted too.
    w.gtag("config", measurementId, { send_page_view: false, anonymize_ip: true });

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
  }, [measurementId, w]);

  // Load, or switch off, analytics whenever the choice changes.
  useEffect(() => {
    if (!measurementId || !w || !ready) return;
    if (choice === "granted") {
      loadAnalytics();
    } else if (choice === "denied") {
      setAnalyticsDisabled(measurementId, true);
      clearAnalyticsCookies();
    }
  }, [choice, ready, measurementId, w, loadAnalytics]);

  // Count a page view on every route change, but only with consent.
  useEffect(() => {
    if (choice !== "granted" || !w?.gtag) return;
    w.gtag("event", "page_view", {
      page_path: pathname,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [choice, pathname, w]);

  function decide(next: ConsentChoice) {
    writeConsent(next);
    setChoice(next);
    setOpen(false);
  }

  // Keep other tabs/components in step with a change made elsewhere.
  useEffect(() => {
    const sync = () => setChoice(readConsent());
    window.addEventListener(CONSENT_CHANGE_EVENT, sync);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, sync);
  }, []);

  if (!measurementId || !ready || !open) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="dt-consent-title"
      aria-describedby="dt-consent-desc"
      // Phone: a bottom sheet, full width, above the bottom tab bar and clear of the
      // home indicator. Laptop (sm+): a compact card in the bottom-right corner so it
      // never covers the left sidebar or the page's main content.
      className="fixed inset-x-0 bottom-0 z-[60] rounded-t-[14px] border-t border-border bg-surface-raised px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 shadow-[0_-8px_30px_rgba(0,0,0,0.5)] sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[400px] sm:rounded-[12px] sm:border sm:p-4 sm:shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
    >
      <h2 id="dt-consent-title" className="m-0 mb-1 text-[14px] font-medium text-text">
        Cookies &amp; analytics
      </h2>
      <p id="dt-consent-desc" className="m-0 mb-3.5 text-[12.5px] leading-[1.55] text-text-muted">
        We use essential cookies to keep you signed in. With your OK we also use Google Analytics
        to count visits. Nothing from Google loads until you accept. Read the{" "}
        <Link href="/cookies" className="text-text underline underline-offset-2 hover:text-accent">
          Cookie policy
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-text underline underline-offset-2 hover:text-accent">
          Privacy policy
        </Link>
        .
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => decide("denied")}
          className="rounded-md border border-border bg-transparent px-3.5 py-2 text-[13px] font-medium text-text transition-colors hover:border-text-dim"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => decide("granted")}
          className="rounded-md border border-border bg-transparent px-3.5 py-2 text-[13px] font-medium text-text transition-colors hover:border-text-dim"
        >
          Accept analytics
        </button>
      </div>
    </div>
  );
}
