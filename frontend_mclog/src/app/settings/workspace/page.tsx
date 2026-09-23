"use client";
import React, { useEffect, useState } from "react";
import { Alert } from "@/components/atoms/Alert";
import { Button } from "@/components/atoms/Button";
import { Field } from "@/components/atoms/Field";
import { Input } from "@/components/atoms/Input";
import { Skeleton } from "@/components/atoms/Skeleton";
import { Tag } from "@/components/atoms/Tag";
import { Card } from "@/components/molecules/Card";
import { ConfirmButton } from "@/components/molecules/ConfirmButton";
import { InviteLinkNotice } from "@/components/molecules/InviteLinkNotice";
import { Select } from "@/components/molecules/Select";
import { useToast } from "@/components/molecules/Toast";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { errorMessage } from "@/common/api/errorMessage";
import { useI18n } from "@/common/i18n/I18nProvider";
import { useMe } from "@/hooks/useAuth";
import { usePublicSettings } from "@/hooks/useSettings";
import {
  InviteResult,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
  inviteLink,
  useAddMember,
  useDeleteWorkspace,
  useMembers,
  useRemoveMember,
  useRenameWorkspace,
  useResendInvite,
  useUpdateMember,
  useWorkspace,
} from "@/hooks/useWorkspaces";

const useRoleOptions = () => {
  const { t } = useI18n();
  return (["member", "owner"] as WorkspaceRole[]).map((role) => ({ value: role, label: t.workspace.roles[role] }));
};

const GeneralCard: React.FC<{ workspace: Workspace }> = ({ workspace }) => {
  const { t } = useI18n();
  const notify = useToast();
  const rename = useRenameWorkspace();
  const [name, setName] = useState(workspace.name);

  useEffect(() => setName(workspace.name), [workspace.name]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await rename.mutateAsync({ id: workspace.id, name: name.trim() });
    notify(t.workspace.renamed);
  };

  return (
    <Card title={t.workspace.general} description={t.workspace.generalHint} divider>
      <form className="flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={submit}>
        <Field label={t.workspace.name} className="flex-1">
          <Input icon="layers" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required />
        </Field>
        <Button type="submit" variant="secondary" loading={rename.isPending} disabled={!name.trim() || name.trim() === workspace.name}>
          {t.common.save}
        </Button>
      </form>
      {rename.isError && <Alert variant="error" className="mt-3">{errorMessage(rename.error, t.common.unknownError)}</Alert>}
    </Card>
  );
};

/** Mensaje tras invitar: por correo, con enlace para compartir o, si ya tenia cuenta, acceso inmediato. */
const InviteOutcome: React.FC<{ email: string; result: Pick<InviteResult, "created" | "emailSent" | "invitePath"> }> = ({ email, result }) => {
  const { t } = useI18n();
  const { invitationTtlDays } = usePublicSettings();
  if (result.invitePath) {
    return <InviteLinkNotice message={t.workspace.shareLink(email, invitationTtlDays)} link={inviteLink(result.invitePath)} />;
  }
  if (result.emailSent && result.created) return <Alert variant="success">{t.workspace.invitedSent(email)}</Alert>;
  return <Alert variant="success">{t.workspace.addedExisting(email)}</Alert>;
};

const InviteCard: React.FC<{ workspace: Workspace }> = ({ workspace }) => {
  const { t, locale } = useI18n();
  const roles = useRoleOptions();
  const add = useAddMember();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [outcome, setOutcome] = useState<{ email: string; result: InviteResult } | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setOutcome(null);
    const address = email.trim();
    const result = await add.mutateAsync({ workspaceId: workspace.id, email: address, role, locale });
    setOutcome({ email: address, result });
    setEmail("");
    setRole("member");
  };

  return (
    <Card title={t.workspace.invite} description={t.workspace.inviteHint} divider>
      <form className="flex flex-col gap-5" onSubmit={submit}>
        <Field label={t.workspace.email}>
          <Input type="email" icon="mail" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" required />
        </Field>
        <Field label={t.workspace.role} info={t.workspace.roleHint}>
          <Select value={role} onChange={setRole} options={roles} icon="shield" />
        </Field>
        {add.isError && <Alert variant="error">{errorMessage(add.error, t.common.unknownError)}</Alert>}
        {outcome && !add.isError && <InviteOutcome email={outcome.email} result={outcome.result} />}
        <Button type="submit" variant="primary" icon="send" loading={add.isPending}>
          {t.workspace.inviteSubmit}
        </Button>
      </form>
    </Card>
  );
};

const MemberRow: React.FC<{ workspaceId: number; member: WorkspaceMember; isSelf: boolean }> = ({ workspaceId, member, isSelf }) => {
  const { t, fmt, locale } = useI18n();
  const roles = useRoleOptions();
  const update = useUpdateMember();
  const remove = useRemoveMember();
  const resend = useResendInvite();
  const { invitationTtlDays } = usePublicSettings();

  const error = update.error ?? remove.error ?? resend.error;

  return (
    <>
      <tr className="transition-colors hover:bg-surface-2">
        <td className="border-b border-line py-3 pl-5 pr-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft font-heading text-sm font-semibold text-brand-ink">
              {member.email.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-ink">{member.email}</span>
              <span className="mt-0.5 flex flex-wrap gap-1">
                {isSelf && <Tag tone="accent">{t.common.you}</Tag>}
                {member.pending && <Tag tone="warning">{t.workspace.pending}</Tag>}
                {member.twoFactorEnabled && <Tag tone="success" icon="shield">{t.users.twoFactor}</Tag>}
              </span>
            </span>
          </div>
        </td>
        <td className="border-b border-line px-4 py-3">
          <div className="w-36">
            <Select
              size="sm"
              label={t.workspace.role}
              value={member.role}
              disabled={update.isPending}
              onChange={(role) => update.mutate({ workspaceId, userId: member.userId, role })}
              options={roles}
            />
          </div>
        </td>
        <td className="whitespace-nowrap border-b border-line px-4 py-3 text-xs text-ink-2">{fmt.date(member.joinedAt)}</td>
        <td className="border-b border-line py-3 pl-4 pr-5">
          <div className="flex justify-end gap-1">
            {member.pending && (
              <Button
                size="sm"
                variant="ghost"
                icon="send"
                loading={resend.isPending}
                onClick={() => resend.mutate({ workspaceId, userId: member.userId, locale })}
              >
                {t.workspace.resend}
              </Button>
            )}
            <ConfirmButton
              onConfirm={() => remove.mutate({ workspaceId, userId: member.userId })}
              confirmLabel={t.common.confirmRemove}
              pending={remove.isPending}
            >
              {isSelf ? t.workspace.leaveSelf : t.workspace.remove}
            </ConfirmButton>
          </div>
        </td>
      </tr>
      {(error || resend.data) && (
        <tr>
          <td colSpan={4} className="border-b border-line bg-surface-2/70 px-5 py-3">
            {error ? (
              <Alert variant="error">{errorMessage(error, t.common.unknownError)}</Alert>
            ) : resend.data?.invitePath ? (
              <InviteLinkNotice message={t.workspace.shareLink(member.email, invitationTtlDays)} link={inviteLink(resend.data.invitePath)} />
            ) : (
              <Alert variant="success">{t.workspace.invitedSent(member.email)}</Alert>
            )}
          </td>
        </tr>
      )}
    </>
  );
};

const MembersCard: React.FC<{ workspace: Workspace }> = ({ workspace }) => {
  const { t } = useI18n();
  const me = useMe();
  const members = useMembers(workspace.id);
  const { maxWorkspaceMembers } = usePublicSettings();
  const data = members.data ?? [];
  // Con limite configurado se muestra "3 de 10", para saber cuanto queda antes de invitar.
  const count = maxWorkspaceMembers > 0 ? t.workspace.memberLimit(data.length, maxWorkspaceMembers) : String(data.length);

  return (
    <Card title={`${t.workspace.list} · ${count}`} divider flush>
      {members.isLoading ? (
        <div className="flex flex-col gap-2 p-5">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : members.isError ? (
        <div className="p-5">
          <Alert variant="error">{errorMessage(members.error, t.workspace.loadError)}</Alert>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-surface-2 text-left">
                  {[t.workspace.columns.email, t.workspace.columns.role, t.workspace.columns.joined, ""].map((label, index) => (
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
                {data.map((member) => (
                  <MemberRow key={member.userId} workspaceId={workspace.id} member={member} isSelf={member.userId === me.data?.id} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-xs text-ink-3">{t.workspace.guard}</p>
        </>
      )}
    </Card>
  );
};

const DangerCard: React.FC<{ workspace: Workspace }> = ({ workspace }) => {
  const { t } = useI18n();
  const notify = useToast();
  const remove = useDeleteWorkspace();
  const [confirmName, setConfirmName] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await remove.mutateAsync({ id: workspace.id, confirmName });
    // /auth/me se recarga y useWorkspace pasa solo al siguiente espacio.
    notify(t.workspace.deleted(workspace.name));
    setConfirmName("");
  };

  return (
    <Card title={t.workspace.danger} description={t.workspace.deleteHint} divider>
      <form className="flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={submit}>
        <Field label={t.workspace.deleteConfirm(workspace.name)} className="flex-1">
          <Input value={confirmName} onChange={(event) => setConfirmName(event.target.value)} autoComplete="off" required />
        </Field>
        <Button type="submit" variant="danger" icon="trash" loading={remove.isPending} disabled={confirmName !== workspace.name}>
          {t.workspace.deleteSubmit}
        </Button>
      </form>
      {remove.isError && <Alert variant="error" className="mt-3">{errorMessage(remove.error, t.common.unknownError)}</Alert>}
    </Card>
  );
};

/** Administracion del espacio activo: solo para su dueño. */
export default function WorkspaceSettingsPage() {
  const { t } = useI18n();
  const { current, ready, isOwner } = useWorkspace();

  if (ready && current && !isOwner) {
    return (
      <DashboardLayout title={t.workspace.title} eyebrow={t.workspace.eyebrow} width="narrow">
        <Alert variant="error">{t.common.ownerOnly}</Alert>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title={t.workspace.title}
      eyebrow={current ? `${t.workspace.eyebrow} · ${current.name}` : t.workspace.eyebrow}
      description={current ? t.workspace.description(current.name) : undefined}
    >
      {/* En una columna, los miembros van justo tras invitar; en dos, ocupan
          la derecha entera y los ajustes del espacio se apilan a la izquierda. */}
      {current && (
        <div className="grid items-start gap-4 2xl:grid-cols-[26rem_minmax(0,1fr)] 3xl:gap-5">
          <div className="2xl:col-start-1">
            <InviteCard workspace={current} />
          </div>
          <div className="2xl:col-start-2 2xl:row-span-3 2xl:row-start-1">
            <MembersCard workspace={current} />
          </div>
          <div className="2xl:col-start-1">
            <GeneralCard workspace={current} />
          </div>
          <div className="2xl:col-start-1">
            <DangerCard workspace={current} />
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
