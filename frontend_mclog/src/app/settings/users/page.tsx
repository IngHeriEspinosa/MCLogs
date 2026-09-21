"use client";
import React, { useState } from "react";
import { Alert } from "@/components/atoms/Alert";
import { Button } from "@/components/atoms/Button";
import { Field } from "@/components/atoms/Field";
import { Input } from "@/components/atoms/Input";
import { Skeleton } from "@/components/atoms/Skeleton";
import { Tag } from "@/components/atoms/Tag";
import { Card } from "@/components/molecules/Card";
import { ConfirmButton } from "@/components/molecules/ConfirmButton";
import { Select } from "@/components/molecules/Select";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { errorMessage } from "@/common/api/errorMessage";
import { useI18n } from "@/common/i18n/I18nProvider";
import { useMe } from "@/hooks/useAuth";
import { ManagedUser, PASSWORD_MIN_LENGTH, UserRole, useCreateUser, useDeleteUser, useUpdateUser, useUsers } from "@/hooks/useUsers";

const useRoleOptions = () => {
  const { t } = useI18n();
  return (["user", "admin"] as UserRole[]).map((role) => ({ value: role, label: t.nav.roles[role] }));
};

const CreateUserForm: React.FC = () => {
  const { t } = useI18n();
  const roles = useRoleOptions();
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
    <Card title={t.users.newUser} description={t.users.adminHint} divider>
      <form className="flex flex-col gap-5" onSubmit={submit}>
        <Field label={t.users.email}>
          <Input type="email" icon="mail" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" required />
        </Field>
        <Field label={t.users.password} hint={t.users.passwordHint(PASSWORD_MIN_LENGTH)}>
          <Input
            type="password"
            icon="lock"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            required
          />
        </Field>
        <Field label={t.users.role}>
          <Select value={role} onChange={setRole} options={roles} icon="shield" />
        </Field>

        {create.isError && <Alert variant="error">{errorMessage(create.error, t.common.unknownError)}</Alert>}
        {done && !create.isError && <Alert variant="success">{t.users.created(done)}</Alert>}

        <Button type="submit" variant="primary" icon="plus" loading={create.isPending}>
          {t.users.create}
        </Button>
      </form>
    </Card>
  );
};

const UserRow: React.FC<{ user: ManagedUser; isSelf: boolean }> = ({ user, isSelf }) => {
  const { t, fmt } = useI18n();
  const roles = useRoleOptions();
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
    setDone(t.users.passwordUpdated);
  };

  return (
    <>
      <tr className="transition-colors hover:bg-surface-2">
        <td className="border-b border-line py-3 pl-5 pr-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft font-heading text-sm font-semibold text-brand-ink">
              {user.email.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-ink">{user.email}</span>
              {isSelf && <Tag tone="accent" className="mt-0.5">{t.common.you}</Tag>}
            </span>
          </div>
        </td>
        <td className="border-b border-line px-4 py-3">
          <div className="w-40">
            <Select
              size="sm"
              label={t.users.role}
              value={user.role}
              disabled={update.isPending}
              onChange={(role) => {
                setDone(null);
                update.mutate({ id: user.id, role });
              }}
              options={roles}
            />
          </div>
        </td>
        <td className="whitespace-nowrap border-b border-line px-4 py-3 text-xs text-ink-2">{fmt.date(user.createdAt)}</td>
        <td className="border-b border-line py-3 pl-4 pr-5">
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              icon={reset ? "x" : "key"}
              onClick={() => {
                setReset((value) => !value);
                setDone(null);
              }}
            >
              {reset ? t.common.cancel : t.users.changePassword}
            </Button>
            {!isSelf && (
              <ConfirmButton onConfirm={() => remove.mutate(user.id)} confirmLabel={t.common.confirmRemove} pending={remove.isPending}>
                {t.common.remove}
              </ConfirmButton>
            )}
          </div>
        </td>
      </tr>

      {(reset || done || update.isError || remove.isError) && (
        <tr>
          <td colSpan={4} className="border-b border-line bg-surface-2/70 px-5 py-3">
            {reset && (
              <form className="flex flex-wrap items-center gap-2" onSubmit={applyPassword}>
                <Input
                  type="password"
                  icon="lock"
                  size="sm"
                  wrapperClassName="w-72"
                  placeholder={t.users.newPassword(PASSWORD_MIN_LENGTH)}
                  aria-label={t.users.newPassword(PASSWORD_MIN_LENGTH)}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  minLength={PASSWORD_MIN_LENGTH}
                  autoComplete="new-password"
                  required
                />
                <Button type="submit" size="sm" variant="primary" loading={update.isPending}>
                  {t.common.save}
                </Button>
                <span className="text-xs text-ink-3">{t.users.closesSessions}</span>
              </form>
            )}
            {update.isError && <Alert variant="error" className="mt-2">{errorMessage(update.error, t.common.unknownError)}</Alert>}
            {remove.isError && <Alert variant="error" className="mt-2">{errorMessage(remove.error, t.common.unknownError)}</Alert>}
            {done && !update.isError && <Alert variant="success" className={reset ? "mt-2" : ""}>{done}</Alert>}
          </td>
        </tr>
      )}
    </>
  );
};

const UsersTable: React.FC<{ currentUserId?: number }> = ({ currentUserId }) => {
  const { t } = useI18n();
  const users = useUsers();
  const data = users.data ?? [];

  return (
    <Card title={`${t.users.list} · ${data.length}`} divider flush>
      {users.isLoading ? (
        <div className="flex flex-col gap-2 p-5">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : users.isError ? (
        <div className="p-5">
          <Alert variant="error">{errorMessage(users.error, t.users.loadError)}</Alert>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-surface-2 text-left">
                  {[t.users.columns.email, t.users.columns.role, t.users.columns.created, ""].map((label, index) => (
                    <th
                      key={index}
                      scope="col"
                      className="whitespace-nowrap border-b border-line px-4 py-2.5 font-mono text-[0.6875rem] font-medium uppercase tracking-wider text-ink-3 first:pl-5"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((user) => (
                  <UserRow key={user.id} user={user} isSelf={user.id === currentUserId} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-xs text-ink-3">{t.users.guard}</p>
        </>
      )}
    </Card>
  );
};

export default function UsersPage() {
  const { t } = useI18n();
  const me = useMe();

  if (me.isSuccess && me.data.role !== "admin") {
    return (
      <DashboardLayout title={t.users.title} eyebrow={t.users.eyebrow} width="narrow">
        <Alert variant="error">{t.common.adminOnly}</Alert>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={t.users.title} eyebrow={t.users.eyebrow} description={t.users.description}>
      <div className="grid items-start gap-4 2xl:grid-cols-[26rem_minmax(0,1fr)] 3xl:gap-5">
        <CreateUserForm />
        <UsersTable currentUserId={me.data?.id} />
      </div>
    </DashboardLayout>
  );
}
