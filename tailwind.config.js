/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    // The palette is closed: only the tokens from src/styles/tokens.css exist.
    // Dropping Tailwind's default colours makes a stray `bg-gray-800` a build-time
    // error instead of a review comment.
    colors: {
      transparent: "transparent",
      current: "currentColor",
      bg: "var(--bg)",
      surface: "var(--surface)",
      "surface-2": "var(--surface-2)",
      border: "var(--border)",
      text: "var(--text)",
      "text-muted": "var(--text-muted)",
      accent: "var(--accent)",
      "accent-soft": "var(--accent-soft)",
      "accent-lift": "var(--accent-lift)",
      overlay: "var(--overlay)",
      success: "var(--success)",
      danger: "var(--danger)",
    },
    // 4px scale. Half steps exist only for hairline-adjacent spacing.
    spacing: {
      0: "0px",
      px: "1px",
      0.5: "2px",
      1: "4px",
      2: "8px",
      3: "12px",
      4: "16px",
      5: "20px",
      6: "24px",
      7: "28px",
      8: "32px",
      9: "36px",
      10: "40px",
      12: "48px",
      14: "56px",
      16: "64px",
      20: "80px",
      24: "96px",
    },
    borderRadius: {
      none: "0px",
      input: "8px",
      card: "10px",
      full: "9999px",
    },
    extend: {
      fontFamily: {
        // Three roles, three families. Components name the role, never the file.
        display: ['"Bricolage Grotesque"', "system-ui", "-apple-system", "sans-serif"],
        sans: ['"Familjen Grotesk"', "system-ui", "-apple-system", "sans-serif"],
        mono: ['"Geist Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        label: ["12px", "16px"],
        body: ["14px", "20px"],
        // The file name on the source card: display face, one step above body.
        subtitle: ["18px", "24px"],
        title: ["24px", "30px"],
        // The one number that gets the ExtraBold display treatment.
        figure: ["32px", "36px"],
      },
      letterSpacing: {
        title: "-0.02em",
        figure: "-0.03em",
        label: "0.06em",
      },
      maxWidth: {
        content: "620px",
      },
      transitionDuration: {
        hover: "120ms",
        step: "200ms",
        shape: "240ms",
      },
    },
  },
  plugins: [],
};
