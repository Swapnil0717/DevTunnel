import type { Config } from "tailwindcss";

// Color and type tokens are lifted directly from the approved DevTunnel
// login page design so every screen in the auth module stays visually
// consistent with it.
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          0: "#0A0A0A", // page background
          1: "#111111", // card background
          2: "#141414", // inset chip background
          error: "#150E0E", // error card background
        },
        border: {
          DEFAULT: "#232323",
          subtle: "#1E1E1E",
          error: "#3A1F1F",
        },
        ink: {
          primary: "#F2F2F2",
          secondary: "#B5B5B5",
          muted: "#8A8A8A",
          faint: "#6B6B6B",
          disabled: "#5A5A5A",
          quiet: "#4A4A4A",
        },
        status: {
          idle: "#639922",
          loading: "#378ADD",
          error: "#E24B4A",
          errorText: "#E58C8C",
          errorMuted: "#D9A5A5",
          brand: "#1D9E75",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      borderRadius: {
        card: "10px",
        chip: "8px",
      },
    },
  },
  plugins: [],
};

export default config;
