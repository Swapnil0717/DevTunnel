import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { buildMetadata } from "@/lib/seo";
import { CONTACT_EMAIL, GITHUB_REPO_URL, OPERATOR_NAME } from "@/lib/config";

export const metadata: Metadata = buildMetadata({
  title: "Contact",
  description: "How to reach the DevTunnel team for support, privacy requests, security reports and feedback.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <LegalPage title="Contact" intro="The fastest way to reach us is email.">
      <ul>
        <li>
          <strong>General, privacy and refund requests:</strong>{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </li>
        <li>
          <strong>Found a bug?</strong> Use &ldquo;Found a bug&rdquo; in the app header
          {GITHUB_REPO_URL ? (
            <>
              {" "}or{" "}
              <a href={`${GITHUB_REPO_URL}/issues/new/choose`} target="_blank" rel="noopener noreferrer">
                open a GitHub issue
              </a>
            </>
          ) : null}
          .
        </li>
        <li>
          <strong>Security vulnerability:</strong> email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with
          &ldquo;Security&rdquo; in the subject, and please don&rsquo;t post details publicly until it is fixed.
        </li>
      </ul>
      <p>DevTunnel is operated by {OPERATOR_NAME}, India. We aim to reply within 7 days.</p>
    </LegalPage>
  );
}
