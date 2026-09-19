// Template: DashboardLayout (shell principal)
import React from "react";
import { Card } from "@/components/molecules/Card";

export const DashboardLayout: React.FC<{ children: React.ReactNode; title: string; actions?: React.ReactNode }> = ({ children, title, actions }) => (
  <main className="min-h-screen bg-slate-50">
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary-600">MCLog</p>
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        </div>
        {actions}
      </div>
    </header>
    <section className="mx-auto max-w-5xl px-4 py-8 flex flex-col gap-4">
      <Card>{children}</Card>
    </section>
  </main>
);
