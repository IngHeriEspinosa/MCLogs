import { Level } from "@/components/atoms/LevelBadge";
import type { Locale } from "@/common/i18n/config";
import { dictionaries, Dictionary } from "@/common/i18n/dictionaries";
import { createFormatter, Formatter } from "@/common/i18n/format";
import { binTimeline, HOUR_MS, peakBin, TimelineBin } from "@/common/time/timeline";
import type { LogEntry } from "@/hooks/useAuth";
import type { ErrorGroup } from "@/hooks/useErrors";
import type { ReportData, ReportOptions, ReportSection } from "./collect";
import { clip, mdCode, mdFence, mdQuote, mdTable, stackHead, textBar, toCsv, utcMinute, yamlScalar } from "./markdown";
import { redactText, redactValue } from "./redact";

/**
 * Generadores de reportes.
 *
 * Hay dos publicos distintos y cada uno recibe lo que le sirve:
 *
 * - Personas: Markdown con resumen, hallazgos en prosa y tablas legibles.
 * - Agentes de IA: instrucciones explicitas (rol, objetivo, pasos, reglas,
 *   formato de respuesta), herramientas MCP para seguir investigando y los
 *   datos en bloques con esquema estable (YAML, CSV, JSON) dentro de
 *   <mclog_data>. Ese delimitador separa lo que es instruccion del operador
 *   de lo que es contenido de logs: un log que diga "ignora lo anterior" es
 *   un dato, y las reglas se lo dicen al agente de forma explicita.
 *
 * Todo sale de datos ya descargados: generar no hace ninguna peticion.
 */

const LEVELS: Level[] = ["error", "warn", "info", "debug"];

export type BuiltReport = { content: string; filename: string; mime: string };

/** 2026-09-21T14:53 -> 20260921-1453, para nombres de fichero ordenables. */
const fileStamp = (iso: string) => iso.slice(0, 16).replace(/[-:]/g, "").replace("T", "-");

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

type Context = {
  data: ReportData;
  options: ReportOptions;
  t: Dictionary;
  d: Dictionary["reportDoc"];
  fmt: Formatter;
  /** Texto libre, enmascarado si el reporte lo pide. */
  r: (text: string) => string;
  wants: (section: ReportSection) => boolean;
  included: ErrorGroup[];
  groupTotal: number;
  peak: TimelineBin | null;
  errorRate: number;
  windowHours: number;
};

const context = (data: ReportData, options: ReportOptions): Context => {
  const t = dictionaries[options.locale];
  return {
    data,
    options,
    t,
    d: t.reportDoc,
    fmt: createFormatter(options.locale),
    r: options.redact ? redactText : (text) => text,
    wants: (section) => options.sections.includes(section),
    included: data.groups.slice(0, options.maxGroups),
    groupTotal: data.groups.reduce((sum, group) => sum + group.count, 0),
    peak: peakBin(data.hours),
    errorRate: data.totals.total ? data.totals.error / data.totals.total : 0,
    windowHours: Math.max(1, Math.round((Date.parse(data.to) - Date.parse(data.from)) / HOUR_MS)),
  };
};

const topAppsByErrors = (groups: ErrorGroup[]) => {
  const byApp = new Map<string, number>();
  groups.forEach((group) => byApp.set(group.application, (byApp.get(group.application) ?? 0) + group.count));
  return [...byApp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
};

const findings = (ctx: Context): string[] => {
  const { data, d, fmt, peak, errorRate } = ctx;
  if (data.totals.total === 0) return [d.findings.noData];

  const list: string[] = [];
  list.push(
    data.totals.error === 0
      ? d.findings.noErrors
      : d.findings.errorRate(fmt.percent(errorRate), fmt.number(data.totals.error), fmt.number(data.totals.total)),
  );
  if (data.totals.warn > 0) list.push(d.findings.warnings(fmt.number(data.totals.warn)));
  if (peak) list.push(d.findings.peak(utcMinute(peak.start), fmt.number(peak.total)));

  const top = data.groups[0];
  if (top && ctx.groupTotal > 0) {
    list.push(
      d.findings.topGroup(
        oneLine(top.errorName ?? d.noClass),
        top.application,
        fmt.number(top.count),
        fmt.percent(top.count / ctx.groupTotal),
      ),
    );
  }
  const apps = topAppsByErrors(data.groups);
  if (apps.length > 1) {
    list.push(d.findings.appsWithErrors(apps.map(([app, count]) => `${mdCode(app)} (${fmt.number(count)})`).join(", ")));
  }
  return list;
};

const scopeLabel = (ctx: Context) =>
  `${ctx.options.application ? mdCode(ctx.options.application) : ctx.d.allApps} · ${
    ctx.options.environment ? mdCode(ctx.options.environment) : ctx.d.allEnvs
  }`;

const stackBlock = (stack: string, lines: number, ctx: Pick<Context, "r" | "d">) => {
  const head = stackHead(ctx.r(stack), lines);
  const text = head.omitted ? [...head.lines, ctx.d.truncated(head.omitted)].join("\n") : head.lines.join("\n");
  return mdFence(text, "text");
};

// ---------------------------------------------------------------------------
// Informe para personas
// ---------------------------------------------------------------------------

const humanReport = (ctx: Context): string => {
  const { data, options, t, d, fmt, r, wants } = ctx;
  const out: string[] = [];

  out.push(`# ${d.title}`);
  out.push(
    [
      `> **${d.generated}:** ${fmt.dateTime(data.generatedAt)}`,
      `> **${d.window}:** ${fmt.dateTime(data.from)} → ${fmt.dateTime(data.to)} (${fmt.duration(
        Date.parse(data.to) - Date.parse(data.from),
      )})`,
      `> **${d.scope}:** ${scopeLabel(ctx)}`,
      ...(options.redact ? [`> ${d.redacted}`] : []),
    ].join("\n"),
  );

  if (wants("summary")) {
    out.push(`## ${d.summary}`);
    out.push(`### ${d.keyFindings}`);
    out.push(findings(ctx).map((item) => `- ${item}`).join("\n"));
    const rows: string[][] = [
      [d.records, fmt.number(data.totals.total)],
      [d.errors, `${fmt.number(data.totals.error)} (${fmt.percent(ctx.errorRate)})`],
      [d.warnings, fmt.number(data.totals.warn)],
      [d.distinctErrors, `${fmt.number(data.groups.length)}${data.groupsCapped ? "+" : ""}`],
    ];
    if (ctx.peak) rows.push([d.peak, `${utcMinute(ctx.peak.start)} · ${fmt.number(ctx.peak.total)}`]);
    out.push(mdTable([d.metric, d.value], rows));
  }

  if (wants("activity")) {
    const { bins, stepHours } = binTimeline(data.hours, 24);
    const max = Math.max(1, ...bins.map((bin) => bin.total));
    out.push(`## ${d.activity}`);
    out.push(d.bucketNote(t.time.hours(stepHours)));
    out.push(
      mdTable(
        [d.interval, d.total, ...LEVELS.map((level) => t.levels.names[level]), d.activity],
        bins.map((bin) => [
          utcMinute(bin.start),
          fmt.number(bin.total),
          ...LEVELS.map((level) => fmt.number(bin[level])),
          textBar(bin.total, max) || " ",
        ]),
      ),
    );
  }

  if (wants("levels")) {
    out.push(`## ${d.levels}`);
    out.push(
      mdTable(
        [d.level, d.records, d.share],
        LEVELS.map((level) => [
          t.levels.names[level],
          fmt.number(data.totals[level]),
          fmt.percent(data.totals.total ? data.totals[level] / data.totals.total : 0),
        ]),
      ),
    );
  }

  if (wants("applications")) {
    out.push(`## ${d.applications}`);
    out.push(
      data.applications.length === 0
        ? d.none
        : mdTable(
            [d.application, d.services, d.environments, d.errors24h, d.lastActivity],
            data.applications.map((app) => [
              mdCode(app.application),
              app.services.join(", "),
              app.environments.join(", "),
              fmt.number(app.errorsLast24h),
              utcMinute(app.lastSeen),
            ]),
          ),
    );
  }

  if (wants("errorGroups")) {
    out.push(`## ${d.errorGroups}`);
    if (ctx.included.length === 0) out.push(d.findings.noErrors);
    ctx.included.forEach((group, index) => {
      out.push(`### ${index + 1}. ${oneLine(group.errorName ?? d.noClass)} · ${fmt.number(group.count)}`);
      out.push(
        [
          `- **${d.application}:** ${mdCode(group.application)}${group.service ? ` / ${mdCode(group.service)}` : ""}`,
          ...(group.errorCode ? [`- **${d.code}:** ${mdCode(group.errorCode)}`] : []),
          `- **${d.occurrences}:** ${fmt.number(group.count)} (${fmt.percent(ctx.groupTotal ? group.count / ctx.groupTotal : 0)})`,
          `- **${d.firstSeen}:** ${utcMinute(group.firstSeen)} · **${d.lastSeen}:** ${utcMinute(group.lastSeen)}`,
          `- **${d.fingerprint}:** ${mdCode(group.fingerprint)}`,
        ].join("\n"),
      );
      out.push(`**${d.sampleMessage}:**`);
      out.push(mdQuote(clip(r(group.sampleMessage), 600)));
      const sample = data.samples[group.fingerprint];
      if (options.includeStacks && sample?.errorStack) {
        out.push(`**${d.stackTrace}:**`);
        out.push(stackBlock(sample.errorStack, options.stackLines, ctx));
      }
    });
  }

  if (wants("recentErrors")) {
    out.push(`## ${d.recentErrors}`);
    out.push(
      data.recentErrors.length === 0
        ? d.findings.noErrors
        : mdTable(
            [d.time, d.application, d.message],
            data.recentErrors
              .slice(0, 15)
              .map((log) => [utcMinute(log.timestamp), mdCode(log.application), clip(oneLine(r(log.message)), 180)]),
          ),
    );
  }

  out.push("---");
  out.push(d.footer);
  return `${out.join("\n\n")}\n`;
};

// ---------------------------------------------------------------------------
// Datos para agentes (compartidos por el .md y el .json)
// ---------------------------------------------------------------------------

const agentData = (ctx: Context) => {
  const { data, options, r, wants } = ctx;
  const stackLines = options.includeStacks ? options.stackLines : 0;

  const summary = {
    window_from: data.from,
    window_to: data.to,
    window_hours: ctx.windowHours,
    scope_application: options.application ?? null,
    scope_environment: options.environment ?? null,
    logs_total: data.totals.total,
    logs_error: data.totals.error,
    logs_warn: data.totals.warn,
    logs_info: data.totals.info,
    logs_debug: data.totals.debug,
    error_rate: Number(ctx.errorRate.toFixed(4)),
    distinct_failures: data.groups.length,
    distinct_failures_capped: data.groupsCapped,
    peak_bucket_start: ctx.peak ? new Date(ctx.peak.start).toISOString() : null,
    peak_bucket_logs: ctx.peak?.total ?? 0,
  };

  const binned = binTimeline(data.hours, 48);
  const timeline = wants("activity")
    ? {
        bucket_hours: binned.stepHours,
        rows: binned.bins.map((bin) => ({
          bucket_start: new Date(bin.start).toISOString(),
          total: bin.total,
          error: bin.error,
          warn: bin.warn,
          info: bin.info,
          debug: bin.debug,
        })),
      }
    : null;

  const errorGroups = wants("errorGroups")
    ? ctx.included.map((group, index) => {
        const sample = data.samples[group.fingerprint];
        const head = stackLines && sample?.errorStack ? stackHead(r(sample.errorStack), stackLines) : null;
        return {
          rank: index + 1,
          fingerprint: group.fingerprint,
          occurrences: group.count,
          share_of_errors: ctx.groupTotal ? Number((group.count / ctx.groupTotal).toFixed(4)) : 0,
          level: group.level,
          error_name: group.errorName,
          error_code: group.errorCode,
          application: group.application,
          service: group.service,
          first_seen_in_window: group.firstSeen,
          last_seen: group.lastSeen,
          sample_log_id: group.lastLogId,
          sample_message: clip(r(group.sampleMessage), 500),
          ...(head ? { stack_head: head.lines, stack_lines_omitted: head.omitted } : {}),
        };
      })
    : null;

  const recentErrors = wants("recentErrors")
    ? data.recentErrors.slice(0, 15).map((log) => {
        const head = stackLines && log.errorStack ? stackHead(r(log.errorStack), Math.min(stackLines, 8)) : null;
        return {
          id: log.id,
          timestamp: log.timestamp,
          application: log.application,
          service: log.service ?? null,
          environment: log.environment,
          host: log.host ?? null,
          trace_id: log.traceId ?? null,
          fingerprint: log.fingerprint ?? null,
          error_name: log.errorName ?? null,
          error_code: log.errorCode ?? null,
          message: clip(r(log.message), 400),
          ...(head ? { stack_head: head.lines } : {}),
        };
      })
    : null;

  const applications = wants("applications")
    ? data.applications.map((app) => ({
        application: app.application,
        services: app.services,
        environments: app.environments,
        logs_7d: app.count,
        errors_24h: app.errorsLast24h,
        last_seen: app.lastSeen,
      }))
    : null;

  const levels = wants("levels")
    ? LEVELS.map((level) => ({
        level,
        logs: data.totals[level],
        share: data.totals.total ? Number((data.totals[level] / data.totals.total).toFixed(4)) : 0,
      }))
    : null;

  return {
    summary,
    findings: wants("summary") ? findings(ctx).map((item) => item.replace(/\*\*|`/g, "")) : null,
    timeline,
    levels,
    error_groups: errorGroups,
    recent_errors: recentErrors,
    applications,
  };
};

const TOOLS = [
  "list_applications",
  "get_stats",
  "get_error_groups",
  "get_recent_errors",
  "search_logs",
  "get_log",
  "get_log_context",
  "get_trace",
] as const;

const instructions = (ctx: Context) => {
  const a = ctx.d.agent;
  return {
    role: a.roleText,
    objective: a.objectives[ctx.options.objective],
    steps: ctx.options.objective === "custom" ? [] : a.stepList,
    rules: ctx.options.redact ? a.ruleList : a.ruleList.filter((rule) => !rule.includes("[REDACTED")),
    operator_notes: ctx.options.instructions.trim() || null,
    response_format: a.responseList,
    respond_in: a.respondIn,
  };
};

// ---------------------------------------------------------------------------
// Brief para agentes en Markdown
// ---------------------------------------------------------------------------

const agentMarkdown = (ctx: Context): string => {
  const { data, options, d } = ctx;
  const a = d.agent;
  const guide = instructions(ctx);
  const payload = agentData(ctx);
  const out: string[] = [];

  out.push(
    [
      "---",
      `schema: ${yamlScalar("mclog.agent-brief/v1")}`,
      `generated_at: ${yamlScalar(data.generatedAt)}`,
      `source: ${yamlScalar(data.origin || null)}`,
      `window_from: ${yamlScalar(data.from)}`,
      `window_to: ${yamlScalar(data.to)}`,
      `scope_application: ${yamlScalar(options.application ?? null)}`,
      `scope_environment: ${yamlScalar(options.environment ?? null)}`,
      `sections: [${options.sections.join(", ")}]`,
      `redacted: ${options.redact}`,
      `language: ${options.locale}`,
      "---",
    ].join("\n"),
  );

  out.push(`# ${a.title}`);
  out.push(a.intro);
  out.push(`## ${a.role}\n\n${guide.role}`);
  out.push(`## ${a.objective}\n\n${guide.objective}`);
  if (guide.steps.length) out.push(`## ${a.steps}\n\n${guide.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}`);
  out.push(`## ${a.rules}\n\n${guide.rules.map((rule) => `- ${rule}`).join("\n")}`);
  if (guide.operator_notes) out.push(`## ${a.operatorNotes}\n\n${mdQuote(guide.operator_notes)}`);
  out.push(
    `## ${a.tools}\n\n${a.toolsIntro}\n\n${mdTable(
      [a.tool, a.useFor],
      TOOLS.map((tool) => [mdCode(tool), a.toolList[tool]]),
    )}`,
  );
  out.push(
    `## ${a.responseFormat}\n\n${guide.response_format.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n\n${guide.respond_in}`,
  );

  out.push(`## ${a.data}`);
  out.push("<mclog_data>");
  out.push(
    `### summary\n\n${mdFence(
      Object.entries(payload.summary)
        .map(([key, value]) => `${key}: ${yamlScalar(value)}`)
        .join("\n"),
      "yaml",
    )}`,
  );
  if (payload.findings) out.push(`### findings\n\n${payload.findings.map((item) => `- ${item}`).join("\n")}`);
  if (payload.timeline) {
    out.push(
      `### timeline (bucket_hours=${payload.timeline.bucket_hours}, UTC)\n\n${mdFence(
        toCsv(
          ["bucket_start", "total", "error", "warn", "info", "debug"],
          payload.timeline.rows.map((row) => [row.bucket_start, row.total, row.error, row.warn, row.info, row.debug]),
        ),
        "csv",
      )}`,
    );
  }
  if (payload.levels) {
    out.push(`### levels\n\n${mdFence(toCsv(["level", "logs", "share"], payload.levels.map((row) => [row.level, row.logs, row.share])), "csv")}`);
  }
  if (payload.error_groups) out.push(`### error_groups\n\n${mdFence(JSON.stringify(payload.error_groups, null, 2), "json")}`);
  if (payload.recent_errors) out.push(`### recent_errors\n\n${mdFence(JSON.stringify(payload.recent_errors, null, 2), "json")}`);
  if (payload.applications) {
    out.push(
      `### applications\n\n${mdFence(
        toCsv(
          ["application", "services", "environments", "logs_7d", "errors_24h", "last_seen"],
          payload.applications.map((app) => [
            app.application,
            app.services.join(" "),
            app.environments.join(" "),
            app.logs_7d,
            app.errors_24h,
            app.last_seen,
          ]),
        ),
        "csv",
      )}`,
    );
  }
  out.push("</mclog_data>");
  return `${out.join("\n\n")}\n`;
};

// ---------------------------------------------------------------------------
// Datos para agentes en JSON
// ---------------------------------------------------------------------------

const agentJson = (ctx: Context) => {
  const { data, options } = ctx;
  const payload = agentData(ctx);
  return {
    schema: "mclog.agent-report/v1",
    generated_at: data.generatedAt,
    source: data.origin || null,
    language: options.locale,
    window: { from: data.from, to: data.to, hours: ctx.windowHours },
    scope: { application: options.application ?? null, environment: options.environment ?? null },
    redacted: options.redact,
    notes: [ctx.d.agent.ruleList[0]],
    instructions: instructions(ctx),
    tools: TOOLS.map((name) => ({ name, use_for: ctx.d.agent.toolList[name] })),
    data: {
      summary: payload.summary,
      findings: payload.findings,
      timeline: payload.timeline,
      levels: payload.levels,
      error_groups: payload.error_groups,
      recent_errors: payload.recent_errors,
      applications: payload.applications,
    },
  };
};

export const buildReport = (data: ReportData, options: ReportOptions): BuiltReport => {
  const ctx = context(data, options);
  const stamp = fileStamp(data.generatedAt);
  switch (options.kind) {
    case "agent-md":
      return { content: agentMarkdown(ctx), filename: `mclog-agent-brief-${stamp}.md`, mime: "text/markdown" };
    case "agent-json":
      return {
        content: `${JSON.stringify(agentJson(ctx), null, 2)}\n`,
        filename: `mclog-agent-data-${stamp}.json`,
        mime: "application/json",
      };
    default:
      return { content: humanReport(ctx), filename: `mclog-report-${stamp}.md`, mime: "text/markdown" };
  }
};

// ---------------------------------------------------------------------------
// Briefs rapidos: un log, una traza, un fallo. Siempre enmascarados, porque se
// copian con un clic y es facil pegarlos donde no se debe.
// ---------------------------------------------------------------------------

const briefHeader = (title: string, task: string, locale: Locale) => {
  const d = dictionaries[locale].reportDoc;
  return [
    `# ${title}`,
    `> ${d.generated}: ${new Date().toISOString()} · ${d.redacted}`,
    `## ${d.agent.objective}\n\n${task}`,
    `## ${d.agent.rules}\n\n${d.agent.ruleList.map((rule) => `- ${rule}`).join("\n")}`,
    `${d.agent.respondIn}`,
  ];
};

const logForAgent = (log: LogEntry, stackLines = 60) => ({
  id: log.id,
  timestamp: log.timestamp,
  level: log.level,
  application: log.application,
  service: log.service ?? null,
  environment: log.environment,
  host: log.host ?? null,
  trace_id: log.traceId ?? null,
  span_id: log.spanId ?? null,
  fingerprint: log.fingerprint ?? null,
  error_name: log.errorName ?? null,
  error_code: log.errorCode ?? null,
  message: redactText(log.message),
  ...(log.errorStack ? { stack: stackHead(redactText(log.errorStack), stackLines).lines } : {}),
  ...(log.metadata ? { metadata: redactValue(log.metadata) } : {}),
});

export const buildLogBrief = (log: LogEntry, contextLogs: LogEntry[], locale: Locale): string => {
  const a = dictionaries[locale].reportDoc.agent;
  const origin = new Date(log.timestamp).getTime();
  const out = briefHeader(a.logTitle, a.logTask, locale);
  out.push("<mclog_data>");
  out.push(`### log\n\n${mdFence(JSON.stringify(logForAgent(log), null, 2), "json")}`);
  if (contextLogs.length > 0) {
    out.push(
      `### ${a.context}\n\n${mdFence(
        toCsv(
          ["offset_ms", "id", "level", "application", "service", "message"],
          contextLogs.map((entry) => [
            new Date(entry.timestamp).getTime() - origin,
            entry.id,
            entry.level,
            entry.application,
            entry.service ?? "",
            clip(redactText(oneLine(entry.message)), 240),
          ]),
        ),
        "csv",
      )}`,
    );
  }
  out.push("</mclog_data>");
  return `${out.join("\n\n")}\n`;
};

export const buildTraceBrief = (traceId: string, logs: LogEntry[], locale: Locale): string => {
  const a = dictionaries[locale].reportDoc.agent;
  const origin = logs.length ? new Date(logs[0].timestamp).getTime() : 0;
  const last = logs.length ? new Date(logs[logs.length - 1].timestamp).getTime() : 0;
  const errors = logs.filter((log) => log.level === "error");
  const out = briefHeader(a.traceTitle, a.traceTask, locale);
  out.push("<mclog_data>");
  out.push(
    `### summary\n\n${mdFence(
      [
        `trace_id: ${yamlScalar(traceId)}`,
        `logs: ${logs.length}`,
        `applications: [${[...new Set(logs.map((log) => log.application))].map((app) => yamlScalar(app)).join(", ")}]`,
        `duration_ms: ${last - origin}`,
        `errors: ${errors.length}`,
        `started_at: ${yamlScalar(logs[0]?.timestamp ?? null)}`,
      ].join("\n"),
      "yaml",
    )}`,
  );
  out.push(
    `### ${a.traceLogs}\n\n${mdFence(
      toCsv(
        ["offset_ms", "id", "level", "application", "service", "host", "message"],
        logs.map((log) => [
          new Date(log.timestamp).getTime() - origin,
          log.id,
          log.level,
          log.application,
          log.service ?? "",
          log.host ?? "",
          clip(redactText(oneLine(log.message)), 240),
        ]),
      ),
      "csv",
    )}`,
  );
  if (errors.length) {
    out.push(`### ${a.errorsInTrace}\n\n${mdFence(JSON.stringify(errors.slice(0, 10).map((log) => logForAgent(log, 30)), null, 2), "json")}`);
  }
  out.push("</mclog_data>");
  return `${out.join("\n\n")}\n`;
};

/** Traza en Markdown para personas: resumen, cronologia y errores con su stack. */
export const buildTraceMarkdown = (traceId: string, logs: LogEntry[], locale: Locale): string => {
  const t = dictionaries[locale];
  const d = t.reportDoc;
  const fmt = createFormatter(locale);
  const origin = logs.length ? new Date(logs[0].timestamp).getTime() : 0;
  const duration = logs.length ? new Date(logs[logs.length - 1].timestamp).getTime() - origin : 0;
  const errors = logs.filter((log) => log.level === "error");
  const out: string[] = [];

  out.push(`# ${t.trace.title} ${mdCode(traceId)}`);
  out.push(`> **${d.generated}:** ${fmt.dateTime(new Date())} · ${d.redacted}`);
  out.push(
    mdTable(
      [d.metric, d.value],
      [
        [t.trace.records, fmt.number(logs.length)],
        [t.trace.apps, [...new Set(logs.map((log) => log.application))].join(", ")],
        [t.trace.duration, fmt.duration(duration)],
        [t.trace.errors, fmt.number(errors.length)],
      ],
    ),
  );
  out.push(`## ${t.trace.timeline}`);
  out.push(
    mdTable(
      ["+ms", d.level, d.application, d.message],
      logs.map((log) => [
        fmt.number(new Date(log.timestamp).getTime() - origin),
        log.level,
        mdCode(log.application),
        clip(oneLine(redactText(log.message)), 200),
      ]),
    ),
  );
  errors.slice(0, 10).forEach((log) => {
    out.push(`### ${oneLine(log.errorName ?? d.noClass)} · ${mdCode(log.application)}`);
    out.push(mdQuote(clip(redactText(log.message), 600)));
    if (log.errorStack) out.push(stackBlock(log.errorStack, 40, { r: redactText, d }));
  });
  out.push("---");
  out.push(d.footer);
  return `${out.join("\n\n")}\n`;
};

/** Brief de un fallo agrupado, con su ejemplo mas reciente si se tiene. */
export const buildGroupBrief = (group: ErrorGroup, sample: LogEntry | null, locale: Locale): string => {
  const a = dictionaries[locale].reportDoc.agent;
  const out = briefHeader(a.logTitle, a.logTask, locale);
  out.push("<mclog_data>");
  out.push(
    `### error_group\n\n${mdFence(
      JSON.stringify(
        {
          fingerprint: group.fingerprint,
          occurrences: group.count,
          level: group.level,
          error_name: group.errorName,
          error_code: group.errorCode,
          application: group.application,
          service: group.service,
          first_seen_in_window: group.firstSeen,
          last_seen: group.lastSeen,
          sample_log_id: group.lastLogId,
          sample_message: redactText(group.sampleMessage),
        },
        null,
        2,
      ),
      "json",
    )}`,
  );
  if (sample) out.push(`### latest_sample\n\n${mdFence(JSON.stringify(logForAgent(sample), null, 2), "json")}`);
  out.push("</mclog_data>");
  return `${out.join("\n\n")}\n`;
};
