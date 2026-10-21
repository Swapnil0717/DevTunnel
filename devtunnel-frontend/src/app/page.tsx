import type { Metadata } from "next";
import { LandingPage } from "@/components/landing-page/landing-page";
import { JsonLd } from "@/components/seo/json-ld";
import { redirectSignedInUser } from "@/lib/auth/redirect-signed-in";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/config";
import { buildMetadata } from "@/lib/seo";
import {
  faqJsonLd,
  organizationJsonLd,
  webApplicationJsonLd,
  websiteJsonLd,
} from "@/lib/structured-data";

// The title already carries the brand, so it is used as-is (no " | DevTunnel"
// suffix from the root template).
export const metadata: Metadata = buildMetadata({
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  path: "/",
  absoluteTitle: true,
});

export default async function HomePage() {
  // Signed-in users never see the landing page: they go to their user home.
  await redirectSignedInUser();

  return (
    <>
      {/* This page owns the site-wide Organization + WebSite structured data
          (rules 15 and 53), plus the WebApplication and FAQPage that describe
          what the homepage itself says — no other component emits them. */}
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={websiteJsonLd()} />
      <JsonLd data={webApplicationJsonLd()} />
      <JsonLd data={faqJsonLd()} />
      <LandingPage />
    </>
  );
}
