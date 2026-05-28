export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Tokyo Night aesthetic tokens
        editor: {
          bg:        "#1a1b26",
          sidebar:   "#16161e",
          panel:     "#1f2335",
          border:    "#27273a",
          highlight: "#292e42",
          accent:    "#7aa2f7",
          accentHover: "#89ddff",
          text:      "#a9b1d6",
          muted:     "#565f89",
        }
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "monospace"],
      },
      boxShadow: {
        glow: "0 0 10px rgba(122, 162, 247, 0.3)",
        "glow-lg": "0 0 20px rgba(122, 162, 247, 0.4)",
      }
    }
  },
  plugins: []
}