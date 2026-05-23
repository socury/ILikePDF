import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          500: "#3b6cff",
          600: "#2c52d6",
          700: "#1f3ea8",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
