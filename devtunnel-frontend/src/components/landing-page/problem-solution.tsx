import Link from "next/link";
import { Ic } from "./icon";

export function ProblemSolution() {
  return (
    <section className="ps" id="why" aria-labelledby="ps-h">
      <div className="ps-in">
        <div className="ps-head">
          <span className="k">Why DevTunnel</span>
          <h2 id="ps-h">Contributing to open source is harder than it needs to be.</h2>
          <p>Three things get in the way of a first pull request. DevTunnel takes each one on directly.</p>
        </div>
        <div className="ps-panel">
          <div className="ps-cols">
            <span className="k">On your own</span>
            <span className="k ps-w">With DevTunnel</span>
          </div>
          <div className="ps-row">
            <div className="ps-l">
              <span className="k ps-lab">On your own</span>
              <span className="k">01</span>
              <h3>An issue list doesn’t say whether you can do the work.</h3>
              <p>Skills needed and difficulty are rarely stated, so you read several issues before one fits.</p>
            </div>
            <div className="ps-r">
              <span className="ps-dot" aria-hidden="true">
                <Ic id="arrow" size={14} />
              </span>
              <span className="k ps-lab ps-w">With DevTunnel</span>
              <h3>Tasks come with a role, a level and a tech stack.</h3>
              <p>The same ones you pick in onboarding, so the list narrows to your profile.</p>
              <div className="ps-vis">
                <span className="tag t-skill">Frontend</span>
                <span className="tag t-int">Beginner</span>
                <span className="tag t-tech">TypeScript</span>
                <span className="ps-m">94% match · example</span>
              </div>
              <Link href="/tasks" className="ps-link">
                Browse tasks
                <Ic id="arrow" size={15} />
              </Link>
            </div>
          </div>
          <div className="ps-row">
            <div className="ps-l">
              <span className="k ps-lab">On your own</span>
              <span className="k">02</span>
              <h3>Fork, clone, branch, test, push: easy to get wrong the first time.</h3>
              <p>Each step is separate, and a missed one means a pull request that fails or never opens.</p>
            </div>
            <div className="ps-r">
              <span className="ps-dot" aria-hidden="true">
                <Ic id="arrow" size={14} />
              </span>
              <span className="k ps-lab ps-w">With DevTunnel</span>
              <h3>Three commands take you from the issue to the pull request.</h3>
              <p>The project’s own tests run first, and the pull request uses the repo’s template if it has one.</p>
              <div className="ps-vis">
                <code>dev start</code>
                <span className="ps-a">→</span>
                <code>dev test</code>
                <span className="ps-a">→</span>
                <code>dev submit</code>
              </div>
              <Link href="/#cli" className="ps-link">
                See all commands
                <Ic id="arrow" size={15} />
              </Link>
            </div>
          </div>
          <div className="ps-row">
            <div className="ps-l">
              <span className="k ps-lab">On your own</span>
              <span className="k">03</span>
              <h3>Skills on most profiles are only what people say about themselves.</h3>
              <p>A list of skills is easy to write and hard to trust.</p>
            </div>
            <div className="ps-r">
              <span className="ps-dot" aria-hidden="true">
                <Ic id="arrow" size={14} />
              </span>
              <span className="k ps-lab ps-w">With DevTunnel</span>
              <h3>Your profile is built from things that happened.</h3>
              <p>A task started, a pull request opened. Never a box someone ticked.</p>
              <div className="ps-vis">
                <span className="ps-badge">
                  <Ic id="check2" size={15} style={{ strokeWidth: "2.4" }} />
                  First pull request
                </span>
                <span className="ps-m">example profile</span>
              </div>
              <Link href="/#lifecycle" className="ps-link">
                See how progress is recorded
                <Ic id="arrow" size={15} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
