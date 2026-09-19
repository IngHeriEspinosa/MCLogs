"use client";
// Template: DashboardLayout (shell principal con navegacion y sesion)
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Card } from "@/components/molecules/Card";
import { useLogout, useMe } from "@/hooks/useAuth";

type NavItem = { href: string; label: string; adminOnly?: boolean };

const NAV: NavItem[] = [
  { href: "/", label: "Logs" },
  { href: "/errors", label: "Errores" },
  { href: "/settings/api-keys", label: "API keys", adminOnly: true },
  { href: "/settings/users", label: "Usuarios", adminOnly: true },
  { href: "/settings/password", label: "Mi cuenta" },
];

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);

export const DashboardLayout: React.FC<{
  children: React.ReactNode;
  title: string;
  actions?: React.ReactNode;
  /** true para no envolver el contenido en una tarjeta (paginas con varias secciones). */
  bare?: boolean;
}> = ({ children, title, actions, bare }) => {
  const pathname = usePathname();
  const me = useMe();
  const logout = useLogout();
  const visibles = NAV.filter((item) => !item.adminOnly || me.data?.role === "admin");

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 pt-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary-600">MCLog</p>
            <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            {actions}
            {me.data && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="hidden sm:inline">{me.data.email}</span>
                <button
                  type="button"
                  onClick={() => logout.mutate()}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Salir
                </button>
              </div>
            )}
          </div>
        </div>

        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pt-3" aria-label="Secciones">
          {visibles.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "border-primary-600 text-primary-700"
                    : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <section className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8">
        {bare ? children : <Card>{children}</Card>}
      </section>
    </main>
  );
};
