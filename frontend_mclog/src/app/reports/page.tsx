"use client";
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/atoms/Alert";
import { Button } from "@/components/atoms/Button";
import { Checkbox } from "@/components/atoms/Checkbox";
import { EmptyState } from "@/components/atoms/EmptyState";
import { Field, Fieldset } from "@/components/atoms/Field";
import { Icon, IconName } from "@/components/atoms/Icon";
import { Textarea } from "@/components/atoms/Input";
import { Segmented } from "@/components/atoms/Segmented";
import { Switch } from "@/components/atoms/Switch";
import { Card } from "@/components/molecules/Card";
import { CodeBlock } from "@/components/molecules/CodeBlock";
import { CopyButton } from "@/components/molecules/CopyButton";
import { DateRangePicker } from "@/components/molecules/DateRangePicker";
import { MarkdownView } from "@/components/molecules/MarkdownView";
import { Select } from "@/components/molecules/Select";
import { useToast } from "@/components/molecules/Toast";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { saveFile } from "@/common/api/download";
import { errorMessage } from "@/common/api/errorMessage";
import { LOCALES, Locale } from "@/common/i18n/config";
import { useI18n } from "@/common/i18n/I18nProvider";
import { BuiltReport, buildReport } from "@/common/reports/build";
import {
  AGENT_OBJECTIVES,
  AgentObjective,
  collectReportData,
  REPORT_KINDS,
  REPORT_SECTIONS,
  ReportKind,
  ReportOptions,
  ReportSection,
} from "@/common/reports/collect";
import { approxTokens } from "@/common/reports/markdown";
import { Preset, rangeFromParams } from "@/common/time/range";
import { useFilterOptions } from "@/hooks/useOptions";

const PRESETS: readonly Preset[] = ["1h", "6h", "24h", "7d", "30d"];
const KIND_ICON: Record<ReportKind, IconName> = { markdown: "report", "agent-md": "bot", "agent-json": "braces" };

type Result = BuiltReport & { options: ReportOptions; bytes: number; generatedAt: string };

function ReportsView() {
  const { t, fmt, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const notify = useToast();
  const filterOptions = useFilterOptions();

  // Estado inicial desde la URL: "Exportar > Brief para IA" en la vista de
  // logs llega aqui con el tipo, el rango y el ambito ya puestos.
  const [options, setOptions] = useState<ReportOptions>(() => {
    const params = new URLSearchParams(searchParams.toString());
    const kind = REPORT_KINDS.includes(params.get("kind") as ReportKind) ? (params.get("kind") as ReportKind) : "markdown";
    return {
      kind,
      locale,
      range: rangeFromParams(params),
      application: params.get("application") ?? undefined,
      environment: params.get("environment") ?? undefined,
      sections: [...REPORT_SECTIONS],
      maxGroups: 10,
      includeStacks: true,
      stackLines: 20,
      redact: kind !== "markdown",
      objective: "triage",
      instructions: "",
    };
  });
  const [view, setView] = useState<"rendered" | "raw">("rendered");

  const set = <K extends keyof ReportOptions>(key: K, value: ReportOptions[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  // Estado local y no useMutation: la generacion automatica arranca en un
  // efecto de montaje, y en StrictMode el observador de la mutacion se
  // desuscribe en el desmontaje simulado y pierde el resultado.
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const runId = useRef(0);

  const generate = useCallback(async (input: ReportOptions) => {
    // Solo cuenta la ultima generacion: si se pulsa dos veces, la primera se descarta.
    runId.current += 1;
    const current = runId.current;
    setPending(true);
    setFailure(null);
    try {
      const data = await collectReportData(input);
      const built = buildReport(data, input);
      if (current === runId.current) {
        setResult({ ...built, options: input, bytes: new Blob([built.content]).size, generatedAt: data.generatedAt });
      }
    } catch (error) {
      if (current === runId.current) setFailure(error);
    } finally {
      if (current === runId.current) setPending(false);
    }
  }, []);

  const run = () => {
    if (options.sections.length === 0) return;
    void generate(options);
  };

  // Autogenerar una vez si se llego con ?generate=1, y limpiar ese parametro
  // para que recargar la pagina no vuelva a lanzarlo.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || searchParams.get("generate") !== "1") return;
    autoRan.current = true;
    void generate(options);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("generate");
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stale = useMemo(() => !!result && JSON.stringify(result.options) !== JSON.stringify(options), [result, options]);
  const isAgent = options.kind !== "markdown";
  const isJson = result?.filename.endsWith(".json");

  const toggleSection = (section: ReportSection, checked: boolean) =>
    set(
      "sections",
      checked
        ? REPORT_SECTIONS.filter((item) => item === section || options.sections.includes(item))
        : options.sections.filter((item) => item !== section),
    );

  const download = () => {
    if (!result) return;
    saveFile(result.content, result.filename, `${result.mime};charset=utf-8`);
    notify(t.toast.downloaded(result.filename));
  };

  return (
    <DashboardLayout title={t.reports.title} eyebrow={t.reports.eyebrow} description={t.reports.description}>
      <div className="grid items-start gap-4 xl:grid-cols-[25rem_minmax(0,1fr)] 3xl:grid-cols-[28rem_minmax(0,1fr)] 3xl:gap-5">
        <Card
          title={t.reports.config}
          divider
          className="xl:sticky xl:top-[4.5rem] xl:max-h-[calc(100vh-5.5rem)] xl:overflow-y-auto"
        >
          <form
            className="flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              run();
            }}
          >
            <Fieldset legend={t.reports.kind}>
              <div role="radiogroup" aria-label={t.reports.kind} className="flex flex-col gap-2">
                {REPORT_KINDS.map((kind) => {
                  const selected = options.kind === kind;
                  return (
                    <button
                      key={kind}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() =>
                        setOptions((current) => ({ ...current, kind, redact: kind === "markdown" ? current.redact : true }))
                      }
                      className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                        selected ? "border-brand/50 bg-brand-soft/60 ring-1 ring-brand/20" : "border-line hover:border-line-strong hover:bg-surface-2"
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          selected ? "bg-brand-solid text-white" : "bg-surface-3 text-ink-3"
                        }`}
                      >
                        <Icon name={KIND_ICON[kind]} className="h-[1.125rem] w-[1.125rem]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink">{t.reports.kinds[kind].title}</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-ink-3">{t.reports.kinds[kind].description}</span>
                      </span>
                      {selected && <Icon name="checkCircle" className="h-4 w-4 text-brand" />}
                    </button>
                  );
                })}
              </div>
            </Fieldset>

            <Field label={t.reports.range}>
              <DateRangePicker value={options.range} onChange={(range) => set("range", range)} presets={PRESETS} />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1 3xl:grid-cols-2">
              <Field label={t.logs.application}>
                <Select
                  icon="box"
                  value={options.application ?? ""}
                  onChange={(value) => set("application", value || undefined)}
                  options={filterOptions.apps}
                  searchable
                  allowCustom
                />
              </Field>
              <Field label={t.envs.label}>
                <Select
                  icon="layers"
                  value={options.environment ?? ""}
                  onChange={(value) => set("environment", value || undefined)}
                  options={filterOptions.environments}
                />
              </Field>
            </div>

            <Fieldset legend={t.reports.sections} hint={options.sections.length === 0 ? t.reports.noSections : undefined}>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-1 3xl:grid-cols-2">
                {REPORT_SECTIONS.map((section) => (
                  <Checkbox
                    key={section}
                    checked={options.sections.includes(section)}
                    onChange={(checked) => toggleSection(section, checked)}
                    label={t.reports.sectionNames[section]}
                  />
                ))}
              </div>
            </Fieldset>

            <Fieldset legend={t.reports.options}>
              <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface-2 p-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t.reports.maxGroups}>
                    <Select
                      value={String(options.maxGroups)}
                      onChange={(value) => set("maxGroups", Number(value))}
                      options={[5, 10, 20, 50].map((count) => ({ value: String(count), label: String(count) }))}
                    />
                  </Field>
                  <Field label={t.reports.stackLines}>
                    <Select
                      value={String(options.stackLines)}
                      onChange={(value) => set("stackLines", Number(value))}
                      options={[10, 20, 40].map((count) => ({ value: String(count), label: String(count) }))}
                      disabled={!options.includeStacks}
                    />
                  </Field>
                </div>
                <Switch
                  checked={options.includeStacks}
                  onChange={(value) => set("includeStacks", value)}
                  label={t.reports.includeStacks}
                  description={t.reports.includeStacksHint}
                />
                <Switch
                  checked={options.redact}
                  onChange={(value) => set("redact", value)}
                  label={t.reports.redact}
                  description={t.reports.redactHint}
                />
              </div>
            </Fieldset>

            {isAgent && (
              <Fieldset legend={t.reports.agent}>
                <div className="flex flex-col gap-4">
                  <Field label={t.reports.objective}>
                    <Select
                      icon="sparkles"
                      value={options.objective}
                      onChange={(value) => set("objective", value as AgentObjective)}
                      options={AGENT_OBJECTIVES.map((objective) => ({ value: objective, label: t.reports.objectives[objective] }))}
                    />
                  </Field>
                  <Field label={t.reports.instructions} aside={t.common.optional}>
                    <Textarea
                      rows={3}
                      value={options.instructions}
                      onChange={(event) => set("instructions", event.target.value)}
                      placeholder={t.reports.instructionsPlaceholder}
                      maxLength={2000}
                    />
                  </Field>
                </div>
              </Fieldset>
            )}

            <Field label={t.reports.reportLanguage}>
              <Segmented
                label={t.reports.reportLanguage}
                value={options.locale}
                onChange={(value) => set("locale", value as Locale)}
                options={LOCALES.map((option) => ({ value: option, label: t.prefs.languages[option] }))}
                className="w-full"
              />
            </Field>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              icon={result ? "refresh" : "sparkles"}
              loading={pending}
              disabled={options.sections.length === 0}
              className="w-full"
            >
              {pending ? t.reports.generating : result ? t.reports.regenerate : t.reports.generate}
            </Button>
          </form>
        </Card>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-card" aria-label={t.reports.preview}>
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <h2 className="font-heading text-[0.9375rem] font-semibold text-ink">{t.reports.preview}</h2>
              {result && (
                <span className="truncate font-mono text-xs text-ink-3" title={t.reports.tokensHint}>
                  {result.filename} · {t.reports.size(fmt.bytes(result.bytes), fmt.compact(approxTokens(result.content)))}
                </span>
              )}
            </div>
            {result && (
              <div className="flex items-center gap-2">
                {!isJson && (
                  <Segmented
                    size="sm"
                    semantics="tabs"
                    label={t.reports.preview}
                    value={view}
                    onChange={setView}
                    options={[
                      { value: "rendered", label: t.reports.rendered, icon: "eye" },
                      { value: "raw", label: t.reports.raw, icon: "code" },
                    ]}
                  />
                )}
                <CopyButton text={result.content} label={t.common.copy} />
                <Button size="sm" variant="primary" icon="download" onClick={download}>
                  {t.common.download}
                </Button>
              </div>
            )}
          </header>

          {stale && !pending && (
            <div className="border-b border-line bg-warning-soft px-5 py-2 text-xs text-warning">{t.reports.stale}</div>
          )}

          <div className="max-h-[calc(100vh-11rem)] min-h-[28rem] overflow-auto">
            {pending ? (
              <div className="mx-auto flex max-w-[110ch] flex-col gap-3 p-6 3xl:p-10">
                <div className="skeleton h-7 w-1/2" />
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton mt-4 h-40 w-full" />
                <div className="skeleton h-4 w-5/6" />
                <div className="skeleton h-4 w-3/5" />
              </div>
            ) : failure ? (
              <div className="p-6">
                <Alert variant="error" title={t.reports.error}>
                  {errorMessage(failure, t.common.unknownError)}
                </Alert>
              </div>
            ) : !result ? (
              <EmptyState icon="report" title={t.reports.emptyTitle} description={t.reports.emptyDescription} className="py-24" />
            ) : isJson ? (
              <div className="p-4">
                <CodeBlock code={result.content} language="json" maxHeight="none" />
              </div>
            ) : view === "raw" ? (
              <pre className="whitespace-pre-wrap break-words p-6 font-mono text-[0.8125rem] leading-relaxed text-ink-2 3xl:p-8">
                {result.content}
              </pre>
            ) : (
              <MarkdownView source={result.content} className="mx-auto max-w-[110ch] p-6 3xl:p-10" />
            )}
          </div>
          {result && (
            <footer className="border-t border-line px-5 py-2.5 text-[0.6875rem] text-ink-3">
              {t.reports.generatedAt(fmt.dateTime(result.generatedAt))}
            </footer>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsView />
    </Suspense>
  );
}
