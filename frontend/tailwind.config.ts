import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        tn: {
          red: "var(--tn-red)",
          "red-soft": "var(--tn-red-soft)",
          ink: "var(--tn-ink)",
          muted: "var(--tn-muted)",
          surface: "var(--tn-surface)",
          panel: "var(--tn-panel)",
          border: "var(--tn-border)",
          accent: "var(--tn-accent)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        tn: "0 8px 30px rgba(180, 20, 30, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
