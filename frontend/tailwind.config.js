module.exports = {
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#06131f",
        mist: "#ecf5ff",
        accent: "#ff7a18",
        sea: "#1d4ed8",
        leaf: "#14b8a6",
        danger: "#dc2626"
      },
      fontFamily: {
        sans: ["'IBM Plex Sans'", "ui-sans-serif", "system-ui"]
      },
      boxShadow: {
        panel: "0 24px 80px rgba(6, 19, 31, 0.12)"
      }
    },
  },
  plugins: [],
};
