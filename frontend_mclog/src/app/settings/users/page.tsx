"use client";
import React, { useState } from "react";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { Card } from "@/components/molecules/Card";
import { Alert } from "@/components/atoms/Alert";
import { Skeleton } from "@/components/atoms/Skeleton";
import { PrimaryButton } from "@/components/atoms/PrimaryButton";
import { ConfirmButton } from "@/components/molecules/ConfirmButton";
import { errorMessage } from "@/common/api/errorMessage";
import { useMe } from "@/hooks/useAuth";
import {
  ManagedUser,
  PASSWORD_MIN_LENGTH,
  UserRole,
  useCreateUser,
  useDeleteUser,
  useUpdateUser,
  useUsers,
} from "@/hooks/useUsers";

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";

const CreateUserForm: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [done, setDone] = useState<string | null>(null);
  const create = useCreateUser();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setDone(null);
    await create.mutateAsync({ email: email.trim(), password, role });
    setDone(email.trim());
    setEmail("");
    setPassword("");
    setRole("user");
  };

  return (
    <Card title="Nuevo usuario">
      <form className="flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={submit}>
        <label className="flex-1 text-sm font-medium text-slate-700">
          Correo
          <input
            type="email"
            className={`mt-1 ${inputClass}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            required
          />
        </label>
        <label className="flex-1 text-sm font-medium text-slate-700">
          Contraseña
          <input
            type="password"
            className={`mt-1 ${inputClass}`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            required
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Rol
          <select
            className={`mt-1 ${inputClass}`}
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <PrimaryButton type="submit" loading={create.isPending}>
          Crear
        </PrimaryButton>
      </form>

      <p className="mt-2 text-xs text-slate-500">
        Mínimo {PASSWORD_MIN_LENGTH} caracteres. Un <code className="font-mono">admin</code> puede además purgar logs y
        administrar claves y usuarios.
      </p>

      {create.isError && <Alert variant="error" className="mt-3">{errorMessage(create.error)}</Alert>}
      {done && !create.isError && (
        <Alert variant="success" className="mt-3">
          Usuario {done} creado. Ya puede iniciar sesión.
        </Alert>
      )}
    </Card>
  );
};

const UserRow: React.FC<{ user: ManagedUser; isSelf: boolean }> = ({ user, isSelf }) => {
  const update = useUpdateUser();
  const remove = useDeleteUser();
  const [newPassword, setNewPassword] = useState("");
  const [reset, setReset] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const applyPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setDone(null);
    await update.mutateAsync({ id: user.id, password: newPassword });
    setNewPassword("");
    setReset(false);
    setDone("Contraseña actualizada. Sus sesiones abiertas se han cerrado.");
  };

  return (
    <>
      <tr className="border-b border-slate-100">
        <td className="py-2 pr-4 font-medium">
          {user.email}
          {isSelf && <span className="ml-2 text-xs font-normal text-slate-500">(tú)</span>}
        </td>
        <td className="py-2 pr-4">
          <select
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
            value={user.role}
            disabled={update.isPending}
            onChange={(e) => {
              setDone(null);
              update.mutate({ id: user.id, role: e.target.value as UserRole });
            }}
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </td>
        <td className="py-2 pr-4 text-xs text-slate-500">{new Date(user.createdAt).toLocaleDateString()}</td>
        <td className="py-2 text-right">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setReset((value) => !value);
                setDone(null);
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {reset ? "Cancelar" : "Cambiar contraseña"}
            </button>
            {!isSelf && (
              <ConfirmButton
                onConfirm={() => remove.mutate(user.id)}
                confirmLabel="Sí, eliminar"
                pending={remove.isPending}
              >
                Eliminar
              </ConfirmButton>
            )}
          </div>
        </td>
      </tr>

      {(reset || done || update.isError || remove.isError) && (
        <tr className="border-b border-slate-100 bg-slate-50/70">
          <td colSpan={4} className="px-2 py-3">
            {reset && (
              <form className="flex flex-wrap items-center gap-2" onSubmit={applyPassword}>
                <input
                  type="password"
                  className="w-64 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                  placeholder={`Nueva contraseña (mín. ${PASSWORD_MIN_LENGTH})`}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={PASSWORD_MIN_LENGTH}
                  autoComplete="new-password"
                  required
                />
                <PrimaryButton type="submit" loading={update.isPending}>
                  Guardar
                </PrimaryButton>
                <span className="text-xs text-slate-500">Cerrará sus sesiones abiertas.</span>
              </form>
            )}
            {update.isError && <Alert variant="error" className="mt-2">{errorMessage(update.error)}</Alert>}
            {remove.isError && <Alert variant="error" className="mt-2">{errorMessage(remove.error)}</Alert>}
            {done && !update.isError && <Alert variant="success" className="mt-2">{done}</Alert>}
          </td>
        </tr>
      )}
    </>
  );
};

const UsersTable: React.FC<{ currentUserId?: number }> = ({ currentUserId }) => {
  const users = useUsers();

  if (users.isLoading) {
    return (
      <Card title="Usuarios">
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (users.isError) {
    return (
      <Card title="Usuarios">
        <Alert variant="error">{errorMessage(users.error, "No pudimos cargar los usuarios")}</Alert>
      </Card>
    );
  }

  const data = users.data ?? [];

  return (
    <Card title={`Usuarios (${data.length})`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-slate-800">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <th className="py-2 pr-4">Correo</th>
              <th className="py-2 pr-4">Rol</th>
              <th className="py-2 pr-4">Alta</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {data.map((user) => (
              <UserRow key={user.id} user={user} isSelf={user.id === currentUserId} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        No es posible eliminarse a uno mismo ni dejar el servicio sin ningún administrador: el backend rechaza ambas
        operaciones.
      </p>
    </Card>
  );
};

export default function UsersPage() {
  const me = useMe();

  if (me.isSuccess && me.data.role !== "admin") {
    return (
      <DashboardLayout title="Usuarios">
        <Alert variant="error">Esta sección requiere rol de administrador.</Alert>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Usuarios" bare>
      <CreateUserForm />
      <UsersTable currentUserId={me.data?.id} />
    </DashboardLayout>
  );
}
