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
          secondary: "#D9D9D9",
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
          "idle-bg": "#151A0C",
          "idle-text": "#A3C468",
          info: "#378ADD",
          "info-bg": "#141B2E",
          "info-text": "#85B7EB",
          error: "#E24B4A",
          "error-bg": "#150E0E",
          "error-border": "#3A1F1F",
          "error-text": "#D9A5A5",
          "error-label": "#E58C8C",
          // Success state for the OAuth callback screen
          // (2_devtunnel_auth_callback_states.html).
          success: "#1D9E75",
          "success-bg": "#0E1512",
          "success-border": "#1E2E28",
          "success-text": "#7A9C90",
          "success-label": "#5DCAA5",
        },
        // Selected-option surface for onboarding radio-cards (developer
        // role / experience level / contributor intent) — kept as its own
        // token rather than reusing `accent` directly so selected text
        // stays legible against the tinted background.
        "surface-selected": "#111C16",
        // Chip colors for the onboarding profile step's multi-value
        // inputs (skills / technologies / interests) — lifted from
        // 3_devtunnel_onboarding.html, same convention as the `status`
        // and `border`/`text` nested tokens above.
        "tag-skill": { bg: "#1A1526", border: "#3C3489", text: "#AFA9EC" },
        "tag-tech": { bg: "#151F17", border: "#27500A", text: "#97C459" },
        "tag-interest": { bg: "#1E1418", border: "#72243E", text: "#ED93B1" },
        // Fallback avatar circle for a user with no `avatarUrl` — lifted
        // from 5_devtunnel_profile_page.html, same "lift, don't invent"
        // convention as the tokens above.
        "avatar-placeholder": {
          bg: "#1D2233",
          border: "#2A3352",
          icon: "#5B7FD6",
        },
        // Contribution-calendar intensity scale (profile page). No
        // reference design exists for this yet, so these five steps are
        // derived directly from the existing `accent` green (#1D9E75) at
        // increasing lightness — GitHub's own convention — rather than
        // an unrelated invented palette.
        contrib: {
          0: "#141414", // same as surface-raised: no contributions that day
          1: "#0E2F23",
          2: "#155940",
          3: "#1B8963",
          4: "#1D9E75", // = accent, the highest-intensity day
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