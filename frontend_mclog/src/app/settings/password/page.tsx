"use client";
import React, { useState } from "react";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { Card } from "@/components/molecules/Card";
import { Alert } from "@/components/atoms/Alert";
import { PrimaryButton } from "@/components/atoms/PrimaryButton";
import { errorMessage } from "@/common/api/errorMessage";
import { useChangePassword, useMe } from "@/hooks/useAuth";
import { PASSWORD_MIN_LENGTH } from "@/hooks/useUsers";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";

export default function PasswordPage() {
  const me = useMe();
  const change = useChangePassword();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeated, setRepeated] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError(null);

    if (newPassword !== repeated) {
      setLocalError("Las dos contraseñas nuevas no coinciden.");
      return;
    }

    await change.mutateAsync({ currentPassword, newPassword });
    setDone(true);
    setCurrentPassword("");
    setNewPassword("");
    setRepeated("");

    // El backend revoca todos los refresh tokens, incluido el de esta sesion,
    // asi que hay que volver a entrar. Se deja leer el mensaje antes de salir.
    setTimeout(() => {
      window.location.href = "/login";
    }, 2500);
  };

  return (
    <DashboardLayout title="Mi cuenta" bare>
      <Card title="Datos de la sesión">
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-slate-500">Correo</dt>
          <dd className="font-medium text-slate-800">{me.data?.email ?? "—"}</dd>
          <dt className="text-slate-500">Rol</dt>
          <dd className="font-medium text-slate-800">{me.data?.role ?? "—"}</dd>
        </dl>
      </Card>

      <Card title="Cambiar contraseña">
        <form className="flex max-w-md flex-col gap-4" onSubmit={submit}>
          <label className="text-sm font-medium text-slate-700">
            Contraseña actual
            <input
              type="password"
              className={inputClass}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Contraseña nueva
            <input
              type="password"
              className={inputClass}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              required
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Mínimo {PASSWORD_MIN_LENGTH} caracteres y distinta de la actual.
            </span>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Repite la contraseña nueva
            <input
              type="password"
              className={inputClass}
              value={repeated}
              onChange={(e) => setRepeated(e.target.value)}
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              required
            />
          </label>

          {localError && <Alert variant="error">{localError}</Alert>}
          {change.isError && <Alert variant="error">{errorMessage(change.error)}</Alert>}
          {done && (
            <Alert variant="success">
              Contraseña actualizada. Se han cerrado todas tus sesiones; vamos al inicio de sesión.
            </Alert>
          )}

          <div>
            <PrimaryButton type="submit" loading={change.isPending} disabled={done}>
              Cambiar contraseña
            </PrimaryButton>
          </div>

          <p className="text-xs text-slate-500">
            Cambiarla cierra la sesión en todos los dispositivos, incluido este.
          </p>
        </form>
      </Card>
    </DashboardLayout>
  );
}
