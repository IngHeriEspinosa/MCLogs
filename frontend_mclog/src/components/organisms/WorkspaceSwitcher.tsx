"use client";
import React, { useState } from "react";
import { Alert } from "@/components/atoms/Alert";
import { Button } from "@/components/atoms/Button";
import { Field } from "@/components/atoms/Field";
import { Icon } from "@/components/atoms/Icon";
import { Input } from "@/components/atoms/Input";
import { Dialog } from "@/components/molecules/Dialog";
import { Menu, MenuEntry } from "@/components/molecules/Menu";
import { useToast } from "@/components/molecules/Toast";
import { errorMessage } from "@/common/api/errorMessage";
import { useI18n } from "@/common/i18n/I18nProvider";
import { useMe } from "@/hooks/useAuth";
import { useCreateWorkspace, useRemoveMember, useWorkspace } from "@/hooks/useWorkspaces";
import { usePublicSettings } from "@/hooks/useSettings";

/** Dialogo para crear un espacio; al crearlo, pasa a ser el activo. */
export const CreateWorkspaceDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { t } = useI18n();
  const notify = useToast();
  const { switchTo } = useWorkspace();
  const create = useCreateWorkspace();
  const [name, setName] = useState("");

  const close = () => {
    setName("");
    create.reset();
    onClose();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const workspace = await create.mutateAsync(name.trim());
    switchTo(workspace.id);
    notify(t.workspace.created(workspace.name));
    close();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      icon="layers"
      title={t.workspace.createTitle}
      description={t.workspace.createDescription}
      size="sm"
    >
      <form className="flex flex-col gap-5" onSubmit={submit}>
        <Field label={t.workspace.name}>
          <Input
            icon="layers"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t.workspace.namePlaceholder}
            maxLength={120}
            autoFocus
            required
          />
        </Field>
        {create.isError && <Alert variant="error">{errorMessage(create.error, t.common.unknownError)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={close}>
            {t.common.cancel}
          </Button>
          <Button type="submit" variant="primary" icon="plus" loading={create.isPending} disabled={!name.trim()}>
            {t.workspace.create}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

/** Confirmacion para salir de un espacio del que se es miembro. */
const LeaveWorkspaceDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { t } = useI18n();
  const notify = useToast();
  const me = useMe();
  const { current } = useWorkspace();
  const remove = useRemoveMember();

  if (!current || !me.data) return null;

  const leave = async () => {
    await remove.mutateAsync({ workspaceId: current.id, userId: me.data.id });
    // /auth/me se recarga y useWorkspace pasa solo al siguiente espacio.
    notify(t.workspace.left(current.name));
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon="logout"
      title={t.workspace.leaveTitle(current.name)}
      description={t.workspace.leaveDescription}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="danger" icon="logout" loading={remove.isPending} onClick={leave}>
            {t.workspace.leave}
          </Button>
        </>
      }
    >
      {remove.isError && <Alert variant="error">{errorMessage(remove.error, t.common.unknownError)}</Alert>}
    </Dialog>
  );
};

/** Inicial del espacio, como marca visual en el selector y en el riel contraido. */
const WorkspaceBadge: React.FC<{ name: string; className?: string }> = ({ name, className = "" }) => (
  <span
    aria-hidden
    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-400/15 font-heading text-sm font-semibold text-[#5cb8e0] ring-1 ring-inset ring-[#5cb8e0]/25 ${className}`}
  >
    {name.charAt(0).toUpperCase()}
  </span>
);

/**
 * Selector del espacio de trabajo, en lo alto del riel. Muestra el espacio y
 * el rol actuales; desde el se cambia de espacio, se crea uno o se sale del
 * actual.
 */
export const WorkspaceSwitcher: React.FC<{ collapsed: boolean }> = ({ collapsed }) => {
  const { t } = useI18n();
  const notify = useToast();
  const { workspaces, current, switchTo } = useWorkspace();
  const { canCreateWorkspace } = usePublicSettings();
  const [creating, setCreating] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const items: MenuEntry[] = [
    { type: "label", key: "label", label: t.workspace.label },
    ...workspaces.map((workspace) => ({
      key: `ws-${workspace.id}`,
      label: workspace.name,
      hint: `${t.workspace.roles[workspace.role]} · ${t.workspace.members(workspace.memberCount)}`,
      checked: workspace.id === current?.id,
      onSelect: () => {
        if (workspace.id === current?.id) return;
        switchTo(workspace.id);
        notify(t.workspace.switched(workspace.name), "info");
      },
    })),
    { type: "separator", key: "sep" },
    ...(canCreateWorkspace
      ? [{ key: "create", label: t.workspace.create, icon: "plus" as const, onSelect: () => setCreating(true) }]
      : []),
    ...(current?.role === "member"
      ? [{ key: "leave", label: t.workspace.leave, icon: "logout" as const, danger: true, onSelect: () => setLeaving(true) }]
      : []),
  ];

  const name = current?.name ?? t.workspace.create;

  return (
    <div className={`relative px-3 pb-1 ${collapsed ? "lg:px-2" : ""}`}>
      <Menu
        label={t.workspace.switcher(name)}
        align="start"
        items={items}
        triggerClassName={`flex w-full items-center gap-2.5 rounded-lg border border-rail-line bg-rail-2/40 p-1.5 text-left transition-colors hover:bg-rail-2 ${
          collapsed ? "lg:justify-center lg:border-transparent lg:bg-transparent" : ""
        }`}
        trigger={
          <>
            <WorkspaceBadge name={name} />
            <span className={`min-w-0 flex-1 ${collapsed ? "lg:hidden" : ""}`}>
              <span className="block truncate text-sm font-semibold text-rail-ink">{name}</span>
              {current && (
                <span className="block truncate font-mono text-[0.625rem] uppercase tracking-[0.14em] text-rail-ink-2">
                  {t.workspace.roles[current.role]}
                </span>
              )}
            </span>
            <Icon name="chevronsUpDown" className={`h-4 w-4 shrink-0 text-rail-ink-2 ${collapsed ? "lg:hidden" : ""}`} />
          </>
        }
      />
      <CreateWorkspaceDialog open={creating} onClose={() => setCreating(false)} />
      <LeaveWorkspaceDialog open={leaving} onClose={() => setLeaving(false)} />
    </div>
  );
};
