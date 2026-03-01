/** @type {import("tailwindcss").Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas:    "hsl(var(--canvas))",
        surface:   "hsl(var(--surface))",
        elevated:  "hsl(var(--elevated))",
        overlay:   "hsl(var(--overlay))",
        border:    "hsl(var(--border))",
        ring:      "hsl(var(--ring))",
        background:"hsl(var(--background))",
        foreground:"hsl(var(--foreground))",
        muted:      { DEFAULT: "hsl(var(--muted))",     foreground: "hsl(var(--muted-foreground))" },
        accent:     { DEFAULT: "hsl(var(--accent))",    foreground: "hsl(var(--accent-foreground))" },
        primary:    { DEFAULT: "hsl(var(--primary))",   foreground: "hsl(var(--primary-foreground))" },
        secondary:  { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive:{ DEFAULT: "hsl(var(--destructive))",foreground:"hsl(var(--destructive-foreground))" },
        card:       { DEFAULT: "hsl(var(--card))",      foreground: "hsl(var(--card-foreground))" },
        popover:    { DEFAULT: "hsl(var(--popover))",   foreground: "hsl(var(--popover-foreground))" },
        sev: {
          critical: "hsl(var(--sev-critical))",
          high:     "hsl(var(--sev-high))",
          medium:   "hsl(var(--sev-medium))",
          low:      "hsl(var(--sev-low))",
        },
        status: {
          online:      "hsl(var(--status-online))",
          offline:     "hsl(var(--status-offline))",
          warning:     "hsl(var(--status-warning))",
          maintenance: "hsl(var(--status-maintenance))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        "pulse-ring": { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.4" } },
        "ping-slow":  { "0%": { transform: "scale(0.8)", opacity: "0.8" }, "100%": { transform: "scale(2)", opacity: "0" } },
        shimmer:      { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
      },
      animation: {
        "fade-in":   "fade-in 0.2s ease both",
        "pulse-ring":"pulse-ring 2s ease-in-out infinite",
        "ping-slow": "ping-slow 2s ease-out infinite",
        shimmer:     "shimmer 1.5s infinite",
      },
    },
  },
  plugins: [],
};
