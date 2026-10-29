/**
 * ESLint del dashboard: las reglas de Next (core-web-vitals) mas las de
 * accesibilidad de jsx-a11y en su perfil recomendado.
 *
 * Los ajustes de abajo admiten patrones que la guia de practicas ARIA (APG)
 * pide y que el perfil recomendado marca por no distinguirlos:
 */
const recommended = require("eslint-plugin-jsx-a11y").configs.recommended.rules;
const [level, interactions] = recommended["jsx-a11y/no-noninteractive-element-interactions"];
const keyboard = ["onKeyDown", "onKeyUp", "onKeyPress"];
const withoutKeyboard = (handlers) => handlers.filter((handler) => !keyboard.includes(handler));

module.exports = {
  extends: ["next/core-web-vitals", "plugin:jsx-a11y/recommended"],
  rules: {
    // Solo se usa en elementos que aparecen tras una accion del usuario (un
    // dialogo, el paso de doble factor, la busqueda de un desplegable) o en
    // paginas de autenticacion con un unico campo: ahi mover el foco es lo
    // que espera el teclado, no una sorpresa.
    "jsx-a11y/no-autofocus": "off",
    // Widgets compuestos (calendario, desplegables, menu lateral): el teclado se
    // atiende en el contenedor y el foco vive en sus hijos. Un manejador de
    // teclado en un contenedor solo se dispara con el foco dentro, asi que no
    // crea una interaccion inaccesible; los de raton se siguen vigilando. El
    // <dialog> cierra ademas con un clic en el fondo, cuyo equivalente de
    // teclado es Esc (evento cancel nativo).
    "jsx-a11y/no-noninteractive-element-interactions": [
      level,
      { ...interactions, handlers: withoutKeyboard(interactions.handlers), dialog: [...interactions.dialog, "onClick"] },
    ],
    // Un bloque de codigo que se desplaza tiene que poder enfocarse para
    // desplazarlo con el teclado (WCAG 2.1.1).
    "jsx-a11y/no-noninteractive-tabindex": [
      "error",
      { ...recommended["jsx-a11y/no-noninteractive-tabindex"][1], tags: ["pre"] },
    ],
  },
};
