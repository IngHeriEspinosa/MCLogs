import client from "@/common/api/client";
import type { Locale } from "@/common/i18n/config";
import { closedWindow, TimeRange } from "@/common/time/range";
import { fillTimeline, sumLevels, TimelineBin } from "@/common/time/timeline";
import type { LogEntry, LogStats } from "@/hooks/useAuth";
import type { ApplicationSummary, ErrorGroup } from "@/hooks/useErrors";

export type ReportKind = "markdown" | "agent-md" | "agent-json";
export const REPORT_KINDS: ReportKind[] = ["markdown", "agent-md", "agent-json"];

export type ReportSection = "summary" | "activity" | "levels" | "applications" | "errorGroups" | "recentErrors";
export const REPORT_SECTIONS: ReportSection[] = ["summary", "activity", "levels", "applications", "errorGroups", "recentErrors"];

export type AgentObjective = "triage" | "regression" | "incident" | "custom";
export const AGENT_OBJECTIVES: AgentObjective[] = ["triage", "regression", "incident", "custom"];

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

export type ReportData = {
  generatedAt: string;
  from: string;
  to: string;
  origin: string;
  hours: TimelineBin[];
  totals: { total: number; error: number; warn: number; info: number; debug: number };
  /** Todos los grupos devueltos (hasta 100): sirven para contar fallos distintos. */
  groups: ErrorGroup[];
  groupsCapped: boolean;
  /** Ejemplo mas reciente de cada fallo incluido, por huella, para su stack. */
  samples: Record<string, LogEntry>;
  recentErrors: LogEntry[];
  applications: ApplicationSummary[];
};

const GROUPS_LIMIT = 100;
const RECENT_ERRORS = 20;
/** Tope de peticiones de ejemplos: cada fallo con stack cuesta una llamada. */
const MAX_SAMPLES = 10;

const clean = (params: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== ""));

/**
 * Reune en paralelo todo lo que necesita un reporte. Solo pide lo que usan las
 * secciones elegidas, y los ejemplos con stack van despues porque dependen de
 * que grupos salgan.
 */
export const collectReportData = async (options: ReportOptions, now = Date.now()): Promise<ReportData> => {
  const { from, to } = closedWindow(options.range, now);
  const span = { from: from.toISOString(), to: to.toISOString() };
  const scope = { application: options.application, environment: options.environment };
  const wants = (section: ReportSection) => options.sections.includes(section);
  const needsGroups = wants("errorGroups") || wants("summary");

  const [stats, groups, recentErrors, applications] = await Promise.all([
    client.get<LogStats>("/api/logs/stats", { params: clean({ ...span, ...scope }) }).then((response) => response.data),
    needsGroups
      ? client
          .get<{ data: ErrorGroup[] }>("/api/logs/errors/groups", {
              params: clean({ ...span, ...scope, level: "error", limit: GROUPS_LIMIT }),
            })
          .then((response) => response.data.data)
      : Promise.resolve([] as ErrorGroup[]),
    wants("recentErrors")
      ? client
          .get<{ data: LogEntry[] }>("/api/logs", {
              params: clean({ ...span, ...scope, level: "error", pageSize: RECENT_ERRORS, sort: "timestamp:desc" }),
            })
          .then((response) => response.data.data)
      : Promise.resolve([] as LogEntry[]),
    wants("applications")
      ? client.get<{ data: ApplicationSummary[] }>("/api/logs/applications").then((response) => response.data.data)
      : Promise.resolve([] as ApplicationSummary[]),
  ]);

  const samples: Record<string, LogEntry> = {};
  if (options.includeStacks && wants("errorGroups")) {
    const picked = groups.slice(0, Math.min(options.maxGroups, MAX_SAMPLES));
    const fetched = await Promise.all(
      picked.map((group) =>
        client
          .get<LogEntry>(`/api/logs/${group.lastLogId}`)
          .then((response) => response.data)
          // Un ejemplo que ya no existe (purgado) no debe tumbar el reporte.
          .catch(() => null),
      ),
    );
    picked.forEach((group, index) => {
      const sample = fetched[index];
      if (sample) samples[group.fingerprint] = sample;
    });
  }

  // El filtro de aplicacion del backend es "contiene", no igualdad: aqui igual.
  const needle = options.application?.toLowerCase();
  const scopedApps = needle ? applications.filter((app) => app.application.toLowerCase().includes(needle)) : applications;
  const scopedByEnv = options.environment
    ? scopedApps.filter((app) => app.environments.includes(options.environment as string))
    : scopedApps;

  const hours = fillTimeline(stats.timeline ?? [], stats.from, stats.to);

  return {
    generatedAt: new Date(now).toISOString(),
    from: stats.from,
    to: stats.to,
    origin: globalThis.location?.origin ?? "",
    hours,
    totals: sumLevels(hours),
    groups,
    groupsCapped: groups.length >= GROUPS_LIMIT,
    samples,
    recentErrors,
    applications: scopedByEnv,
  };
};
