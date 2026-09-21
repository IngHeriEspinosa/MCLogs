/**
 * Copia texto al portapapeles.
 *
 * La API moderna solo existe en contextos seguros (HTTPS o localhost). Una
 * consola autoalojada a veces se abre por http dentro de la red local, asi que
 * se cae al viejo execCommand en lugar de fallar en silencio.
 */
export const copyText = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permiso denegado: se intenta el metodo antiguo.
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
};
