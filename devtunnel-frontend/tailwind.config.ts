import type { Config } from "tailwindcss";

// Design tokens are lifted directly from the reference login page design
// (1_devtunnel_login_page.html) so every screen in the app shares the same
// palette instead of each page inventing its own colors.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#0A0A0A",
        surface: "#111111",
        "surface-raised": "#141414",
        border: {
          DEFAULT: "#232323",
          subtle: "#1E1E1E",
        },
        text: {
          DEFAULT: "#F2F2F2",
          muted: "#8A8A8A",
          dim: "#6B6B6B",
          faint: "#5A5A5A",
          disabled: "#4A4A4A",
        },
        accent: {
          DEFAULT: "#1D9E75",
          foreground: "#0A0A0A",
        },
        status: {
          idle: "#639922",
          info: "#378ADD",
          error: "#E24B4A",
          "error-bg": "#150E0E",
          "error-border": "#3A1F1F",
          "error-text": "#D9A5A5",
          "error-label": "#E58C8C",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        xl: "12px",
      },
    },
  },
  plugins: [],
};

export default config;
