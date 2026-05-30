import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink:      "var(--color-ink)",
        midnight: "var(--color-midnight)",
        ocean:    "#4DA2FF",
        sui:      "#4DA2FF",
        mint:     "#5eead4",
        steel:    "var(--color-steel)",
        pearl:    "var(--color-pearl)",
        amber:    "#fbbf24"
      },
      boxShadow: {
        glow: "0 18px 60px rgba(77, 162, 255, 0.24)",
        panel: "0 24px 80px rgba(77, 162, 255, 0.12)"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
