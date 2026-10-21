import Link from "next/link";
import { PROJECT_GITHUB_URL } from "@/lib/config";
import { Ic } from "./icon";

export function Control() {
  return (
    <section className="ct" id="control" aria-labelledby="ct-h">
      <div className="ps-in">
        <div className="ct-panel">
          <div className="ct-main">
            <div className="ct-lead">
              <span className="k">Your work, your control</span>
              <h2 id="ct-h">DevTunnel finds and tracks the work. You and the repo owner keep the rest.</h2>
              <p>It is a coordination layer on top of GitHub, not a replacement for GitHub’s permissions.</p>
            </div>
            <ul className="ct-facts">
              <li className="ct-f">
                <Ic id="shield" className="ct-i" />
                <h3>Your own GitHub token</h3>
                <p>Pull requests are opened with your own GitHub token, so the work is yours on GitHub.</p>
              </li>
              <li className="ct-f">
                <Ic id="pr" className="ct-i" />
                <h3>The repo owner decides</h3>
                <p>DevTunnel can’t merge anything. Merge authority always stays with the original repository owner.</p>
              </li>
              <li className="ct-f">
                <Ic id="log" className="ct-i" />
                <h3>Open source, MIT licensed</h3>
                <p>Read the code and the license yourself.</p>
                <a href={PROJECT_GITHUB_URL} target="_blank" rel="noopener noreferrer" className="ct-link">
                  Read the source
                  <Ic id="arrow" size={15} />
                </a>
              </li>
              <li className="ct-f">
                <Ic id="search" className="ct-i" />
                <h3>Browse without an account</h3>
                <p>Projects, tasks, tools and issues are public. Sign in only when you want to start work.</p>
                <Link href="/tasks" className="ct-link">
                  Browse tasks
                  <Ic id="arrow" size={15} />
                </Link>
              </li>
            </ul>
          </div>
          <div className="ct-strip">
            <span className="k">Works with</span>
            <span className="ct-w">
              <svg className="ct-logo" viewBox="0 0 16 16" aria-hidden="true">
                <use href="#dti-gh"></use>
              </svg>
              GitHub
            </span>
            <span className="ct-w">
              <svg className="ct-logo" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M0 0v16h16V0H0zm13 13h-2.5V5.5H8V13H3V3h10v10z"></path>
              </svg>
              npm
            </span>
            <span className="ct-w">
              <svg className="ct-logo" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 .5 14.5 4.25v7.5L8 15.5 1.5 11.75v-7.5L8 .5zm0 2.3L3.5 5.4v5.2L8 13.2l4.5-2.6V5.4L8 2.8z"></path>
              </svg>
              Node.js
            </span>
            <span className="ct-na">Not affiliated with or endorsed by GitHub.</span>
          </div>
        </div>
      </div>
    </section>
  );
}
