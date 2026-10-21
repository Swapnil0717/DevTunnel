import type { ReactNode } from "react";
import { LandingFooter } from "@/components/landing/landing-footer";
import { HeroVideo } from "./hero-video";
import { homeDisplayFont } from "./home-font";
import { HomeHeader } from "./home-header";
import { IconSprite } from "./icon-sprite";
import "./home.css";
import "./mobile.css";
import "./auth.css";

/**
 * Frame for the sign-in / sign-up page. It reuses the landing page's pieces so
 * both pages look the same: the `.dtl` scope, the landing header, the looping
 * hero video behind the content, and the shared landing footer.
 * `id="top"` is the target of the footer's "Back to top".
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div id="top" className={`dtl ${homeDisplayFont.variable}`}>
      <IconSprite />
      <a className="skip" href="#main">
        Skip to content
      </a>

      <HomeHeader />

      <main id="main">
        <div className="h-wrap au-wrap">
          <div className="h-bg" aria-hidden="true">
            <HeroVideo />
          </div>

          <div className="h-in au-in">{children}</div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
