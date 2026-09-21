/**
 * Misma paleta y tipografias que el dashboard (frontend_mclog/tailwind.config.js)
 * para que el sitio publico y la aplicacion se vean como un mismo producto.
 */
/** @type {import('tailwindcss').Config} */
// Paleta de marca de Multicomputos: principal #19607e (primary-600),
// secundario #ebae23 (accent-400).
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
    "./src/lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#e2edf1',
          100: '#cde6f0',
          200: '#a9d9ee',
          300: '#7cc6e5',
          400: '#44adda',
          500: '#2489b3',
          600: '#19607e',
          700: '#134960',
          800: '#0f394b',
          900: '#0b2b38',
        },
        // Secundario de Multicomputos. Sobre blanco solo llega a 1.98:1, asi
        // que el 400 se usa como fondo (con texto oscuro encima) y para texto
        // se recurre al 700. Nunca accent-400 sobre blanco.
        accent: {
          50: '#f5e9ce',
          100: '#f2e1bc',
          200: '#f5d791',
          300: '#f1c460',
          400: '#ebae23',
          500: '#b68411',
          600: '#7c590b',
          700: '#5b4208',
          800: '#443106',
          900: '#382905',
        },
      },
      fontFamily: {
        heading: ['var(--font-jakarta)', 'Inter', 'sans-serif'],
        body: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
