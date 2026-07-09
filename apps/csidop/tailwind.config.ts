import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        navy: {
          50: "#eef2f7",
          100: "#d4dce8",
          200: "#a9b9d1",
          300: "#7e96ba",
          400: "#5373a3",
          500: "#2d4a7c",
          600: "#243d66",
          700: "#1b2f4f",
          800: "#152541",
          900: "#0f1b33",
          950: "#091221",
        },
        primary: {
          // Deep navy — ties to the sidebar/login dark theme for everyday
          // buttons and links. The brand red (#ED1F24) is reserved for
          // identity moments (logo, login page) rather than routine
          // actions, since red already carries risk/warning meaning
          // throughout this ops dashboard (overdue, SLA breach, cancel).
          50: "#eef2f7",
          100: "#d4dce8",
          200: "#a9b9d1",
          300: "#7e96ba",
          400: "#5373a3",
          500: "#2d4a7c",
          600: "#243d66",
          700: "#1b2f4f",
          800: "#152541",
          900: "#0f1b33",
        },
        accent: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
        },
        danger: {
          // Rose, not red — keeps destructive actions visually distinct
          // from the brand-red primary color
          50: "#fff1f2",
          100: "#ffe4e6",
          400: "#fb7185",
          500: "#f43f5e",
          600: "#e11d48",
          700: "#be123c",
        },
        success: {
          50: "#f0fdf4",
          100: "#dcfce7",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
        },
      },
    },
  },
  plugins: [],
};

export default config;
