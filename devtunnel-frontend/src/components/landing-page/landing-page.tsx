import Link from "next/link";
import { BuiltInOpen } from "./built-in-the-open";
import { Control } from "./control";
import { Faq } from "./faq";
import { Features } from "./features";
import { FinalCta } from "./final-cta";
import { HeroDemo } from "./hero-demo";
import { HeroVideo } from "./hero-video";
import { HomeFooter } from "./home-footer";
import { homeDisplayFont } from "./home-font";
import { HomeHeader } from "./home-header";
import { HowItWorks } from "./how-it-works";
import { Ic } from "./icon";
import { IconSprite } from "./icon-sprite";
import { ProblemSolution } from "./problem-solution";
import "./home.css";
import "./mobile.css";

/**
 * The public landing page: header, hero with the animated demo, then the
 * Problem -> Solution, features, how-it-works, control, roadmap and FAQ
 * sections, the closing call to action and the footer.
 *
 * Everything is scoped under `.dtl` (see `home.css`) so none of its short
 * class names can reach the rest of the app. `id="top"` is the target of the
 * footer's "Back to top".
 */
export function LandingPage() {
  return (
    <div id="top" className={`dtl ${homeDisplayFont.variable}`}>
      <IconSprite />
      <a className="skip" href="#main">
        Skip to content
      </a>

      <HomeHeader />

      <main id="main">
        <div className="h-wrap">
          <div className="h-bg" aria-hidden="true">
            <HeroVideo />
          </div>

          <div className="h-in">
            <Link className="h-eye" href="/#faq">
              Free to use today
              <Ic id="arrow" size={14} />
            </Link>

            <h1 className="h-h1">
              <span>Find open source issues</span>
              <span>you can actually do.</span>
            </h1>

            <p className="h-sub">
              Tell DevTunnel your role, level and tech stack. It matches you with open source tasks you
              can finish, explains each one in plain words, and helps you send your first pull request.
            </p>

            <div className="h-actions">
              <Link className="h-cta" href="/login">
                <Ic id="gh" size={19} />
                Sign up with GitHub
              </Link>
              <Link className="h-ghost" href="/tasks">
                Browse tasks first
                <Ic id="arrow" size={16} />
              </Link>
            </div>
            <p className="h-note">
              Free to use · Open source (MIT) · <b>Browsing needs no account</b>
            </p>

            <HeroDemo />
          </div>
        </div>

        <ProblemSolution />
        <Features />
        <HowItWorks />
        <Control />
        <BuiltInOpen />
        <Faq />
        <FinalCta />
      </main>

      <HomeFooter />
    </div>
  );
}
