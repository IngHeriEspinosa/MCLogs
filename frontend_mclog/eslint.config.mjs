/**
 * ESLint del dashboard (configuración flat, ESLint 9): las reglas de Next
 * (core-web-vitals) más las de accesibilidad de jsx-a11y en su perfil
 * recomendado.
 *
 * Los ajustes de abajo admiten patrones que la guía de prácticas ARIA (APG)
 * pide y que el perfil recomendado marca por no distinguirlos.
 */
import nextVitals from "eslint-config-next/core-web-vitals";
import jsxA11y from "eslint-plugin-jsx-a11y";

const recommended = jsxA11y.configs.recommended.rules;
const [level, interactions] = recommended["jsx-a11y/no-noninteractive-element-interactions"];
const keyboard = ["onKeyDown", "onKeyUp", "onKeyPress"];
const withoutKeyboard = (handlers) => handlers.filter((handler) => !keyboard.includes(handler));

const config = [
  // Generados: el service worker de Serwist, el build y los tipos de Next.
  { ignores: [".next/**", "node_modules/**", "public/sw.js", "public/swe-worker-*.js", "next-env.d.ts"] },
  ...nextVitals,
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    rules: {
      ...recommended,
      // Solo se usa en elementos que aparecen tras una acción del usuario (un
      // diálogo, el paso de doble factor, la búsqueda de un desplegable) o en
      // páginas de autenticación con un único campo: ahí mover el foco es lo
      // que espera el teclado, no una sorpresa.
      "jsx-a11y/no-autofocus": "off",
      // Widgets compuestos (calendario, desplegables, menú lateral): el teclado se
      // atiende en el contenedor y el foco vive en sus hijos. Un manejador de
      // teclado en un contenedor solo se dispara con el foco dentro, así que no
      // crea una interacción inaccesible; los de ratón se siguen vigilando. El
      // <dialog> cierra además con un clic en el fondo, cuyo equivalente de
      // teclado es Esc (evento cancel nativo).
      "jsx-a11y/no-noninteractive-element-interactions": [
        level,
        { ...interactions, handlers: withoutKeyboard(interactions.handlers), dialog: [...interactions.dialog, "onClick"] },
      ],
      // Un bloque de código que se desplaza tiene que poder enfocarse para
      // desplazarlo con el teclado (WCAG 2.1.1).
      "jsx-a11y/no-noninteractive-tabindex": [
        "error",
        { ...recommended["jsx-a11y/no-noninteractive-tabindex"][1], tags: ["pre"] },
      ],
      // Reglas nuevas de eslint-plugin-react-hooks 7 (llegaron con Next 16),
      // pensadas para el React Compiler, que este proyecto no usa. Marcan
      // patrones que ya existian (sincronizar estado desde la URL en un efecto,
      // el ultimo valor en un ref): quedan como aviso para no esconderlos,
      // pendientes de una refactorizacion propia en lugar de hacerla a ciegas
      // dentro de una actualizacion de seguridad.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
    },
  },
];

export default config;
