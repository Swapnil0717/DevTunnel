import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";
import { CookieSettingsLink } from "@/components/consent/cookie-settings-link";
import { buildMetadata } from "@/lib/seo";
import { GA_MEASUREMENT_ID } from "@/lib/config";

export const metadata: Metadata = buildMetadata({
  title: "Cookie policy",
  description: "Which cookies DevTunnel sets, what they do, and how to change your analytics choice.",
  path: "/cookies",
});

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookie policy"
      intro="DevTunnel uses a small number of cookies. Essential ones keep you signed in; analytics cookies are optional and off until you accept."
    >
      <h2>Cookies we set</h2>
      <table>
        <thead>
          <tr>
            <th>Cookie</th>
            <th>Purpose</th>
            <th>Type</th>
            <th>Lifetime</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>dt_session</td>
            <td>Keeps you signed in.</td>
            <td>Essential</td>
            <td>Session / up to the sign-in period</td>
          </tr>
          <tr>
            <td>dt_auth</td>
            <td>Lets the site know a session exists so private pages route correctly.</td>
            <td>Essential</td>
            <td>Same as sign-in</td>
          </tr>
          <tr>
            <td>dt_oauth_state, dt_cli_oauth_state</td>
            <td>Protects the GitHub sign-in handshake against forgery.</td>
            <td>Essential</td>
            <td>Minutes</td>
          </tr>
          <tr>
            <td>dt_view_mode</td>
            <td>Remembers whether an admin is in the user or admin view.</td>
            <td>Essential (admins only)</td>
            <td>Session</td>
          </tr>
          <tr>
            <td>dt_consent</td>
            <td>Remembers your cookie choice.</td>
            <td>Essential</td>
            <td>12 months</td>
          </tr>
          <tr>
            <td>_ga, _ga_&lt;ID&gt;</td>
            <td>Google Analytics 4: distinguishes visitors and sessions to count visits and popular pages.</td>
            <td>Analytics (optional)</td>
            <td>Up to 2 years</td>
          </tr>
        </tbody>
      </table>
      <p>Essential cookies do not need consent because the service cannot work without them.</p>

      <h2>Analytics</h2>
      {GA_MEASUREMENT_ID ? (
        <p>
          If you press <strong>Accept analytics</strong>, we load Google Analytics 4 with IP
          anonymisation turned on and send page-view data to Google. If you press{" "}
          <strong>Decline</strong>, or don&rsquo;t answer, nothing is loaded and no request is made
          to Google. Declining never limits what you can do on DevTunnel.
        </p>
      ) : (
        <p>Analytics is currently switched off on this site, so no analytics cookies are set.</p>
      )}

      <h2>Change your choice</h2>
      {GA_MEASUREMENT_ID ? (
        <p>
          <CookieSettingsLink className="bg-transparent p-0 text-[14px] text-accent underline underline-offset-2" />{" "}
          reopens the banner so you can accept or decline at any time (also in the footer). Declining
          after accepting stops analytics and removes the Google Analytics cookies from this site.
          You can also clear cookies in your browser settings.
        </p>
      ) : (
        <p>There is nothing to change while analytics is off.</p>
      )}

      <h2>More</h2>
      <p>See the <Link href="/privacy">Privacy policy</Link> for how personal data is handled.</p>
    </LegalPage>
  );
}
