import { OPERATOR_NAME, PROJECT_GITHUB_URL } from "@/lib/config";
import { Ic } from "./icon";

/**
 * Optional note from the maker, in their own words (two or three sentences).
 * Leave it `null` to hide the card; the "Available today / Planned" board
 * then takes the full width.
 */
const MAKER_NOTE: string | null = null;

export function BuiltInOpen() {
  return (
    <section className="bo" id="open" aria-labelledby="bo-h">
      <div className="ps-in">
        <div className="ps-head">
          <span className="k">New and built in the open</span>
          <h2 id="bo-h">DevTunnel is new. Here is what exists today and what doesn’t yet.</h2>
          <p>The core platform is free. Anything marked planned is not available.</p>
        </div>
        <div className={`bo-grid${MAKER_NOTE ? "" : " solo"}`}>
                {MAKER_NOTE ? (
            <figure className="bo-note">
              <span className="k">From the maker</span>
              <div className="bo-ph-box real">
                <p>{MAKER_NOTE}</p>
              </div>
              <figcaption>
                <span className="bo-av">
                  <Ic id="user" />
                </span>
                <span>
                  <b>{OPERATOR_NAME}</b>
                  <i>Operates DevTunnel</i>
                </span>
              </figcaption>
            </figure>
          ) : null}
          <div className="bo-board">
            <div className="bo-col">
              <span className="k bo-h1">Available today</span>
              <ul>
                <li>
                  <Ic id="check2" className="bo-ck" />
                  <span>Curated projects, tasks and open source tools, filterable by stack, role and level</span>
                </li>
                <li>
                  <Ic id="check2" className="bo-ck" />
                  <span>Live GitHub catalogs and community submissions</span>
                </li>
                <li>
                  <Ic id="check2" className="bo-ck" />
                  <span>The dev CLI: login, start, test and submit</span>
                </li>
                <li>
                  <Ic id="check2" className="bo-ck" />
                  <span>Contributor profiles with a calendar, stats and milestones</span>
                </li>
                <li>
                  <Ic id="check2" className="bo-ck" />
                  <span>AI search, summaries and issue explanations, labeled AI-generated</span>
                </li>
              </ul>
            </div>
            <div className="bo-col">
              <span className="k">Planned, not available yet</span>
              <ul className="bo-pl">
                <li>
                  <span className="bo-o" aria-hidden="true"></span>
                  <span>Premium infrastructure</span>
                </li>
                <li>
                  <span className="bo-o" aria-hidden="true"></span>
                  <span>Paid tasks and bounties</span>
                </li>
                <li>
                  <span className="bo-o" aria-hidden="true"></span>
                  <span>Team plans and private projects</span>
                </li>
                <li>
                  <span className="bo-o" aria-hidden="true"></span>
                  <span>Validation projects for companies</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <ol className="bo-track" aria-label="Roadmap phases">
          <li className="bo-ph cur">
            <span className="k">Phase 1</span>
            <h4>Build and validate</h4>
            <p>Confirm that contributors want to find real work and ship pull requests.</p>
            <span className="bo-st">Current</span>
          </li>
          <li className="bo-ph">
            <span className="k">Late Phase 1</span>
            <h4>First revenue</h4>
            <span className="bo-st">Planned</span>
          </li>
          <li className="bo-ph">
            <span className="k">Phase 2</span>
            <h4>Project economy</h4>
            <span className="bo-st">Planned</span>
          </li>
          <li className="bo-ph">
            <span className="k">Phase 3</span>
            <h4>Teams and startups</h4>
            <span className="bo-st">Planned</span>
          </li>
          <li className="bo-ph">
            <span className="k">Phase 4</span>
            <h4>Company validation</h4>
            <span className="bo-st">Planned</span>
          </li>
        </ol>
        <div className="bo-links">
          <a href={`${PROJECT_GITHUB_URL}/blob/main/ROADMAP.md`} target="_blank" rel="noopener noreferrer" className="bo-l">
            Read the roadmap
            <Ic id="arrow" size={15} />
          </a>
          <a href={`${PROJECT_GITHUB_URL}/blob/main/CHANGELOG.md`} target="_blank" rel="noopener noreferrer" className="bo-l">
            Changelog
            <Ic id="arrow" size={15} />
          </a>
          <a href={`${PROJECT_GITHUB_URL}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noopener noreferrer" className="bo-l">
            Contributing guide
            <Ic id="arrow" size={15} />
          </a>
        </div>
      </div>
    </section>
  );
}
