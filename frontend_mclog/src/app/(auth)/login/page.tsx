"use client";
import React, { useState } from "react";
import { AuthLayout } from "@/components/templates/AuthLayout";
import { PrimaryButton } from "@/components/atoms/PrimaryButton";
import { useLogin } from "@/hooks/useAuth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login.mutateAsync({ email, password });
      window.location.href = "/";
    } catch {
      // el estado de error de la mutación muestra el mensaje
    }
  };

  const pending = login.isPending;

  return (
    <AuthLayout title="Iniciar sesión" subtitle="Accede con tus credenciales de MCLog">
      <form className="flex flex-col gap-4" onSubmit={submit} aria-busy={pending}>
        <label className="text-sm font-medium text-slate-700">
          Correo
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-slate-50"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            autoComplete="email"
            required
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Contraseña
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-slate-50"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending}
            autoComplete="current-password"
            required
          />
        </label>
        <PrimaryButton type="submit" loading={pending}>
          Entrar
        </PrimaryButton>
        {login.isError && (
          <p className="text-sm text-red-600" role="alert">
            Credenciales inválidas o error de red
          </p>
        )}
      </form>
    </AuthLayout>
  );
}
