import type { Metadata } from "next";
import { AuthProvider } from "@/context/auth-context";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import "./globals.css";

// Centralized SEO defaults (rule 51 — "Keep SEO Logic Centralized").
// Individual pages override `title`/`description`/`alternates.canonical`
// as needed; everything else here applies site-wide.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Build real software with real developers`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "DevTunnel is a software project network where developers discover, join, and contribute to real projects, backed by integrated developer infrastructure.",
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
