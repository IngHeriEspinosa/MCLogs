export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "es";

/**
 * El idioma viaja en una cookie y no solo en localStorage: el servidor la lee
 * al renderizar, asi la primera pintura ya sale en el idioma correcto y React
 * no tiene que corregir el HTML al hidratar.
 */
export const LOCALE_COOKIE = "mclog_locale";

/** Etiqueta BCP 47 que se pasa a Intl para fechas y numeros. */
export const INTL_LOCALE: Record<Locale, string> = {
  es: "es-ES",
  en: "en-US",
};

export const isLocale = (value: unknown): value is Locale => value === "es" || value === "en";

/** Primer idioma soportado de una cabecera Accept-Language, respetando su peso `q`. */
export const localeFromAcceptLanguage = (header: string | null | undefined): Locale => {
  if (!header) return DEFAULT_LOCALE;

  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, weight] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: weight ? Number(weight) || 0 : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
};
