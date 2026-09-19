// Template: AuthLayout (flujo de autenticación)
import React from "react";
import { Card } from "@/components/molecules/Card";

export const AuthLayout: React.FC<{ children: React.ReactNode; title: string; subtitle?: string }> = ({ children, title, subtitle }) => (
  <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-primary-600">MCLog</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}
      </div>
      <Card>{children}</Card>
    </div>
  </main>
);
