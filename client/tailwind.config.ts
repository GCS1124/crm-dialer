import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "sans-serif"],
        display: ["'Space Grotesk'", "sans-serif"],
      },
      colors: {
        surface: {
          50: "#f8fbff",
          100: "#eef4fb",
          200: "#dbe7f3",
          300: "#b8cee3",
          400: "#86a8cb",
          500: "#5f87b7",
          600: "#466993",
          700: "#355070",
          800: "#24364f",
          900: "#141f31",
        },
        success: "#0f9d6c",
        warning: "#f59e0b",
        danger: "#e45858",
        info: "#3b82f6",
      },
      boxShadow: {
        panel: "0 18px 40px rgba(15, 23, 42, 0.08)",
        soft: "0 8px 24px rgba(15, 23, 42, 0.06)",
      },
      backgroundImage: {
        "grid-fade":
          "linear-gradient(to right, rgba(91, 124, 255, 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(91, 124, 255, 0.08) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};

export default config;
