"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { startDemo } from "./hero-demo-runner";

/**
 * The four-step demo under the hero (find a task, understand it, ship it, see
 * it count). The markup is static and complete without JavaScript; the runner
 * only animates it. The text is an example, not live data.
 */
export function HeroDemo() {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return startDemo(root);
  }, []);

  return (
    <section ref={rootRef} className="demo" id="demo" aria-label="Demo: from a matched task to your first pull request">
      <div className="d-tabs" role="group" aria-label="Demo steps">
        <button className="d-tab on" type="button" data-step="0" aria-pressed="true">
          <b>1</b>
          <span className="lf">Find a task</span>
          <span className="ls">Find</span>
        </button>
        <button className="d-tab" type="button" data-step="1" aria-pressed="false">
          <b>2</b>
          <span className="lf">Understand it</span>
          <span className="ls">Understand</span>
        </button>
        <button className="d-tab" type="button" data-step="2" aria-pressed="false">
          <b>3</b>
          <span className="lf">Ship it</span>
          <span className="ls">Ship</span>
        </button>
        <button className="d-tab" type="button" data-step="3" aria-pressed="false">
          <b>4</b>
          <span className="lf">See it count</span>
          <span className="ls">Profile</span>
        </button>
        <span className="d-meta">Example · acme/ui-kit#482</span>
        <button className="d-ctl" type="button" id="ctl" aria-label="Pause demo">
          <svg className="ic i-pause" aria-hidden="true">
            <use href="#dti-pause"></use>
          </svg>
          <svg className="ic i-play" aria-hidden="true" style={{ fill: "currentColor" }}>
            <use href="#dti-playb"></use>
          </svg>
        </button>
      </div>
      <p className="sr">Example run. DevTunnel shows tasks matched to your role, level and tech stack. It explains the one you pick in plain words, labeled as AI-generated. The dev command line tool then forks the project, runs its tests and opens the pull request. The pull request is added to your profile as a contribution.</p>
      <div className="d-stage" id="stage">
        <div className="sc on play" data-sc="0">
          <div className="sc-h">
            <span className="k">Matched to your profile</span>
            <span className="tag t-skill">Frontend</span>
            <span className="tag t-int">Beginner</span>
            <span className="tag t-tech">TypeScript</span>
          </div>
          <div className="mcs">
            <div className="mc first" style={{ "--d": ".2s" } as CSSProperties}>
              <div className="m">
                <h3>Close button skipped in tab order</h3>
                <p className="r">acme/ui-kit</p>
                <div className="chips">
                  <span className="tag t-skill">Frontend</span>
                  <span className="tag t-int">Beginner</span>
                  <span className="tag t-tech">TypeScript</span>
                </div>
              </div>
              <span className="pc">94% match</span>
              <span className="go">
                View task
                <svg className="ic" aria-hidden="true">
                  <use href="#dti-arrow"></use>
                </svg>
              </span>
            </div>
            <div className="mc" style={{ "--d": ".6s" } as CSSProperties}>
              <div className="m">
                <h3>Tooltip is cut off near the screen edge</h3>
                <p className="r">northwind/charts</p>
                <div className="chips">
                  <span className="tag t-skill">Frontend</span>
                  <span className="tag t-int">Beginner</span>
                  <span className="tag t-tech">React</span>
                </div>
              </div>
              <span className="pc">89% match</span>
            </div>
            <div className="mc" style={{ "--d": "1s" } as CSSProperties}>
              <div className="m">
                <h3>Search box loses focus after one letter</h3>
                <p className="r">lumen/docs-site</p>
                <div className="chips">
                  <span className="tag t-skill">Frontend</span>
                  <span className="tag t-int">Beginner</span>
                  <span className="tag t-tech">TypeScript</span>
                </div>
              </div>
              <span className="pc">85% match</span>
            </div>
          </div>
        </div>
        <div className="sc" data-sc="1">
          <div className="d-two">
            <div className="bx rv" style={{ "--d": ".1s" } as CSSProperties}>
              <span className="r">acme/ui-kit #482</span>
              <h3>Close button skipped in tab order</h3>
              <p className="desc">Pressing Tab in the settings dialog moves from the title straight to Save. The close button never gets focus.</p>
              <div className="chips">
                <span className="tag t-skill">bug</span>
                <span className="tag t-int">accessibility</span>
              </div>
              <p className="lt rv" style={{ "--d": "1.4s" } as CSSProperties}>Why it matched you</p>
              <ul className="why">
                <li className="rv" style={{ "--d": "1.7s" } as CSSProperties}>
                  <svg className="ic" aria-hidden="true">
                    <use href="#dti-check2"></use>
                  </svg>
                  Role: Frontend
                </li>
                <li className="rv" style={{ "--d": "2s" } as CSSProperties}>
                  <svg className="ic" aria-hidden="true">
                    <use href="#dti-check2"></use>
                  </svg>
                  Level: Beginner
                </li>
                <li className="rv" style={{ "--d": "2.3s" } as CSSProperties}>
                  <svg className="ic" aria-hidden="true">
                    <use href="#dti-check2"></use>
                  </svg>
                  Stack: TypeScript
                </li>
              </ul>
            </div>
            <div className="bx">
              <div className="bx-head rv" style={{ "--d": ".2s" } as CSSProperties}>
                <h4>Issue explained</h4>
                <span className="ai">
                  <svg className="ic" aria-hidden="true">
                    <use href="#dti-spark"></use>
                  </svg>
                  AI-generated
                </span>
              </div>
              <p className="lt rv" style={{ "--d": ".5s" } as CSSProperties}>What needs doing</p>
              <ul>
                <li className="rv" style={{ "--d": ".8s" } as CSSProperties}>Make the close button reachable with the Tab key.</li>
                <li className="rv" style={{ "--d": "1.2s" } as CSSProperties}>Keep the order: title, close, then Save.</li>
              </ul>
              <p className="lt rv" style={{ "--d": "1.8s" } as CSSProperties}>First steps</p>
              <ol>
                <li className="rv" style={{ "--d": "2.1s" } as CSSProperties}>Open the settings dialog component.</li>
                <li className="rv" style={{ "--d": "2.5s" } as CSSProperties}>Check the order of its focusable parts.</li>
                <li className="rv" style={{ "--d": "2.9s" } as CSSProperties}>Fix the order and add a test.</li>
              </ol>
              <p className="fine rv" style={{ "--d": "3.5s" } as CSSProperties}>AI can be wrong. Read the issue too.</p>
            </div>
          </div>
        </div>
        <div className="sc" data-sc="2">
          <ol className="hst" id="stages">
            <li className="now">
              <span className="nd">
                <svg className="ic ck">
                  <use href="#dti-check2"></use>
                </svg>
              </span>
              <span className="lb">Open</span>
            </li>
            <li>
              <span className="nd">
                <svg className="ic ck">
                  <use href="#dti-check2"></use>
                </svg>
              </span>
              <span className="lb">
                In progress
                <small>dev start</small>
              </span>
            </li>
            <li>
              <span className="nd">
                <svg className="ic ck">
                  <use href="#dti-check2"></use>
                </svg>
              </span>
              <span className="lb">
                PR submitted
                <small>dev submit</small>
              </span>
            </li>
            <li>
              <span className="nd">
                <svg className="ic ck">
                  <use href="#dti-check2"></use>
                </svg>
              </span>
              <span className="lb">Done</span>
            </li>
          </ol>
          <div className="term" aria-hidden="true">
            <div className="th">
              <span className="k">Your terminal</span>
            </div>
            <div className="d-out" id="out"></div>
          </div>
        </div>
        <div className="sc" data-sc="3">
          <div className="pf-top rv" style={{ "--d": ".1s" } as CSSProperties}>
            <span className="av">
              <svg className="ic" aria-hidden="true">
                <use href="#dti-user"></use>
              </svg>
            </span>
            <div>
              <strong>Your profile</strong>
              <span className="s">Built from things that really happened</span>
            </div>
            <span className="pf-ms rv" style={{ "--d": "1.7s" } as CSSProperties}>
              <svg className="ic" aria-hidden="true">
                <use href="#dti-check2"></use>
              </svg>
              First pull request
            </span>
          </div>
          <div className="calbox rv" style={{ "--d": ".3s" } as CSSProperties}>
            <div className="k">
              <span>Contribution calendar</span>
              <span>Today</span>
            </div>
            <div className="cal" id="cal" aria-hidden="true"></div>
          </div>
          <div className="pf-stats">
            <div className="rv" style={{ "--d": "1.9s" } as CSSProperties}>
              <b>1</b>
              <span>Task started</span>
            </div>
            <div className="rv" style={{ "--d": "2.1s" } as CSSProperties}>
              <b>1</b>
              <span>Pull request opened</span>
            </div>
            <div className="rv" style={{ "--d": "2.3s" } as CSSProperties}>
              <b>1</b>
              <span>Project contributed to</span>
            </div>
          </div>
          <div className="pf-cta rv" style={{ "--d": "2.8s" } as CSSProperties}>
            <span>Your first one is waiting.</span>
            <Link href="/login">
              <svg className="ic" aria-hidden="true">
                <use href="#dti-gh"></use>
              </svg>
              Sign up with GitHub
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
