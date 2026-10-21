import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AuthProvider } from "@/lib/auth/auth-provider";
import { ConsentManager } from "@/components/consent/consent-manager";
import { OPERATOR_NAME, SITE_DESCRIPTION, SITE_KEYWORDS, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/config";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

// `viewportFit: "cover"` is what makes `env(safe-area-inset-*)` return real
// values on notched iPhones; without it the bottom nav, dialogs and cookie
// banner (which all pad with those insets) sit under the home indicator.
// Zoom is deliberately left enabled (accessibility).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

// Link-preview image (WhatsApp, Slack, Discord, LinkedIn, X, ...). The file
// lives in `public/og-image.jpg` (1200x630). `metadataBase` below turns the
// relative path into an absolute URL, which link-preview crawlers require.
const OG_IMAGE = {
  url: "/og-image.jpg",
  width: 1200,
  height: 630,
  alt: "DevTunnel — Pick an issue. Ship the pull request.",
};

// Search-engine ownership tags. Set these in the Cloudflare build environment
// (they are public values) and the tags appear on the next deploy; unset means
// no tag is rendered.
const GOOGLE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
const BING_VERIFICATION = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION?.trim();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: SITE_KEYWORDS,
  authors: [{ name: OPERATOR_NAME, url: SITE_URL }],
  creator: OPERATOR_NAME,
  publisher: SITE_NAME,
  category: "technology",
  // Phone numbers and street addresses in page text are not links; stop mobile
  // browsers from turning version numbers and issue ids into tap-to-call links.
  formatDetection: { telephone: false, email: false, address: false },
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
    url: "/",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
  // Allow full-size image previews and long snippets in results.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: {
    ...(GOOGLE_VERIFICATION ? { google: GOOGLE_VERIFICATION } : {}),
    ...(BING_VERIFICATION ? { other: { "msvalidate.01": BING_VERIFICATION } } : {}),
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        {/* Mounted once for the whole app so any page can read sign-in
            state (devtunnel_workflow.txt task: "Create authentication
            state" / "Create user profile state"). Route-level protection
            still happens server-side — see (protected)/layout.tsx; the
            (public)/layout.tsx group deliberately doesn't redirect. */}
        <AuthProvider>{children}</AuthProvider>
        {/* Cookie banner + consent-gated Google Analytics; renders nothing
            until NEXT_PUBLIC_GA_MEASUREMENT_ID is set. */}
        <ConsentManager />
        {/* The train footer is deliberately NOT mounted here any more: a
            root-level footer sits under the whole page, sidebar included,
            which is what used to shove the sidebar up the screen at the
            bottom of a page. It now lives inside each page's content
            column — see components/layout/app-shell.tsx, the admin
            layout, and train-footer.tsx. */}
      </body>
    </html>
  );
}
