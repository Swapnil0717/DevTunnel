import { Doto, Space_Grotesk } from "next/font/google";

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

/**
 * Face for the landing/login page's descriptive text (hero paragraph,
 * section intros, card and FAQ copy). Space Grotesk's slightly technical
 * letterforms sit better beside the dot-matrix headline than plain Inter.
 * Buttons, nav, labels and code keep Inter / JetBrains Mono. Only the two
 * weights used are loaded.
 */
export const subFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-sub",
  display: "swap",
});
