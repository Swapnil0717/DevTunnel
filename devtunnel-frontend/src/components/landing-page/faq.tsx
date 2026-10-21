import { CONTACT_EMAIL } from "@/lib/config";
import { Ic } from "./icon";

export function Faq() {
  return (
    <section className="fq" id="faq" aria-labelledby="fq-h">
      <div className="ps-in fq-in">
        <div className="fq-lead">
          <span className="k">FAQ</span>
          <h2 id="fq-h">Questions</h2>
          <p>
            Something missing? Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            .
          </p>
        </div>
        <div className="fq-list">
          <details open>
            <summary>
              <span>What is DevTunnel?</span>
              <Ic id="chev" className="fq-ch" />
            </summary>
            <p>
              A platform that connects contributors with open source projects. Contributors find tasks that match their skills, then use the{" "}
              <code>dev</code>
              {" "}CLI to start the work and open the pull request.
            </p>
          </details>
          <details>
            <summary>
              <span>What is the dev CLI?</span>
              <Ic id="chev" className="fq-ch" />
            </summary>
            <p>
              A command line tool that automates the GitHub contribution workflow:{" "}
              <code>dev login</code>
              ,{" "}
              <code>dev start</code>
              ,{" "}
              <code>dev test</code>
              {" "}and{" "}
              <code>dev submit</code>
              . Install it with{" "}
              <code>npm install -g @devtunnelcli/cli</code>
              , or prefix commands with{" "}
              <code>npx @devtunnelcli/cli</code>
              .
            </p>
          </details>
          <details>
            <summary>
              <span>Do I need a DevTunnel task to contribute?</span>
              <Ic id="chev" className="fq-ch" />
            </summary>
            <p>
              No.{" "}
              <code>dev start owner/repo#123</code>
              {" "}works on any public GitHub issue, and the work still counts as a DevTunnel contribution.
            </p>
          </details>
          <details>
            <summary>
              <span>Do I need an account to browse?</span>
              <Ic id="chev" className="fq-ch" />
            </summary>
            <p>No. Projects, tasks, tools and issues are public. Sign in with GitHub when you want to start work or use the AI help.</p>
          </details>
          <details>
            <summary>
              <span>Can DevTunnel merge my pull request?</span>
              <Ic id="chev" className="fq-ch" />
            </summary>
            <p>No. DevTunnel can’t merge into any repository. Pull requests are opened with your own GitHub token, and merge authority stays with the repository owner.</p>
          </details>
          <details>
            <summary>
              <span>Is DevTunnel open source?</span>
              <Ic id="chev" className="fq-ch" />
            </summary>
            <p>Yes. DevTunnel is released under the MIT License. You can read the code and submit pull requests on GitHub.</p>
          </details>
          <details>
            <summary>
              <span>What does it cost?</span>
              <Ic id="chev" className="fq-ch" />
            </summary>
            <p>The core platform is free. Paid tasks and premium infrastructure are on the roadmap and are not available yet.</p>
          </details>
          <details>
            <summary>
              <span>Is DevTunnel new?</span>
              <Ic id="chev" className="fq-ch" />
            </summary>
            <p>Yes. It is in Phase 1, building and validating the idea, and the catalog of projects, tasks and tools is still growing.</p>
          </details>
        </div>
      </div>
    </section>
  );
}
