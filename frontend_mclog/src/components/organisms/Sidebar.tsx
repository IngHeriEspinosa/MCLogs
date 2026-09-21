"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconButton } from "@/components/atoms/Button";
import { Icon, IconName, Logo } from "@/components/atoms/Icon";
import { useI18n } from "@/common/i18n/I18nProvider";

type NavItem = { href: string; label: string; icon: IconName };
type NavSection = { label: string; items: NavItem[]; adminOnly?: boolean };

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" || pathname.startsWith("/trace") : pathname.startsWith(href);

type SidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  isAdmin: boolean;
};

/**
 * Riel de navegacion. Va en petroleo oscuro en los dos temas: es la pieza que
 * mas identidad da a la consola y separa con claridad "donde estoy" de "que
 * estoy mirando". En escritorio se puede contraer a solo iconos; en movil es
 * un panel que se desliza sobre el contenido.
 */
export const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggleCollapsed, mobileOpen, onCloseMobile, isAdmin }) => {
  const { t } = useI18n();
  const pathname = usePathname();

  const sections: NavSection[] = [
    {
      label: t.nav.observe,
      items: [
        { href: "/", label: t.nav.logs, icon: "logs" },
        { href: "/errors", label: t.nav.errors, icon: "errors" },
        { href: "/reports", label: t.nav.reports, icon: "report" },
      ],
    },
    {
      label: t.nav.admin,
      adminOnly: true,
      items: [
        { href: "/settings/alerts", label: t.nav.alerts, icon: "bell" },
        { href: "/settings/api-keys", label: t.nav.apiKeys, icon: "key" },
        { href: "/settings/users", label: t.nav.users, icon: "users" },
      ],
    },
  ];

  const renderLink = (item: NavItem) => {
    const active = isActive(pathname, item.href);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          title={collapsed ? item.label : undefined}
          className={`group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors hover:no-underline ${
            collapsed ? "lg:justify-center lg:px-0" : ""
          } ${active ? "bg-rail-2 text-rail-ink" : "text-rail-ink-2 hover:bg-rail-2/60 hover:text-rail-ink"}`}
        >
          {active && <span aria-hidden className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent-400" />}
          <Icon name={item.icon} className={`h-[1.125rem] w-[1.125rem] ${active ? "text-[#5cb8e0]" : ""}`} />
          <span className={collapsed ? "lg:sr-only" : ""}>{item.label}</span>
        </Link>
      </li>
    );
  };

  return (
    <>
      {mobileOpen && (
        <div
          aria-hidden
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 animate-fade-in bg-[rgb(4_10_14/0.55)] backdrop-blur-[1px] lg:hidden"
        />
      )}
      <aside
        aria-label={t.nav.mainNav}
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col overflow-hidden bg-rail text-rail-ink transition-[width,transform] duration-200 ease-out lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 ${
          mobileOpen ? "translate-x-0 shadow-pop" : "-translate-x-full"
        } ${collapsed ? "lg:w-[4.5rem]" : "lg:w-64 3xl:w-72"}`}
      >
        {/* Trama de puntos que se desvanece: el mismo "papel de instrumento" del lienzo. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-56 [mask-image:linear-gradient(to_bottom,black,transparent)]"
          style={{
            backgroundImage: "radial-gradient(rgb(255 255 255 / 0.06) 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        />

        {/* La marca comparte la rejilla del menu: el logo va centrado en el
            mismo eje que los iconos y "MCLog" empieza donde empiezan las
            etiquetas, para que la columna no quede escalonada. */}
        <div className={`relative flex h-16 shrink-0 items-center pl-[1.0625rem] pr-4 ${collapsed ? "lg:justify-center lg:pl-0 lg:pr-0" : ""}`}>
          <Link href="/" className="flex items-center gap-[0.4375rem] hover:no-underline" aria-label="MCLog">
            <Logo className="h-8 w-8 shrink-0 drop-shadow" />
            <span className={`flex flex-col leading-none ${collapsed ? "lg:hidden" : ""}`}>
              <span className="font-heading text-[1.0625rem] font-bold tracking-tight text-rail-ink">{t.app.name}</span>
              <span className="mt-1.5 font-mono text-[0.625rem] uppercase tracking-[0.18em] text-rail-ink-2">{t.app.console}</span>
            </span>
          </Link>
          <IconButton
            icon="x"
            label={t.nav.closeMenu}
            onClick={onCloseMobile}
            className="ml-auto text-rail-ink-2 hover:bg-rail-2 hover:text-rail-ink lg:hidden"
          />
        </div>

        <nav className="relative flex-1 overflow-y-auto px-3 pb-4 pt-2">
          {sections
            .filter((section) => !section.adminOnly || isAdmin)
            .map((section, index) => (
              <div key={section.label} className={index > 0 ? "mt-6" : ""}>
                <p
                  className={`mb-2 px-2.5 font-mono text-[0.625rem] font-medium uppercase tracking-[0.16em] text-rail-ink-2/80 ${
                    collapsed ? "lg:sr-only" : ""
                  }`}
                >
                  {section.label}
                </p>
                {collapsed && index > 0 && <div aria-hidden className="mx-3 mb-3 hidden h-px bg-rail-line lg:block" />}
                <ul className="flex flex-col gap-0.5">{section.items.map(renderLink)}</ul>
              </div>
            ))}
        </nav>

        <div className="relative flex shrink-0 flex-col gap-1 border-t border-rail-line p-3">
          <ul>{renderLink({ href: "/settings/password", label: t.nav.account, icon: "user" })}</ul>
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? t.nav.expand : t.nav.collapse}
            title={collapsed ? t.nav.expand : t.nav.collapse}
            className={`hidden h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium text-rail-ink-2 transition-colors hover:bg-rail-2/60 hover:text-rail-ink lg:flex ${
              collapsed ? "justify-center px-0" : ""
            }`}
          >
            <Icon name={collapsed ? "chevronsRight" : "chevronsLeft"} className="h-[1.125rem] w-[1.125rem]" />
            {!collapsed && <span>{t.nav.collapse}</span>}
          </button>
        </div>
      </aside>
    </>
  );
};
