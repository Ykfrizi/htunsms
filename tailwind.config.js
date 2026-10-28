/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        htu: {
          navy: "#07175e",
          red: "#d71920",
          paper: "#f6f7fb",
          ink: "#1d2433",
          muted: "#667085",
        },
      },
    },
  },
  plugins: [],
};
