/**
 * Imprime contenido propio en un iframe oculto, sin tocar la pagina.
 *
 * Es la via para exportar a PDF sin dependencias: el motor de impresion del
 * navegador compone el documento (texto seleccionable, cualquier alfabeto,
 * enlaces activos) y su dialogo ofrece "Guardar como PDF". Una libreria de PDF
 * en el navegador pesaria cientos de KB y sus fuentes no cubren todo lo que
 * puede traer un mensaje de log.
 *
 * El iframe copia las hojas de estilo y las fuentes de la pagina, pero va
 * siempre en tema claro: el papel es blanco.
 */

export type PrintFrameOptions = {
  /** Titulo del documento: el navegador lo propone como nombre del PDF. */
  title: string;
  lang: string;
  /** Texto del pie de cada pagina, a la izquierda del numero de pagina. */
  footer: string;
  /** Pinta el contenido en `container` y devuelve como desmontarlo. */
  render: (container: HTMLElement) => () => void;
};

/** Cadena CSS entre comillas, para `content:`. En CSS una cadena no admite saltos de linea. */
export const cssString = (value: string): string => `"${value.replace(/[\\"]/g, "\\$&").replace(/[\r\n]+/g, " ")}"`;

/** Copia las hojas de estilo y espera a que carguen: imprimir antes saldria sin estilos. */
const copyStyles = (from: Document, to: Document) =>
  Promise.all(
    Array.from(from.querySelectorAll('link[rel="stylesheet"], style'), (node) => {
      const clone = to.importNode(node, true);
      to.head.appendChild(clone);
      // Un <link> copiado vuelve a cargar (de la cache); un <style> ya esta listo.
      if (clone.nodeName !== "LINK") return Promise.resolve();
      return new Promise<void>((resolve) => {
        clone.addEventListener("load", () => resolve(), { once: true });
        clone.addEventListener("error", () => resolve(), { once: true });
      });
    }),
  );

/** Limpieza del iframe en curso. Un dialogo que no avisa al cerrarse se limpia en la siguiente impresion. */
let active: (() => void) | null = null;

export const printInFrame = async ({ title, lang, footer, render }: PrintFrameOptions): Promise<void> => {
  active?.();

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.className = "pointer-events-none fixed -left-2.5 -top-2.5 h-0 w-0 border-0";
  // Sin `src`: el about:blank inicial queda disponible al momento y no se sustituye despues.
  document.body.appendChild(frame);
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!win || !doc) {
    frame.remove();
    throw new Error("Print frame unavailable");
  }

  // Segun el navegador, el nombre que propone para el PDF sale del titulo del
  // iframe o del de la pagina: se ponen los dos y el de la pagina se restaura.
  const previousTitle = document.title;
  let unmount: (() => void) | null = null;
  const cleanup = () => {
    if (active !== cleanup) return;
    active = null;
    unmount?.();
    frame.remove();
    document.title = previousTitle;
  };
  active = cleanup;

  try {
    const root = doc.documentElement;
    root.lang = lang;
    // Las fuentes de next/font cuelgan de las variables que declaran estas clases.
    root.className = document.documentElement.className;
    root.dataset.theme = "light";
    doc.body.className = "bg-white";
    doc.title = title;
    await copyStyles(document, doc);

    const page = doc.createElement("style");
    page.textContent = `@page report { @bottom-left { content: ${cssString(footer)}; } }`;
    doc.head.appendChild(page);

    const container = doc.createElement("div");
    doc.body.appendChild(container);
    unmount = render(container);
    // Leer una medida fuerza el calculo de estilos, que es lo que pide las fuentes.
    void doc.body.offsetHeight;
    await doc.fonts.ready;

    win.addEventListener("afterprint", cleanup, { once: true });
    document.title = title;
    win.focus();
    win.print();
  } catch (error) {
    cleanup();
    throw error;
  }
};
