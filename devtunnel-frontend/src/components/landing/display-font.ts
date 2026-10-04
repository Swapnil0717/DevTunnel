import { Doto } from "next/font/google";

/**
 * Dot-matrix display face for the landing page, the login page and the
 * landing footer. Doto is the open-source stand-in; `landing.css` lists the
 * licensed `BubbledotICG-FinePos` first, so dropping that font in later
 * changes nothing else. Self-hosted by next/font at build time.
 */
export const displayFont = Doto({
  subsets: ["latin"],
  variable: "--font-doto",
  display: "swap",
});
