import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { buildMetadata } from "@/lib/seo";
import { CONTACT_EMAIL, SPONSOR_URL } from "@/lib/config";

export const metadata: Metadata = buildMetadata({
  title: "Refund policy",
  description: "How sponsorship payments to DevTunnel work and when they can be refunded.",
  path: "/refunds",
});

export default function RefundsPage() {
  return (
    <LegalPage
      title="Refund policy"
      intro="DevTunnel is free to use. The only payments are voluntary sponsorships."
    >
      <h2>What a sponsorship is</h2>
      <p>
        {SPONSOR_URL ? (
          <>
            Sponsoring happens on an external{" "}
            <a href={SPONSOR_URL} target="_blank" rel="noopener noreferrer">
              Razorpay payment page
            </a>
            .
          </>
        ) : (
          <>Sponsoring happens on an external Razorpay payment page.</>
        )}{" "}
        It is a voluntary contribution towards running costs. It does not buy a product, a
        subscription, features, support or influence, and DevTunnel never sees your card details.
      </p>

      <h2>Refunds</h2>
      <p>Because sponsorships are voluntary, they are generally non-refundable. We will refund in these cases:</p>
      <ul>
        <li>you were charged more than once for the same sponsorship;</li>
        <li>you were charged an amount you did not intend, and you tell us promptly;</li>
        <li>the payment was made without your authorisation.</li>
      </ul>

      <h2>How to ask</h2>
      <p>
        Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> within 7 days with the
        payment ID or receipt from Razorpay and the reason. We reply within 7 days. Approved refunds
        go back to the original payment method and typically take 5&ndash;10 business days to
        appear, depending on your bank.
      </p>
    </LegalPage>
  );
}
