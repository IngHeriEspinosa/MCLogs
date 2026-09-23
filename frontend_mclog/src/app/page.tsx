"use client";
import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, Logo } from "@/components/atoms/Icon";
import { ProjectLinks, LanguageMenu, ThemeMenu } from "@/components/organisms/Topbar";
import { useI18n } from "@/common/i18n/I18nProvider";
import { useMe } from "@/hooks/useAuth";

export default function HomePage() {
  const { t } = useI18n();
  const me = useMe();
  const router = useRouter();

  // Con sesion abierta esta portada no aporta nada: se entra directo al panel.
  useEffect(() => {
    if (me.isSuccess) router.replace("/logs");
  }, [me.isSuccess, router]);

  return (
    <div className="relative flex min-h-screen flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
        style={{
          backgroundImage: "radial-gradient(rgb(127 127 127 / 0.14) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />

      {/* Por encima de 2K el contenido deja de crecer y queda centrado. */}
      <div className="relative mx-auto flex w-full max-w-[2560px] flex-1 flex-col">
      <header className="relative flex items-center justify-between px-6 py-5 3xl:px-10 3xl:py-7">
        <div className="flex items-center gap-2.5 3xl:gap-3.5">
          <Logo className="h-12 w-12 3xl:h-14 3xl:w-14 4xl:h-16 4xl:w-16" />
          <div className="leading-none">
            <p className="font-heading text-lg font-bold text-ink 3xl:text-xl 4xl:text-2xl">{t.app.name}</p>
            <p className="mt-1 font-mono text-[0.625rem] uppercase tracking-[0.18em] text-ink-3 4xl:text-xs">{t.app.tagline}</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <ProjectLinks />
          <LanguageMenu />
          <ThemeMenu />
        </div>
      </header>

      <main className="relative flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-5xl text-center 3xl:max-w-6xl 4xl:max-w-7xl">
          {/* Si aun asi no cabe (movil), balance reparte las palabras entre
              las lineas en vez de dejar una sola huerfana. */}
          <h1 className="font-heading text-3xl font-bold leading-[1.12] tracking-[-0.012em] text-ink [text-wrap:balance] sm:text-4xl lg:text-5xl 3xl:text-6xl 4xl:text-7xl">
            {t.auth.heroTitle}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ink-3 3xl:mt-7 3xl:max-w-2xl 3xl:text-lg 4xl:max-w-3xl 4xl:text-xl">
            {t.auth.heroBody}
          </p>

          <ul className="mx-auto mt-8 flex w-fit flex-col gap-3 text-left 3xl:mt-10 3xl:gap-4">
            {t.auth.heroPoints.map((point) => (
              <li key={point} className="flex items-center gap-3 text-sm text-ink-2 3xl:text-base 4xl:text-lg">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-400 text-accent-900 4xl:h-6 4xl:w-6">
                  <Icon name="check" className="h-3 w-3 4xl:h-3.5 4xl:w-3.5" strokeWidth={3} />
                </span>
                {point}
              </li>
            ))}
          </ul>

          <Link
            href="/login"
            className="mt-10 inline-flex h-11 items-center gap-2 rounded-lg bg-brand-solid px-6 text-sm font-medium text-white transition-opacity hover:opacity-90 hover:no-underline 3xl:mt-12 3xl:h-12 3xl:px-7 3xl:text-base 4xl:h-14 4xl:px-8 4xl:text-lg"
          >
            {t.auth.signIn}
            <Icon name="arrowRight" className="h-4 w-4 4xl:h-5 4xl:w-5" />
          </Link>
        </div>
      </main>

      <footer className="relative px-6 py-6 text-center font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-3 4xl:text-xs">
        {t.sponsor.label}{" "}
        <a
          href={t.sponsor.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-ink-2 underline-offset-4 transition-colors hover:text-accent-500 hover:underline"
        >
          {t.sponsor.name}
        </a>
      </footer>
      </div>
    </div>
  );
}
