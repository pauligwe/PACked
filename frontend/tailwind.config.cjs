/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        linear: {
          bg: "#0F0F0F",
          surface: "#141414",
          elevated: "#1A1A1A",
          border: "#1F1F1F",
          "border-alt": "#2A2A2A",
          "text-primary": "#F5F5F5",
          "text-secondary": "#737373",
          "text-tertiary": "#525252",
          "text-muted": "#404040",
          accent: "#10b981",
        },
      },
      boxShadow: {
        linear: "0 1px 2px rgba(0,0,0,0.4)",
      },
    },
  },
  plugins: []
};

