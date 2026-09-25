"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/atoms/Alert";
import { Button } from "@/components/atoms/Button";
import { Field } from "@/components/atoms/Field";
import { Input } from "@/components/atoms/Input";
import { Skeleton } from "@/components/atoms/Skeleton";
import { Tag } from "@/components/atoms/Tag";
import { Card } from "@/components/molecules/Card";
import { Segmented } from "@/components/atoms/Segmented";
import { ConfirmButton } from "@/components/molecules/ConfirmButton";
import { InviteLinkNotice } from "@/components/molecules/InviteLinkNotice";
import { PasswordInput } from "@/components/molecules/PasswordInput";
import { Select } from "@/components/molecules/Select";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { errorMessage } from "@/common/api/errorMessage";
import { useI18n } from "@/common/i18n/I18nProvider";
import { useMe } from "@/hooks/useAuth";
import { ManagedUser, PASSWORD_MIN_LENGTH, UserRole, useCreateUser, useDeleteUser, useUpdateUser, useUsers } from "@/hooks/useUsers";
import { WorkspaceRole, inviteLink, useWorkspace } from "@/hooks/useWorkspaces";
import { usePublicSettings } from "@/hooks/useSettings";

const useRoleOptions = () => {
  const { t } = useI18n();
  return (["user", "admin"] as UserRole[]).map((role) => ({ value: role, label: t.nav.roles[role] }));
};

type Mode = "own" | "join";

/** Resultado del alta: la cuenta y, si el correo no salio, el enlace de activacion para compartir. */
type Created = { email: string; emailSent: boolean; link?: string };

/**
 * Alta de cuentas. La contrasena la elige la propia persona con el enlace de
 * activacion; aqui solo se decide donde entra: un espacio propio o uno ya
 * existente (el admin de plataforma administra todos).
 */
const CreateUserForm: React.FC = () => {
  const { t, locale } = useI18n();
  const roles = useRoleOptions();
  const { workspaces, current } = useWorkspace();
  const owned = workspaces.filter((workspace) => workspace.role === "owner");

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [mode, setMode] = useState<Mode>("own");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRole>("member");
  const [created, setCreated] = useState<Created | null>(null);
  const create = useCreateUser();

  // Por defecto, el espacio activo; si no, el primero de la lista.
  const joinId = workspaceId || String((owned.find((w) => w.id === current?.id) ?? owned[0])?.id ?? "");
  const canJoin = owned.length > 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreated(null);
    const address = email.trim();
    const result = await create.mutateAsync({
      email: address,
      role,
      mode,
      locale,
      ...(mode === "own"
        ? { workspaceName: workspaceName.trim() || undefined }
        : { workspaceId: Number(joinId), workspaceRole }),
    });
    setCreated({ email: address, emailSent: result.emailSent, link: result.invitePath ? inviteLink(result.invitePath) : undefined });
    setEmail("");
    setWorkspaceName("");
    setRole("user");
  };

  return (
    <Card title={t.users.newUser} description={t.users.adminHint} divider>
      <form className="flex flex-col gap-5" onSubmit={submit}>
        <Field label={t.users.email} info={t.fieldInfo.users.email}>
          <Input type="email" icon="mail" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" required />
        </Field>

        <Field label={t.users.mode} info={t.fieldInfo.users.mode}>
          <Segmented
            label={t.users.mode}
            value={mode}
            onChange={setMode}
            options={[
              { value: "own", label: t.users.modeOwn, icon: "layers" },
              { value: "join", label: t.users.modeJoin, icon: "users" },
            ]}
          />
        </Field>

        {mode === "own" ? (
          <Field label={t.users.workspaceName} hint={t.common.optional}>
            <Input
              icon="layers"
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder={t.users.workspaceNamePlaceholder(email.trim())}
              maxLength={120}
            />
          </Field>
        ) : canJoin ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.users.joinWorkspace}>
              <Select
                value={joinId}
                onChange={setWorkspaceId}
                options={owned.map((workspace) => ({ value: String(workspace.id), label: workspace.name }))}
                icon="layers"
              />
            </Field>
            <Field label={t.users.workspaceRole} info={t.workspace.roleHint}>
              <Select
                value={workspaceRole}
                onChange={setWorkspaceRole}
                options={(["member", "owner"] as WorkspaceRole[]).map((value) => ({ value, label: t.workspace.roles[value] }))}
                icon="shield"
              />
            </Field>
          </div>
        ) : (
          <Alert variant="info">{t.users.noOwnedWorkspaces}</Alert>
        )}

        <Field label={t.users.role} info={t.fieldInfo.users.role}>
          <Select value={role} onChange={setRole} options={roles} icon="shield" />
        </Field>

        {create.isError && <Alert variant="error">{errorMessage(create.error, t.common.unknownError)}</Alert>}
        {created && !create.isError && <CreatedNotice created={created} />}

        <Button type="submit" variant="primary" icon="plus" loading={create.isPending} disabled={mode === "join" && !canJoin}>
          {t.users.create}
        </Button>
      </form>
    </Card>
  );
};

const CreatedNotice: React.FC<{ created: Created }> = ({ created }) => {
  const { t } = useI18n();
  const { invitationTtlDays } = usePublicSettings();
  if (created.emailSent) return <Alert variant="success">{t.users.createdSent(created.email)}</Alert>;
  if (!created.link) return <Alert variant="success">{t.users.created(created.email)}</Alert>;
  return <InviteLinkNotice message={t.users.createdLink(created.email, invitationTtlDays)} link={created.link} />;
};


/**
 * Espacios de una cuenta, con su rol en cada uno. El admin de plataforma es
 * dueño de todos, asi que cada uno se abre directamente en su pagina de miembros.
 */
const UserWorkspaces: React.FC<{ workspaces: ManagedUser["workspaces"]; onOpen: (id: number) => void }> = ({ workspaces, onOpen }) => {
  const { t } = useI18n();
  if (workspaces.length === 0) return <span className="text-xs text-ink-3">{t.users.noWorkspaces}</span>;
  return (
    <ul className="flex max-w-xs flex-wrap gap-1">
      {workspaces.map((workspace) => (
        <li key={workspace.id}>
          <button
            type="button"
            title={t.users.openWorkspace(workspace.name)}
            onClick={() => onOpen(workspace.id)}
            className={`inline-flex max-w-[14rem] items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors hover:border-brand-solid hover:text-brand-ink ${
              workspace.role === "owner" ? "border-brand-soft bg-brand-soft/40 text-brand-ink" : "border-line text-ink-2"
            }`}
          >
            <span className="truncate">{workspace.name}</span>
            <span className="shrink-0 font-mono text-[0.625rem] uppercase tracking-wider opacity-70">{t.workspace.roles[workspace.role]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
};

const UserRow: React.FC<{ user: ManagedUser; isSelf: boolean; onOpenWorkspace: (id: number) => void }> = ({ user, isSelf, onOpenWorkspace }) => {
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
              <span className="mt-0.5 flex flex-wrap gap-1">
                {isSelf && <Tag tone="accent">{t.common.you}</Tag>}
                {user.isRoot && <Tag tone="brand">{t.users.root}</Tag>}
                {user.activatedAt === null && <Tag tone="warning">{t.users.pending}</Tag>}
                {user.twoFactorEnabled && <Tag tone="success" icon="shield">{t.users.twoFactor}</Tag>}
              </span>
            </span>
          </div>
        </td>
        <td className="border-b border-line px-4 py-3">
          <div className="w-40">
            <Select
              size="sm"
              label={t.users.role}
              value={user.role}
              disabled={update.isPending || user.isRoot}
              onChange={(role) => {
                setDone(null);
                update.mutate({ id: user.id, role });
              }}
              options={roles}
            />
          </div>
        </td>
        <td className="border-b border-line px-4 py-3">
          <UserWorkspaces workspaces={user.workspaces} onOpen={onOpenWorkspace} />
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
            {!isSelf && !user.isRoot && (
              <ConfirmButton onConfirm={() => remove.mutate(user.id)} confirmLabel={t.common.confirmRemove} pending={remove.isPending}>
                {t.common.remove}
              </ConfirmButton>
            )}
          </div>
        </td>
      </tr>

      {(reset || done || update.isError || remove.isError) && (
        <tr>
          <td colSpan={5} className="border-b border-line bg-surface-2/70 px-5 py-3">
            {reset && (
              <form className="flex flex-wrap items-center gap-2" onSubmit={applyPassword}>
                <PasswordInput
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
  const router = useRouter();
  const { switchTo } = useWorkspace();
  const users = useUsers();
  const data = users.data ?? [];

  // Abrir un espacio desde la lista: se activa y se va a sus miembros.
  const openWorkspace = (id: number) => {
    switchTo(id);
    router.push("/settings/workspace");
  };

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
                  {[t.users.columns.email, t.users.columns.role, t.users.columns.workspaces, t.users.columns.created, ""].map((label, index) => (
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
                  <UserRow key={user.id} user={user} isSelf={user.id === currentUserId} onOpenWorkspace={openWorkspace} />
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
