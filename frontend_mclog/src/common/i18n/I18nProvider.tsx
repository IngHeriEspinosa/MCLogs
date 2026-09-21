"use client";
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { writePreferenceCookie } from "@/common/theme/config";
import { LOCALE_COOKIE, Locale } from "./config";
import { createFormatter, Formatter } from "./format";
import { dictionaries, Dictionary } from "./dictionaries";

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Textos del idioma activo: `t.logs.title`, `t.logs.results("12")`. */
  t: Dictionary;
  /** Numeros y fechas con las convenciones del idioma activo. */
  fmt: Formatter;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writePreferenceCookie(LOCALE_COOKIE, next);
    document.documentElement.lang = next;
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t: dictionaries[locale], fmt: createFormatter(locale) }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside <I18nProvider>");
  return value;
};
