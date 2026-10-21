import { Doto } from "next/font/google";

/**
 * Dot-matrix face for the landing page headline and the closing call to
 * action. Self-hosted by next/font at build time; the variable is read by
 * `home.css`.
 */
export const homeDisplayFont = Doto({
  subsets: ["latin"],
  variable: "--font-doto",
  display: "swap",
});
