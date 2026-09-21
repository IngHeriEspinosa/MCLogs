"use client";
// Template: AuthLayout (flujo de autenticación)
import React, { useEffect } from "react";
import { Icon, Logo } from "@/components/atoms/Icon";
import { LanguageMenu, ThemeMenu } from "@/components/organisms/Topbar";
import { useI18n } from "@/common/i18n/I18nProvider";

// Ilustracion del panel de marca: lineas de ejemplo, no datos reales.
const PREVIEW = [
  { time: "14:03:22.114", level: "info", app: "billing", message: "Invoice INV-2291 issued" },
  { time: "14:03:22.387", level: "warn", app: "gateway", message: "Upstream latency 1.8 s" },
  { time: "14:03:23.002", level: "error", app: "billing", message: "TypeError: Cannot read properties of undefined" },
  { time: "14:03:23.004", level: "info", app: "worker", message: "Retry scheduled (attempt 2)" },
  { time: "14:03:24.310", level: "debug", app: "sync", message: "Cursor advanced to 88412" },
] as const;

const LEVEL_TEXT = {
  info: "text-[#8fc0f5]",
  warn: "text-[#f0c060]",
  error: "text-[#ff9b9b]",
  debug: "text-[#98afba]",
};

export const AuthLayout: React.FC<{ children: React.ReactNode; title: string; subtitle?: string }> = ({
  children,
  title,
  subtitle,
}) => {
  const { t } = useI18n();

  useEffect(() => {
    document.title = `${title} · MCLog`;
  }, [title]);

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-rail p-10 text-rail-ink lg:flex 3xl:p-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_70%)]"
          style={{
            backgroundImage: "radial-gradient(rgb(255 255 255 / 0.07) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-[#19607e] opacity-30 blur-[120px]"
        />

        <div className="relative flex items-center gap-3">
          <Logo className="h-12 w-12" />
          <div className="leading-none">
            <p className="font-heading text-xl font-bold">{t.app.name}</p>
            <p className="mt-1.5 font-mono text-[0.625rem] uppercase tracking-[0.18em] text-rail-ink-2">{t.app.tagline}</p>
          </div>
        </div>

        <div className="relative max-w-xl 3xl:max-w-2xl 4xl:max-w-3xl">
          <h2 className="font-heading text-4xl font-bold leading-[1.12] tracking-[-0.012em] 3xl:text-5xl 4xl:text-6xl">{t.auth.heroTitle}</h2>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-rail-ink-2 3xl:text-base 4xl:text-lg">{t.auth.heroBody}</p>
          <ul className="mt-6 flex flex-col gap-2.5">
            {t.auth.heroPoints.map((point) => (
              <li key={point} className="flex items-center gap-2.5 text-sm">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-400 text-accent-900">
                  <Icon name="check" className="h-3 w-3" strokeWidth={3} />
                </span>
                {point}
              </li>
            ))}
          </ul>

          <div aria-hidden className="mt-10 overflow-hidden rounded-2xl border border-rail-line bg-black/25 shadow-pop backdrop-blur">
            <div className="flex items-center gap-1.5 border-b border-rail-line px-4 py-2.5">
              <span className="h-2 w-2 rounded-full bg-rail-line" />
              <span className="h-2 w-2 rounded-full bg-rail-line" />
              <span className="h-2 w-2 rounded-full bg-rail-line" />
              <span className="ml-auto flex items-center gap-1.5 font-mono text-[0.625rem] uppercase tracking-wider text-[#5fd49a]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5fd49a]" />
                live
              </span>
            </div>
            <ul className="flex flex-col gap-1.5 p-4 font-mono text-[0.75rem]">
              {PREVIEW.map((line, index) => (
                <li
                  key={line.time}
                  className="flex animate-fade-in gap-3 whitespace-nowrap"
                  style={{ animationDelay: `${index * 120}ms`, animationFillMode: "both" }}
                >
                  <span className="text-rail-ink-2">{line.time}</span>
                  <span className={`w-12 font-semibold uppercase mr-2 ${LEVEL_TEXT[line.level]}`}>{line.level}</span>
                  <span className="w-16 text-rail-ink">{line.app}</span>
                  <span className="truncate text-rail-ink-2">{line.message}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="relative font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-rail-ink-2">{t.auth.footer}</p>
      </aside>

      <main className="relative flex flex-col">
        <div aria-hidden className="bg-dot-grid pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_60%)] lg:hidden" />
        <div className="relative flex justify-end gap-0.5 p-4">
          <LanguageMenu />
          <ThemeMenu />
        </div>
        <div className="relative flex flex-1 items-center justify-center px-4 pb-16">
          <div className="w-full max-w-sm 4xl:max-w-md">
            <Logo className="mb-8 h-11 w-11 lg:hidden" />
            <h1 className="font-heading text-[1.75rem] font-bold tracking-tight text-ink">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-ink-3">{subtitle}</p>}
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
};
