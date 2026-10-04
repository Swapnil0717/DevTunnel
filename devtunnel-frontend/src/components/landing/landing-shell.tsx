import type { ReactNode } from "react";
import "./landing.css";
import { CurtainBackground } from "./curtain-background";
import { displayFont } from "./display-font";
import { LandingFooter } from "./landing-footer";

/**
 * Shared frame for the landing page and the login page: the same fixed
 * curtain behind everything, the page content above it, and the landing
 * footer below. `id="top"` is the target of the footer's "Back to top".
 */
export function LandingShell({ children }: { children: ReactNode }) {
  return (
    <div id="top" className={`lp-root ${displayFont.variable}`}>
      <CurtainBackground />
      <div className="lp-content">{children}</div>
      <LandingFooter />
    </div>
  );
}
