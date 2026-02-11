import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Dark theme: Copilot Observability */
        primary: {
          DEFAULT: "#818CF8",
          dark: "#6366F1",
          light: "#A5B4FC",
        },
        secondary: "#A5B4FC",
        cta: {
          DEFAULT: "#34D399",
          dark: "#10B981",
        },
        background: "#0F0F1A",
        surface: "#1A1A2E",
        "surface-elevated": "#232340",
        foreground: "#E2E8F0",
        muted: "#94A3B8",
        border: "rgba(148, 163, 184, 0.12)",
        /* Severity */
        success: "#34D399",
        warning: "#FB923C",
        danger: "#F87171",
      },
      fontFamily: {
        sans: ["var(--font-fira-sans)", "Fira Sans", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-fira-code)", "Fira Code", "monospace"],
        display: ["var(--font-fira-code)", "Fira Code", "system-ui", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.25rem",
        full: "9999px",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(0,0,0,0.3)",
        md: "0 4px 12px rgba(0,0,0,0.4)",
        lg: "0 8px 24px rgba(0,0,0,0.5)",
        xl: "0 16px 48px rgba(0,0,0,0.6)",
        glow: "0 0 20px rgba(129, 140, 248, 0.15)",
        "glow-cta": "0 0 20px rgba(52, 211, 153, 0.2)",
      },
      transitionDuration: {
        DEFAULT: "200ms",
      },
      transitionTimingFunction: {
        DEFAULT: "ease",
      },
    },
  },
  plugins: [],
};
export default config;
