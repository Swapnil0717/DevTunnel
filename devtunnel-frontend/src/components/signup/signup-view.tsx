import Image from "next/image";
import Link from "next/link";

import { HeroVideo } from "@/components/landing-page/hero-video";
import { homeDisplayFont } from "@/components/landing-page/home-font";
import { LinkedinIcon } from "@/components/auth/linkedin-icon";
import { LINKEDIN_URL, PROJECT_GITHUB_URL } from "@/lib/config";

import { GithubMark, SignupGithubButton } from "./signup-github-button";
import "./signup.css";

const PERKS = [
  "No password to set up",
  "Ready in a few seconds",
  "One button to sign in or sign up",
];

/** Split-screen combined sign-in / sign-up page: GitHub sign-up on the left, looping video on the right. */
export function SignupView({
  next,
  errorMessage,
}: {
  next?: string;
  errorMessage?: string;
}) {
  return (
    <div className={`sg ${homeDisplayFont.variable}`}>
      <div className="sg-wrap">
        <section className="sg-left">
          <div className="sg-top">
            <Link href="/" aria-label="DevTunnel home">
              <Image src="/logo.png" alt="DevTunnel" width={1643} height={262} priority />
            </Link>
          </div>

          <div className="sg-center">
            <main className="sg-card" id="main">
              <p className="sg-eyebrow">Welcome</p>
              <h1>Welcome to DevTunnel.</h1>
              <p className="sg-sub">
                Sign in or create your account with GitHub. New here? We\u2019ll set you up automatically in a few seconds.
              </p>

              <SignupGithubButton next={next} />

              {errorMessage ? (
                <p className="sg-error" role="alert">
                  {errorMessage}
                </p>
              ) : null}

              <div className="sg-div">
                <i />
                <span>secured via oauth</span>
                <i />
              </div>

              <ul className="sg-perks">
                {PERKS.map((text, i) => (
                  <li key={text}>
                    <b>{String(i + 1).padStart(2, "0")}</b>
                    {text}
                  </li>
                ))}
              </ul>

              <p className="sg-legal">
                By continuing you agree to the <Link href="/terms">Terms of Service</Link> and{" "}
                <Link href="/privacy">Privacy Policy</Link>.
              </p>
            </main>
          </div>

          <div className="sg-foot">
            <span>© DevTunnel</span>
            <span className="sg-sp" />
            <a href={PROJECT_GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label="DevTunnel on GitHub">
              <GithubMark />
            </a>
            <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
              <LinkedinIcon />
            </a>
          </div>
        </section>

        <aside className="sg-right">
          <HeroVideo className="sg-vid" />
          <div className="sg-cap">
            <p>Good to have you here.</p>
            <div className="sg-term" aria-label="Example commands">
              <i>$</i> <b>dev login</b>
              <br />
              <i>$</i> <b>dev start</b> --issue 142
              <br />
              <i>$</i> <b>dev submit</b> &nbsp;<i>→ PR opened</i>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
