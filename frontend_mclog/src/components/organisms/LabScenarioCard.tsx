"use client";
import React from "react";
import { Alert } from "@/components/atoms/Alert";
import { Button, ButtonLink, buttonClass } from "@/components/atoms/Button";
import { Icon } from "@/components/atoms/Icon";
import { errorMessage } from "@/common/api/errorMessage";
import { useI18n } from "@/common/i18n/I18nProvider";
import type { LabLink, LabScenario } from "@/common/lab/scenarios";
import type { LabRunState } from "@/hooks/useLab";

const ACCENT: Record<LabScenario["accent"], string> = {
  brand: "bg-brand-soft text-brand",
  error: "bg-lvl-error/10 text-danger",
  warn: "bg-lvl-warn/15 text-warning",
  info: "bg-lvl-info/10 text-info",
  neutral: "bg-surface-3 text-ink-2",
};

const LINK_ICON = {
  logs: "logs",
  errors: "errors",
  trace: "route",
  reports: "sparkles",
  alerts: "bell",
  liveTab: "externalLink",
} as const;

type LabScenarioCardProps = {
  scenario: LabScenario;
  state: LabRunState;
  onRun: () => void;
  onStop: () => void;
};

/**
 * Un escenario del Lab: que envia, que se vera al ejecutarlo, el progreso
 * mientras envia y, al terminar, los enlaces directos a donde mirar.
 */
export const LabScenarioCard: React.FC<LabScenarioCardProps> = ({ scenario, state, onRun, onStop }) => {
  const { t, fmt } = useI18n();
  const copy = t.lab.scenarios[scenario.id];
  const running = state.status === "running";
  const finished = state.status === "done" || state.status === "stopped";

  // Los enlaces fijos (abrir Logs antes de un stream) se ven siempre; los del
  // resultado, solo cuando ya hay algo que ver.
  const links: LabLink[] = [...(scenario.links ?? []), ...(finished || running ? state.links : [])];

  const renderLink = (link: LabLink) =>
    link.newTab ? (
      <a
        key={link.href}
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${buttonClass("ghost", "sm")} hover:no-underline`}
      >
        <Icon name={LINK_ICON[link.kind]} className="h-4 w-4" />
        {t.lab.open[link.kind]}
      </a>
    ) : (
      <ButtonLink key={link.href} href={link.href} variant="ghost" size="sm" icon={LINK_ICON[link.kind]}>
        {t.lab.open[link.kind]}
      </ButtonLink>
    );

  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
      <header className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ACCENT[scenario.accent]}`}>
          <Icon name={scenario.icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-[0.9375rem] font-semibold text-ink">{copy.title}</h2>
          <p className="mt-0.5 font-mono text-[0.6875rem] text-ink-3">
            {t.lab.logs(scenario.estimate.count)}
            {scenario.estimate.seconds ? ` · ${t.lab.duration(scenario.estimate.seconds)}` : ""}
          </p>
        </div>
      </header>

      <p className="text-sm leading-relaxed text-ink-2">{copy.description}</p>

      <div className="rounded-xl bg-surface-2 px-3.5 py-2.5">
        <p className="eyebrow mb-1">{t.lab.whatYouSee}</p>
        <p className="text-[0.8125rem] leading-relaxed text-ink-2">{copy.see}</p>
      </div>

      <div className="mt-auto flex flex-col gap-3 pt-1">
        {running && (
          <div className="flex flex-col gap-1.5" aria-live="polite">
            <progress
              value={state.sent}
              max={Math.max(1, state.total)}
              aria-label={copy.title}
              className="h-1.5 w-full appearance-none overflow-hidden rounded-full [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-surface-3 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-brand [&::-webkit-progress-value]:transition-all"
            />
            <p className="font-mono text-xs tabular-nums text-ink-3">
              {t.lab.progress(fmt.number(state.sent), fmt.number(state.total))}
            </p>
          </div>
        )}

        {finished && (
          <p className="flex items-center gap-2 text-sm text-ink-2" role="status">
            <Icon
              name={state.status === "done" ? "checkCircle" : "alertCircle"}
              className={`h-4 w-4 ${state.status === "done" ? "text-success" : "text-warning"}`}
            />
            {state.status === "done" ? t.lab.done(fmt.number(state.sent)) : t.lab.stopped(fmt.number(state.sent))}
          </p>
        )}

        {state.status === "error" && (
          <Alert variant="error" title={t.lab.failed}>
            {errorMessage(state.error, t.common.unknownError)}
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {running ? (
            <Button variant="secondary" size="sm" icon="stop" onClick={onStop}>
              {t.lab.stop}
            </Button>
          ) : (
            <Button variant="primary" size="sm" icon={finished ? "refresh" : "play"} onClick={onRun}>
              {finished ? t.lab.again : t.lab.run}
            </Button>
          )}
          {links.map(renderLink)}
        </div>
      </div>
    </article>
  );
};
