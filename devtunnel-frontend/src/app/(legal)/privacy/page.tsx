import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";
import { buildMetadata } from "@/lib/seo";
import { CONTACT_EMAIL, OPERATOR_NAME } from "@/lib/config";

export const metadata: Metadata = buildMetadata({
  title: "Privacy policy",
  description: "What personal data DevTunnel collects, why, how long it is kept, and how to export or delete it.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro="DevTunnel helps contributors find open-source projects and tasks. This page explains what we collect, why, who sees it and what control you have."
    >
      <h2>Who is responsible</h2>
      <p>
        DevTunnel is operated by {OPERATOR_NAME}, India (&ldquo;we&rdquo;). For anything in this
        policy, write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>From GitHub when you sign in:</strong> your GitHub ID, username, display name,
          email address, avatar and profile URL. We also store your GitHub access token (and refresh
          token, when GitHub issues one), encrypted, so DevTunnel can read GitHub data on your
          behalf with your own rate limit.
        </li>
        <li>
          <strong>What you tell us:</strong> bio, developer roles, experience level, skills,
          technologies, interests and intent from onboarding and settings; community submissions,
          upvotes, contribution feedback and bug reports you send.
        </li>
        <li>
          <strong>What you do in the app:</strong> projects and tools you join, tasks you view,
          start or submit, repositories you star or contribute to, and pull requests you link.
        </li>
        <li>
          <strong>Technical data:</strong> sign-in session records, command-line tokens you create,
          and, for bug reports, the page address and browser user-agent your browser sends. Your IP
          address is used only momentarily to apply rate limits and is not stored in your profile.
        </li>
        <li>
          <strong>Analytics (only if you accept):</strong> Google Analytics 4 page-view and usage
          data. See the <Link href="/cookies">Cookie policy</Link>.
        </li>
      </ul>
      <p>We do not collect payment card details. Sponsorship payments happen on Razorpay&rsquo;s own page.</p>

      <h2>Why we use it (and our legal basis)</h2>
      <ul>
        <li>To create your account, keep you signed in and run the service &mdash; performance of our agreement with you.</li>
        <li>To match projects and tasks to your skills and show your own activity &mdash; performance of our agreement with you.</li>
        <li>To keep the service secure and prevent abuse &mdash; our legitimate interest.</li>
        <li>To measure usage with analytics &mdash; your consent, which you can withdraw at any time.</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>We do not sell personal data. We use these service providers to run DevTunnel:</p>
      <ul>
        <li>GitHub &mdash; sign-in and public repository data.</li>
        <li>Cloudflare &mdash; hosting and delivery of the website and API.</li>
        <li>Supabase &mdash; the database that stores your account and activity.</li>
        <li>AI model providers &mdash; to generate summaries, search interpretation and issue explanations. We send public project and issue text, not your profile or email.</li>
        <li>Google &mdash; analytics, only if you accept.</li>
      </ul>
      <p>
        Some of these providers process data outside India. Your profile name, username, avatar and
        public contribution activity may be visible to other DevTunnel users where the product shows
        contributors.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>While your account is active, we keep your data so the service works.</li>
        <li>
          When you delete your account you are signed out everywhere immediately. For 30 days your
          account stays in a deleted state (signing in with GitHub again during that time restores
          it), then your personal details (name, email, username, bio,
          avatar, GitHub identity and tokens, skills and preferences) are permanently erased or
          anonymised, and your sessions, tokens, stars, memberships, progress, views, feedback and activity history are removed.
          Content that other people rely on, such as a project you created, keeps working but no
          longer shows who you are.
        </li>
        <li>Bug reports are kept without any link to your account once you delete it.</li>
        <li>Routine backups are overwritten on the provider&rsquo;s normal schedule.</li>
      </ul>

      <h2>Your choices and rights</h2>
      <ul>
        <li><strong>Access and portability:</strong> download a copy of your data from Settings &rarr; Download my data (JSON).</li>
        <li><strong>Correction:</strong> edit your profile and skills in Settings.</li>
        <li><strong>Deletion:</strong> delete your account in Settings &rarr; Danger zone.</li>
        <li><strong>Analytics:</strong> change your choice any time with &ldquo;Cookie settings&rdquo; in the footer.</li>
        <li>
          <strong>Revoke GitHub access:</strong> in GitHub &rarr; Settings &rarr; Applications you
          can revoke DevTunnel at any time.
        </li>
        <li>
          Depending on where you live (for example India&rsquo;s DPDP Act or the EU/UK GDPR) you may
          also have the right to object, restrict processing or complain to your data protection
          authority. Email us and we will reply within 30 days.
        </li>
      </ul>

      <h2>Children</h2>
      <p>DevTunnel is not directed at children under 16, and GitHub itself requires users to be at least 13. If you believe a child has an account, contact us and we will delete it.</p>

      <h2>Security</h2>
      <p>GitHub tokens are encrypted at rest, sessions use secure cookies, and database access is restricted to our server. No system is perfectly secure; report a vulnerability to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>

      <h2>Changes</h2>
      <p>If we change this policy in a way that matters we will update the date above and, for significant changes, tell signed-in users.</p>
    </LegalPage>
  );
}
