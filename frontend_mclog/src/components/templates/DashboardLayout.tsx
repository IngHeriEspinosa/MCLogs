"use client";
// Template: DashboardLayout (riel de navegacion, barra superior y cabecera de pagina)
import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/organisms/Sidebar";
import { Topbar } from "@/components/organisms/Topbar";
import { useI18n } from "@/common/i18n/I18nProvider";
import { useMe } from "@/hooks/useAuth";
import { usePreference } from "@/hooks/usePreference";

/**
 * Ancho del contenido. Las vistas de datos llegan hasta 4K (3840 px) y usan
 * todo el espacio; los formularios se quedan en una columna legible, porque
 * un campo de 3000 px de ancho no se lee mejor, solo peor.
 */
const WIDTH = {
  full: "max-w-[3840px]",
  narrow: "max-w-5xl 3xl:max-w-6xl",
};

type DashboardLayoutProps = {
  title: string;
  eyebrow?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  width?: keyof typeof WIDTH;
  children: React.ReactNode;
};

export const PageHeader: React.FC<Pick<DashboardLayoutProps, "title" | "eyebrow" | "description" | "actions">> = ({
  title,
  eyebrow,
  description,
  actions,
}) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 3xl:mb-8">
    <div className="min-w-0 max-w-3xl">
      {eyebrow && (
        <p className="eyebrow mb-2 flex items-center gap-2">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent-400" />
          {eyebrow}
        </p>
      )}
      <h1 className="font-heading text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">{title}</h1>
      {description && <p className="mt-1.5 text-sm leading-relaxed text-ink-3">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  title,
  eyebrow,
  description,
  actions,
  width = "full",
  children,
}) => {
  const { t } = useI18n();
  const me = useMe();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = usePreference<boolean>("sidebarCollapsed", false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    document.title = `${title} · MCLog`;
  }, [title]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setMobileOpen(false);
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  return (
    <div className="flex min-h-screen">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[90] focus:rounded-lg focus:bg-brand-solid focus:px-4 focus:py-2 focus:text-white"
      >
        {t.nav.skip}
      </a>

      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed(!collapsed)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        isAdmin={me.data?.role === "admin"}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} section={eyebrow} onOpenMenu={() => setMobileOpen(true)} me={me.data} />
        <main id="content" className="relative flex-1">
          <div
            aria-hidden
            className="bg-dot-grid pointer-events-none absolute inset-x-0 top-0 h-72 [mask-image:linear-gradient(to_bottom,black_10%,transparent)]"
          />
          <div className={`relative mx-auto w-full px-4 py-6 sm:px-6 xl:px-8 3xl:px-10 3xl:py-8 ${WIDTH[width]}`}>
            <PageHeader title={title} eyebrow={eyebrow} description={description} actions={actions} />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
