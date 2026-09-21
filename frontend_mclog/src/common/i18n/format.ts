import { INTL_LOCALE, Locale } from "./config";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const toDate = (value: string | number | Date) => (value instanceof Date ? value : new Date(value));

/**
 * Formateadores de numeros y fechas para un idioma.
 *
 * Los Intl.* se crean una sola vez por idioma: construirlos en cada celda de
 * una tabla de cien filas se nota.
 */
export const createFormatter = (locale: Locale) => {
  const tag = INTL_LOCALE[locale];

  const integer = new Intl.NumberFormat(tag, { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat(tag, { maximumFractionDigits: 2 });
  const compact = new Intl.NumberFormat(tag, { notation: "compact", maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(tag, { style: "percent", maximumFractionDigits: 1 });
  const percentFine = new Intl.NumberFormat(tag, { style: "percent", maximumFractionDigits: 2 });

  const dateTime = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "medium" });
  const dateTimeShort = new Intl.DateTimeFormat(tag, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const date = new Intl.DateTimeFormat(tag, { dateStyle: "medium" });
  const dayMonth = new Intl.DateTimeFormat(tag, { day: "numeric", month: "short" });
  const time = new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit", hour12: false });
  const timeSeconds = new Intl.DateTimeFormat(tag, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false,
  });
  const monthYear = new Intl.DateTimeFormat(tag, { month: "long", year: "numeric" });
  const weekdayNarrow = new Intl.DateTimeFormat(tag, { weekday: "narrow" });
  const weekdayLong = new Intl.DateTimeFormat(tag, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const relative = new Intl.RelativeTimeFormat(tag, { numeric: "auto", style: "short" });

  return {
    locale,
    tag,
    number: (value: number) => integer.format(value),
    decimal: (value: number) => decimal.format(value),
    /** 1.284 · 12,9 mil · 4,2 M. Por debajo de 10 000 se escribe entero. */
    compact: (value: number) => (Math.abs(value) < 10_000 ? integer.format(value) : compact.format(value)),
    /** Proporcion 0-1. Una tasa muy baja pero no nula no se redondea a 0 %. */
    percent: (ratio: number) => {
      if (!Number.isFinite(ratio)) return "—";
      if (ratio > 0 && ratio < 0.001) return `<${percentFine.format(0.001)}`;
      return (ratio < 0.1 ? percentFine : percent).format(ratio);
    },
    dateTime: (value: string | number | Date) => dateTime.format(toDate(value)),
    dateTimeShort: (value: string | number | Date) => dateTimeShort.format(toDate(value)),
    date: (value: string | number | Date) => date.format(toDate(value)),
    dayMonth: (value: string | number | Date) => dayMonth.format(toDate(value)),
    time: (value: string | number | Date) => time.format(toDate(value)),
    /** 14:03:22,123 — la precision que pide una consola de logs. */
    timeSeconds: (value: string | number | Date) => timeSeconds.format(toDate(value)),
    monthYear: (value: Date) => monthYear.format(value),
    weekdayNarrow: (value: Date) => weekdayNarrow.format(value),
    weekdayLong: (value: Date) => weekdayLong.format(value),
    /** "hace 4 min", "ayer": dice mas que una marca absoluta al hacer triaje. */
    relative: (value: string | number | Date, now = Date.now()) => {
      const diff = toDate(value).getTime() - now;
      const abs = Math.abs(diff);
      if (abs < 45 * SECOND) return relative.format(Math.round(diff / SECOND), "second");
      if (abs < 45 * MINUTE) return relative.format(Math.round(diff / MINUTE), "minute");
      if (abs < 22 * HOUR) return relative.format(Math.round(diff / HOUR), "hour");
      if (abs < 26 * DAY) return relative.format(Math.round(diff / DAY), "day");
      return date.format(toDate(value));
    },
    /** Duracion legible: 840 ms · 12,4 s · 3 min 12 s · 2 h 5 min. */
    duration: (ms: number) => {
      if (ms < SECOND) return `${integer.format(Math.round(ms))} ms`;
      if (ms < MINUTE) return `${decimal.format(ms / SECOND)} s`;
      if (ms < HOUR) {
        const minutes = Math.floor(ms / MINUTE);
        const seconds = Math.round((ms % MINUTE) / SECOND);
        return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
      }
      if (ms < DAY) {
        const hours = Math.floor(ms / HOUR);
        const minutes = Math.round((ms % HOUR) / MINUTE);
        return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
      }
      const days = Math.floor(ms / DAY);
      const hours = Math.round((ms % DAY) / HOUR);
      return hours ? `${days} d ${hours} h` : `${days} d`;
    },
    bytes: (size: number) => {
      if (size < 1024) return `${integer.format(size)} B`;
      if (size < 1024 * 1024) return `${decimal.format(size / 1024)} KB`;
      return `${decimal.format(size / (1024 * 1024))} MB`;
    },
  };
};

export type Formatter = ReturnType<typeof createFormatter>;
