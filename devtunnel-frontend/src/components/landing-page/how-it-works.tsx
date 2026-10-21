import { CopyButton } from "./copy-button";

export function HowItWorks() {
  return (
    <section className="hw" id="how" aria-labelledby="hw-h">
      <div className="ps-in">
        <div className="ps-head">
          <span className="k">How it works</span>
          <h2 id="hw-h">Start anywhere. Every stage is recorded from something that happened.</h2>
          <p>Start from a DevTunnel task, a whole project or any public GitHub issue. These are the exact commands the Contribute pages show.</p>
        </div>
        <div id="cli" className="hw-block">
          <div className="hw-win">
            <input className="sr" type="radio" name="hw" id="hw1" aria-label="A GitHub issue" defaultChecked />
            <input className="sr" type="radio" name="hw" id="hw2" aria-label="A DevTunnel task" />
            <input className="sr" type="radio" name="hw" id="hw3" aria-label="A whole project" />
            <div className="hw-tabs" role="group" aria-label="Where to start">
              <label className="hw-tab" htmlFor="hw1">
                <strong>A GitHub issue</strong>
                <span>Any public repository</span>
              </label>
              <label className="hw-tab" htmlFor="hw2">
                <strong>A DevTunnel task</strong>
                <span>Curated, with role and difficulty</span>
              </label>
              <label className="hw-tab" htmlFor="hw3">
                <strong>A whole project</strong>
                <span>Claim the project itself</span>
              </label>
            </div>
            <div className="hw-p p1">
              <h3>Start from any public GitHub issue</h3>
              <div className="hw-cmd">
                <div className="hw-line"><code>npm install -g @devtunnelcli/cli</code><CopyButton text="npm install -g @devtunnelcli/cli" /></div>
                <p>Install the CLI globally (Node.js 18.18+).</p>
              </div>
              <div className="hw-cmd">
                <div className="hw-line"><code>dev login</code><CopyButton text="dev login" /></div>
                <p>Sign in with GitHub and store the token locally.</p>
              </div>
              <div className="hw-cmd">
                <div className="hw-line"><code>dev start owner/repo#123</code><CopyButton text="dev start owner/repo#123" /></div>
                <p>Fork, clone, and check out a branch for this issue from the latest upstream.</p>
              </div>
              <div className="hw-cmd">
                <div className="hw-line"><code>dev test</code><CopyButton text="dev test" /></div>
                <p>Pull the latest changes and run the project’s own tests.</p>
              </div>
              <div className="hw-cmd">
                <div className="hw-line"><code>dev submit</code><CopyButton text="dev submit" /></div>
                <p>Commit, push, and open the pull request using the repo’s PR template if it has one.</p>
              </div>
            </div>
            <div className="hw-p p2">
              <h3>Start from a DevTunnel task</h3>
              <div className="hw-cmd">
                <div className="hw-line"><code>npm install -g @devtunnelcli/cli</code><CopyButton text="npm install -g @devtunnelcli/cli" /></div>
                <p>Install the CLI globally (Node.js 18.18+).</p>
              </div>
              <div className="hw-cmd">
                <div className="hw-line"><code>dev login</code><CopyButton text="dev login" /></div>
                <p>Sign in with GitHub and store the token locally.</p>
              </div>
              <div className="hw-cmd">
                <div className="hw-line"><code>dev start &lt;task-id&gt;</code><CopyButton text="dev start <task-id>" /></div>
                <p>Claim the task. The branch is named for it.</p>
              </div>
              <div className="hw-cmd">
                <div className="hw-line"><code>dev test</code><CopyButton text="dev test" /></div>
                <p>Pull the latest changes and run the project’s own tests.</p>
              </div>
              <div className="hw-cmd">
                <div className="hw-line"><code>dev submit &lt;task-id&gt;</code><CopyButton text="dev submit <task-id>" /></div>
                <p>Open the pull request, link the task’s issue and mark it in review.</p>
              </div>
            </div>
            <div className="hw-p p3">
              <h3>Claim a whole DevTunnel project</h3>
              <div className="hw-cmd">
                <div className="hw-line"><code>npm install -g @devtunnelcli/cli</code><CopyButton text="npm install -g @devtunnelcli/cli" /></div>
                <p>Install the CLI globally (Node.js 18.18+).</p>
              </div>
              <div className="hw-cmd">
                <div className="hw-line"><code>dev login</code><CopyButton text="dev login" /></div>
                <p>Sign in with GitHub and store the token locally.</p>
              </div>
              <div className="hw-cmd">
                <div className="hw-line"><code>dev start &lt;project-id&gt; --project</code><CopyButton text="dev start <project-id> --project" /></div>
                <p>Fork the repo, clone it, and check out a new branch.</p>
              </div>
              <div className="hw-cmd">
                <div className="hw-line"><code>dev test</code><CopyButton text="dev test" /></div>
                <p>Pull the latest changes and run the project’s own tests.</p>
              </div>
              <div className="hw-cmd">
                <div className="hw-line"><code>dev submit &lt;project-id&gt; --project</code><CopyButton text="dev submit <project-id> --project" /></div>
                <p>Commit your changes, push them, and open a pull request.</p>
              </div>
            </div>
          </div>
          <p className="hw-note">
            Node.js 18.18 or newer. Prefer no install?{" "}
            <code>npx @devtunnelcli/cli &lt;command&gt;</code>
          </p>
        </div>
        <div id="lifecycle" className="hw-block hw-life">
          <div className="hw-lh">
            <span className="k">Task lifecycle</span>
            <h3>Progress that DevTunnel actually recorded</h3>
            <p>
              Each stage comes from something that happened, such as a{" "}
              <code>dev start</code>
              {" "}or a pull request opened by{" "}
              <code>dev submit</code>
              , never from a box someone ticked.
            </p>
          </div>
          <ol className="hw-stages">
            <li className="hw-st">
              <span className="hw-n" aria-hidden="true">1</span>
              <code className="hw-code">OPEN</code>
              <h4>Open</h4>
              <p>A curated task nobody has claimed yet, with its role, difficulty and tech stack.</p>
            </li>
            <li className="hw-st">
              <span className="hw-n" aria-hidden="true">2</span>
              <code className="hw-code">IN_PROGRESS</code>
              <h4>In progress</h4>
              <p>You started it. The branch is named for the task.</p>
              <span className="hw-pill">dev start</span>
            </li>
            <li className="hw-st">
              <span className="hw-n" aria-hidden="true">3</span>
              <code className="hw-code">IN_REVIEW</code>
              <h4>PR submitted</h4>
              <p>A pull request is open and linked to the task’s issue.</p>
              <span className="hw-pill">dev submit</span>
            </li>
            <li className="hw-st">
              <span className="hw-n" aria-hidden="true">4</span>
              <code className="hw-code">DONE</code>
              <h4>Done</h4>
              <p>The task is complete. DevTunnel only says “merged” at this stage.</p>
            </li>
          </ol>
          <p className="hw-fine">“PR submitted” means a pull request was opened, not merged. DevTunnel does not watch the merge itself.</p>
        </div>
      </div>
    </section>
  );
}
