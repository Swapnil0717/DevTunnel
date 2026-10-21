import Link from "next/link";
import { Ic } from "./icon";

export function Features() {
  return (
    <section className="fs" id="features" aria-labelledby="fs-h">
      <div className="ps-in">
        <div className="ps-head">
          <span className="k">What’s on DevTunnel</span>
          <h2 id="fs-h">Curated work, live GitHub data and AI help in one place.</h2>
          <p>Filter by tech stack, role and level. The examples below are layouts, not live data.</p>
        </div>
        <div className="fs-grid">
          <article className="fs-c c1">
            <span className="fs-ic">
              <Ic id="folder" />
            </span>
            <h3>Projects and tasks curated on DevTunnel</h3>
            <p>Each project page carries its description, tech stack, repository and tasks. Filter the catalog by tech.</p>
            <div className="fs-vis">
              <div className="fs-card">
                <div className="fs-r">
                  <b>Example project</b>
                  <span className="tag t-tech">TypeScript</span>
                </div>
                <div className="fs-r">
                  <span className="fs-mu">Short description of what the project does.</span>
                </div>
                <div className="fs-r">
                  <span className="fs-mu">Tasks · repository</span>
                  <span className="fs-mu">View project</span>
                </div>
              </div>
            </div>
            <div className="fs-links">
              <Link href="/projects" className="fs-link">
                Browse projects
                <Ic id="arrow" size={15} />
              </Link>
              <Link href="/tasks" className="fs-link">
                Browse tasks
                <Ic id="arrow" size={15} />
              </Link>
            </div>
          </article>
          <article className="fs-c c2">
            <span className="fs-ic">
              <Ic id="issue" />
            </span>
            <h3>No task needed</h3>
            <p>Run dev start on any public GitHub issue. The work still counts as a DevTunnel contribution.</p>
            <div className="fs-vis">
              <div className="fs-term">
                <div>
                  <i>$</i>
                  {" "}
                  <b>dev start owner/repo#123</b>
                </div>
                <div className="fs-dm"># counts on your profile</div>
              </div>
            </div>
            <div className="fs-links">
              <Link href="/#cli" className="fs-link">
                See all commands
                <Ic id="arrow" size={15} />
              </Link>
            </div>
          </article>
          <article className="fs-c c3">
            <span className="fs-ic">
              <Ic id="gh" />
            </span>
            <h3>Live from GitHub</h3>
            <p>Cached views of GitHub data, refreshed often.</p>
            <div className="fs-vis">
              <ul className="fs-list">
                <li>
                  <Link href="/github-projects">
                    GitHub Projects
                    <Ic id="arrow" size={15} />
                  </Link>
                </li>
                <li>
                  <Link href="/github-open-source-tools">
                    GitHub Open Source Tools
                    <Ic id="arrow" size={15} />
                  </Link>
                </li>
                <li>
                  <Link href="/issues">
                    All Issues
                    <Ic id="arrow" size={15} />
                  </Link>
                </li>
              </ul>
            </div>
            <div className="fs-links"></div>
          </article>
          <article className="fs-c c4">
            <span className="fs-ic">
              <Ic id="pkg" />
            </span>
            <h3>Open source tools</h3>
            <p>Filter by language and label. Each tool comes with a setup guide.</p>
            <div className="fs-vis">
              <div className="fs-chips">
                <span className="k">Language</span>
                <span className="tag t-tech">TypeScript</span>
                <span className="tag t-tech">Python</span>
                <span className="tag t-tech">Go</span>
              </div>
              <div className="fs-chips">
                <span className="k">Label</span>
                <span className="tag t-skill">CLI</span>
                <span className="tag t-skill">Testing</span>
              </div>
            </div>
            <div className="fs-links">
              <Link href="/opensource-tools" className="fs-link">
                See tools
                <Ic id="arrow" size={15} />
              </Link>
            </div>
          </article>
          <article className="fs-c c5">
            <span className="fs-ic">
              <Ic id="spark" />
            </span>
            <h3>AI help, always labeled</h3>
            <p>Search the catalog in plain words, get a summary, or have an issue explained. Sign-in required, and the text is shown as plain text.</p>
            <div className="fs-vis">
              <div className="fs-ask">
                <Ic id="search" />
                <span>Ask AI: beginner-friendly React issues with docs work</span>
              </div>
              <div style={{ marginTop: "10px" }}>
                <span className="ai">
                  <Ic id="spark" />
                  AI-generated
                </span>
              </div>
            </div>
            <div className="fs-links"></div>
          </article>
          <article className="fs-c c6">
            <span className="fs-ic">
              <Ic id="users" />
            </span>
            <h3>Projects and tools from contributors</h3>
            <p>Signed-in contributors can submit a project or tool, and the community upvotes what is useful.</p>
            <div className="fs-vis">
              <div className="fs-sub">
                <div className="fs-r">
                  <span>Example submission</span>
                  <span className="fs-mu">▲ upvotes</span>
                </div>
                <div className="fs-r">
                  <span>Another example</span>
                  <span className="fs-mu">▲ upvotes</span>
                </div>
              </div>
            </div>
            <div className="fs-links">
              <Link href="/submissions" className="fs-link">
                See community
                <Ic id="arrow" size={15} />
              </Link>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
