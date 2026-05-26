export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // VS Code-like dark theme tokens
        editor: {
          bg:        "#1e1e1e",
          sidebar:   "#252526",
          panel:     "#1f1f1f",
          border:    "#3c3c3c",
          highlight: "#2a2d2e",
          accent:    "#0e639c",
          text:      "#cccccc",
          muted:     "#858585",
        }
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "monospace"],
      }
    }
  },
  plugins: []
}