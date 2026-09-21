/** @type {import('tailwindcss').Config} */
// Paleta de marca de Multicomputos: principal #19607e (primary-600),
// secundario #ebae23 (accent-400).
//
// Los colores semanticos (canvas, surface, ink, line, brand, lvl...) no llevan
// valor fijo: apuntan a variables CSS de src/styles/globals.css, que cambian
// con el tema. Asi un mismo `bg-surface` sirve para claro y oscuro y casi
// ningun componente necesita el prefijo `dark:`.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  // El tema lo fija el atributo data-theme de <html>, no la media query: el
  // usuario puede elegir claro u oscuro aunque su sistema diga otra cosa.
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Pantallas grandes: 1920 (Full HD), 2560 (QHD) y 3200+ (4K sin escalar).
      screens: {
        "3xl": "1920px",
        "4xl": "2560px",
        "5xl": "3200px",
      },
      colors: {
        primary: {
          50: "#e2edf1",
          100: "#cde6f0",
          200: "#a9d9ee",
          300: "#7cc6e5",
          400: "#44adda",
          500: "#2489b3",
          600: "#19607e",
          700: "#134960",
          800: "#0f394b",
          900: "#0b2b38",
        },
        // Secundario de Multicomputos. Sobre blanco solo llega a 1.98:1, asi
        // que el 400 se usa como fondo (con texto oscuro encima) y para texto
        // se recurre al 700. Nunca accent-400 sobre blanco.
        accent: {
          50: "#f5e9ce",
          100: "#f2e1bc",
          200: "#f5d791",
          300: "#f1c460",
          400: "#ebae23",
          500: "#b68411",
          600: "#7c590b",
          700: "#5b4208",
          800: "#443106",
          900: "#382905",
        },
        canvas: token("canvas"),
        surface: {
          DEFAULT: token("surface"),
          2: token("surface-2"),
          3: token("surface-3"),
        },
        line: {
          DEFAULT: token("line"),
          strong: token("line-strong"),
        },
        ink: {
          DEFAULT: token("ink"),
          2: token("ink-2"),
          3: token("ink-3"),
        },
        brand: {
          DEFAULT: token("brand"),
          solid: token("brand-solid"),
          soft: token("brand-soft"),
          ink: token("brand-ink"),
        },
        // Niveles de log. Paleta validada por separado para cada superficie
        // (ver el comentario de globals.css).
        lvl: {
          error: token("lvl-error"),
          warn: token("lvl-warn"),
          info: token("lvl-info"),
          debug: token("lvl-debug"),
        },
        danger: { DEFAULT: token("danger"), soft: token("danger-soft") },
        warning: { DEFAULT: token("warning"), soft: token("warning-soft") },
        success: { DEFAULT: token("success"), soft: token("success-soft") },
        info: { DEFAULT: token("info"), soft: token("info-soft") },
        code: {
          DEFAULT: token("code-bg"),
          ink: token("code-ink"),
        },
        rail: {
          DEFAULT: token("rail"),
          2: token("rail-2"),
          line: token("rail-line"),
          ink: token("rail-ink"),
          "ink-2": token("rail-ink-2"),
        },
      },
      fontFamily: {
        heading: ["var(--font-heading)", "var(--font-body)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },
      boxShadow: {
        card: "var(--shadow-card)",
        pop: "var(--shadow-pop)",
        glow: "0 0 0 4px rgb(var(--brand) / 0.12)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "pop-in": {
          from: { opacity: "0", transform: "translateY(-4px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(24px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "slide-in-left": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        "row-flash": {
          from: { backgroundColor: "rgb(var(--accent) / 0.18)" },
          to: { backgroundColor: "transparent" },
        },
        shimmer: {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
        "live-ring": {
          "0%": { transform: "scale(1)", opacity: "0.6" },
          "100%": { transform: "scale(2.6)", opacity: "0" },
        },
      },
      animation: {
        "fade-in": "fade-in 160ms ease-out",
        "pop-in": "pop-in 140ms cubic-bezier(0.2, 0.9, 0.3, 1)",
        "slide-in-right": "slide-in-right 220ms cubic-bezier(0.2, 0.9, 0.3, 1)",
        "slide-in-left": "slide-in-left 220ms cubic-bezier(0.2, 0.9, 0.3, 1)",
        "row-flash": "row-flash 1.6s ease-out",
        shimmer: "shimmer 1.6s linear infinite",
        "live-ring": "live-ring 1.4s cubic-bezier(0, 0, 0.2, 1) infinite",
      },
    },
  },
  plugins: [],
};
