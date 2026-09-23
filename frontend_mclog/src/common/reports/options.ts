import { isLocale, type Locale } from "@/common/i18n/config";
import type { TimeRange } from "@/common/time/range";

/**
 * Opciones de un reporte y las preferencias que se recuerdan entre visitas.
 *
 * Va aparte de collect.ts, que habla con la API, para que la pagina y los
 * tests puedan usarlo sin arrastrar el cliente HTTP.
 */

export type ReportKind = "markdown" | "agent-md" | "agent-json";
export const REPORT_KINDS: ReportKind[] = ["markdown", "agent-md", "agent-json"];

export type ReportSection =
  | "summary"
  | "comparison"
  | "activity"
  | "levels"
  | "applications"
  | "errorGroups"
  | "warnGroups"
  | "recentErrors";
export const REPORT_SECTIONS: ReportSection[] = [
  "summary",
  "comparison",
  "activity",
  "levels",
  "applications",
  "errorGroups",
  "warnGroups",
  "recentErrors",
];
/** Los warnings agrupados abultan y casi siempre son ruido: se piden a proposito. */
export const DEFAULT_SECTIONS: ReportSection[] = REPORT_SECTIONS.filter((section) => section !== "warnGroups");

export type AgentObjective = "triage" | "regression" | "incident" | "custom";
export const AGENT_OBJECTIVES: AgentObjective[] = ["triage", "regression", "incident", "custom"];

export const MAX_GROUPS_OPTIONS = [5, 10, 20, 50] as const;
export const STACK_LINES_OPTIONS = [10, 20, 40] as const;

export type ReportOptions = {
  kind: ReportKind;
  locale: Locale;
  range: TimeRange;
  application?: string;
  environment?: string;
  sections: ReportSection[];
  maxGroups: number;
  includeStacks: boolean;
  stackLines: number;
  redact: boolean;
  objective: AgentObjective;
  instructions: string;
};

/**
 * Lo que se recuerda en el navegador. El rango y el ambito no: viajan en la
 * URL, que es lo que se comparte. Las instrucciones tampoco, porque son de un
 * caso concreto.
 */
export type ReportPrefs = Pick<
  ReportOptions,
  "kind" | "locale" | "sections" | "maxGroups" | "includeStacks" | "stackLines" | "redact" | "objective"
>;

export const PREFS_KEY = "mclog.reports.prefs";

type StoredPrefs = ReportPrefs & { knownSections: ReportSection[] };

export const serializePrefs = (options: ReportOptions): string => {
  const stored: StoredPrefs = {
    kind: options.kind,
    locale: options.locale,
    sections: options.sections,
    maxGroups: options.maxGroups,
    includeStacks: options.includeStacks,
    stackLines: options.stackLines,
    redact: options.redact,
    objective: options.objective,
    knownSections: REPORT_SECTIONS,
  };
  return JSON.stringify(stored);
};

/**
 * Mezcla lo guardado sobre lo que trae la URL. Un `kind` en la URL gana (viene
 * de "Exportar > Brief para IA"), y si es un formato para IA entra siempre
 * enmascarado: ese reporte va camino de un modelo externo.
 */
export const applyPrefs = (base: ReportOptions, prefs: Partial<ReportPrefs>, kindFromUrl: boolean): ReportOptions => {
  const merged = { ...base, ...prefs };
  if (kindFromUrl) {
    merged.kind = base.kind;
    if (base.kind !== "markdown") merged.redact = true;
  }
  return merged;
};

const oneOf = <T>(allowed: readonly T[], value: unknown): value is T => allowed.includes(value as T);

/**
 * Lee lo guardado campo a campo y descarta lo que no sea valido: un valor de
 * una version anterior, o editado a mano, no debe romper la pagina.
 *
 * Una seccion que se anadio despues de guardar entra si esta entre las de por
 * defecto: quien guardo sus preferencias no la rechazo, simplemente no existia.
 */
export const parsePrefs = (raw: string | null): Partial<ReportPrefs> => {
  if (!raw) return {};
  let stored: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    stored = parsed as Record<string, unknown>;
  } catch {
    return {};
  }

  const prefs: Partial<ReportPrefs> = {};
  if (oneOf(REPORT_KINDS, stored.kind)) prefs.kind = stored.kind;
  if (isLocale(stored.locale)) prefs.locale = stored.locale;
  if (oneOf(MAX_GROUPS_OPTIONS, stored.maxGroups)) prefs.maxGroups = stored.maxGroups;
  if (oneOf(STACK_LINES_OPTIONS, stored.stackLines)) prefs.stackLines = stored.stackLines;
  if (typeof stored.includeStacks === "boolean") prefs.includeStacks = stored.includeStacks;
  if (typeof stored.redact === "boolean") prefs.redact = stored.redact;
  if (oneOf(AGENT_OBJECTIVES, stored.objective)) prefs.objective = stored.objective;

  const sections: unknown[] | null = Array.isArray(stored.sections) ? stored.sections : null;
  if (sections) {
    const known: unknown[] = Array.isArray(stored.knownSections) ? stored.knownSections : REPORT_SECTIONS;
    const chosen = REPORT_SECTIONS.filter(
      (section) => sections.includes(section) || (!known.includes(section) && DEFAULT_SECTIONS.includes(section)),
    );
    if (chosen.length) prefs.sections = chosen;
  }
  return prefs;
};
