import { CONTACT_EMAIL } from "@/lib/config";
import { LANDING_FAQ } from "@/lib/landing-faq";
import { Ic } from "./icon";

/** Turns `backtick` spans in an answer into <code> elements. */
function Answer({ text }: { text: string }) {
  return (
    <p>
      {text.split("`").map((part, i) =>
        i % 2 === 1 ? <code key={i}>{part}</code> : part,
      )}
    </p>
  );
}

/**
 * The FAQ list lives in `lib/landing-faq.ts`, which also feeds the FAQPage
 * structured data on the homepage, so what crawlers read is what visitors see.
 */
export function Faq() {
  return (
    <section className="fq" id="faq" aria-labelledby="fq-h">
      <div className="ps-in fq-in">
        <div className="fq-lead">
          <span className="k">FAQ</span>
          <h2 id="fq-h">Frequently asked questions</h2>
          <p>
            Something missing? Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            .
          </p>
        </div>
        <div className="fq-list">
          {LANDING_FAQ.map((item, index) => (
            <details key={item.question} open={index === 0}>
              <summary>
                <span>{item.question}</span>
                <Ic id="chev" className="fq-ch" />
              </summary>
              <Answer text={item.answer} />
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
