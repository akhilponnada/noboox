import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Light mode colors
        primary: {
          light: '#ffffff',
          DEFAULT: '#f3f4f6',
          dark: '#e5e7eb',
        },
        secondary: {
          light: '#4b5563',
          DEFAULT: '#374151',
          dark: '#1f2937',
        },
        accent: {
          light: '#818cf8',
          DEFAULT: '#6366f1',
          dark: '#4f46e5',
        },
      },
    },
  },
  plugins: [],
}

export default config;
