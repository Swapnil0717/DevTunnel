import Link from "next/link";
import { Ic } from "./icon";

export function FinalCta() {
  return (
    <section className="fc" aria-labelledby="fc-h">
      <div className="ps-in">
        <div className="fc-box">
          <h2 id="fc-h">Your first pull request is one command away.</h2>
          <p>
            Sign in with GitHub, pick a task, and run{" "}
            <code>dev start</code>
            .
          </p>
          <div className="fc-act">
            <Link href="/login" className="fc-btn">
              <Ic id="gh" size={19} />
              Sign up with GitHub
            </Link>
            <Link href="/tasks" className="fc-ghost">
              Browse tasks first
              <Ic id="arrow" size={16} />
            </Link>
          </div>
          <span className="fc-note">Free to use · Open source (MIT) · Browsing needs no account</span>
        </div>
      </div>
    </section>
  );
}
