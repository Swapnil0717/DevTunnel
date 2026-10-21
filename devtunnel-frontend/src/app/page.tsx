import type { Metadata } from "next";
import { LandingPage } from "@/components/landing-page/landing-page";
import { JsonLd } from "@/components/seo/json-ld";
import { redirectSignedInUser } from "@/lib/auth/redirect-signed-in";
import { SITE_DESCRIPTION } from "@/lib/config";
import { buildMetadata } from "@/lib/seo";
import { organizationJsonLd, websiteJsonLd } from "@/lib/structured-data";

export const metadata: Metadata = buildMetadata({
  title: "DevTunnel — Build open source, together",
  description: SITE_DESCRIPTION,
  path: "/",
});

export default async function HomePage() {
  // Signed-in users never see the landing page: they go to their user home.
  await redirectSignedInUser();

  return (
    <>
      {/* This page owns the site-wide Organization + WebSite structured data
          (rules 15 and 53) — no other component emits them. */}
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={websiteJsonLd()} />
      <LandingPage />
    </>
  );
}
