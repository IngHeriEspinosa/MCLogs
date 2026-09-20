import hljs from "highlight.js";

/**
 * Colorea codigo durante el build. El HTML resultante viaja como texto hasta
 * los componentes de cliente, asi que highlight.js nunca llega al navegador.
 */
export function highlightCode(code: string, language: string): string {
  const lang = hljs.getLanguage(language) ? language : "plaintext";
  return hljs.highlight(code.trim(), { language: lang }).value;
}
