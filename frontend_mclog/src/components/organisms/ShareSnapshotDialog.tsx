"use client";
// Organism: ShareSnapshotDialog (crear un snapshot de la vista de logs y dar su enlace)
import React, { useEffect, useState } from "react";
import { Alert } from "@/components/atoms/Alert";
import { Button, ButtonLink } from "@/components/atoms/Button";
import { Field } from "@/components/atoms/Field";
import { Input } from "@/components/atoms/Input";
import { Segmented } from "@/components/atoms/Segmented";
import { CopyButton } from "@/components/molecules/CopyButton";
import { Dialog } from "@/components/molecules/Dialog";
import { Select } from "@/components/molecules/Select";
import { errorMessage } from "@/common/api/errorMessage";
import { useI18n } from "@/common/i18n/I18nProvider";
import { toSnapshotFilters } from "@/common/snapshots/view";
import { isRelative, resolveRange } from "@/common/time/range";
import type { LogFilters } from "@/hooks/useLogFilters";
import { usePublicSettings } from "@/hooks/useSettings";
import {
  CreateSnapshotInput,
  SnapshotMeta,
  SnapshotVisibility,
  snapshotUrl,
  useCreateSnapshot,
} from "@/hooks/useSnapshots";
import { useWorkspace } from "@/hooks/useWorkspaces";

type Expiry = "1" | "7" | "30" | "never";

type ShareSnapshotDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Filtros de la vista. */
  filters: LogFilters;
  /** Registros aplica la busqueda por campo; Logs no. */
  advanced?: boolean;
  /** Logs que cumplen los filtros ahora, para avisar si no caben todos. */
  total: number | null;
};

/**
 * Captura la vista actual en un snapshot. Primero se elige quien lo ve y
 * cuando caduca; despues el dialogo muestra el enlace listo para copiar.
 */
export const ShareSnapshotDialog: React.FC<ShareSnapshotDialogProps> = ({
  open,
  onClose,
  filters,
  advanced = false,
  total,
}) => {
  const { t, fmt } = useI18n();
  const range = filters.range;
  const rangeLabel = isRelative(range)
    ? t.time.presets[range.preset]
    : `${fmt.dateTimeShort(range.from)} – ${range.to ? fmt.dateTimeShort(range.to) : t.time.now}`;
  const defaultTitle = t.snapshots.defaultTitle(rangeLabel, filters.application || undefined);
  const { isOwner } = useWorkspace();
  const { publicSnapshotsEnabled, maxSnapshotRows } = usePublicSettings();
  const create = useCreateSnapshot();

  const [title, setTitle] = useState(defaultTitle);
  const [visibility, setVisibility] = useState<SnapshotVisibility>("workspace");
  const [expiry, setExpiry] = useState<Expiry>("7");
  const [created, setCreated] = useState<SnapshotMeta | null>(null);

  // Cada apertura empieza de cero, con el titulo de la vista de ese momento.
  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle);
    setVisibility("workspace");
    setExpiry("7");
    setCreated(null);
    create.reset();
    // Solo al abrir: el titulo propuesto cambia con los filtros, lo escrito no.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canPublish = isOwner && publicSnapshotsEnabled;
  const publicBlocked = !publicSnapshotsEnabled ? t.snapshots.publicDisabled : !isOwner ? t.snapshots.publicOwnerOnly : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const input: CreateSnapshotInput = {
      title: title.trim(),
      visibility,
      expiresInDays: expiry === "never" ? null : (Number(expiry) as 1 | 7 | 30),
      // El rango se resuelve al crear: "ultimas 24 h" pasa a ser las 24 h hasta este momento.
      filters: toSnapshotFilters(filters, resolveRange(range, Date.now()), advanced),
    };
    try {
      setCreated(await create.mutateAsync(input));
    } catch {
      // el estado de error de la mutacion muestra el mensaje
    }
  };

  if (created) {
    const url = snapshotUrl(created.token);
    return (
      <Dialog
        open={open}
        onClose={onClose}
        icon="checkCircle"
        title={t.snapshots.created}
        description={t.snapshots.createdHint}
        footer={
          <Button variant="primary" onClick={onClose}>
            {t.snapshots.done}
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <Input value={url} readOnly aria-label={t.snapshots.copyLink} className="font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
          <div className="flex flex-wrap gap-2">
            <CopyButton text={url} label={t.snapshots.copyLink} icon="copy" variant="primary" />
            <ButtonLink href={`/s/${encodeURIComponent(created.token)}`} target="_blank" rel="noopener noreferrer" icon="externalLink">
              {t.snapshots.open}
            </ButtonLink>
          </div>
          {created.redacted && <Alert variant="info">{t.snapshots.redactNote}</Alert>}
        </div>
      </Dialog>
    );
  }

  const pending = create.isPending;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon="camera"
      title={t.snapshots.dialogTitle}
      description={t.snapshots.dialogDescription}
      size="lg"
    >
      <form className="flex flex-col gap-5" onSubmit={submit} aria-busy={pending}>
        <Field label={t.snapshots.titleLabel} info={t.fieldInfo.snapshots.title}>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t.snapshots.titlePlaceholder}
            maxLength={160}
            disabled={pending}
            required
            autoFocus
          />
        </Field>

        <Field
          label={t.snapshots.visibility}
          info={t.fieldInfo.snapshots.visibility}
          hint={visibility === "public" ? t.snapshots.visibilityPublicHint : publicBlocked ?? t.snapshots.visibilityWorkspaceHint}
        >
          <Segmented
            label={t.snapshots.visibility}
            value={visibility}
            onChange={(next) => (next === "public" && !canPublish ? undefined : setVisibility(next))}
            options={[
              { value: "workspace", label: t.snapshots.visibilityWorkspace, icon: "users" },
              { value: "public", label: t.snapshots.visibilityPublic, icon: canPublish ? "globe" : "lock" },
            ]}
          />
        </Field>

        <Field label={t.snapshots.expiry} info={t.fieldInfo.snapshots.expiry}>
          <Select
            value={expiry}
            onChange={setExpiry}
            icon="clock"
            disabled={pending}
            options={(["1", "7", "30", "never"] as const).map((value) => ({ value, label: t.snapshots.expiryOptions[value] }))}
          />
        </Field>

        {total !== null && (
          <p className="text-sm text-ink-3">
            {total > maxSnapshotRows
              ? t.snapshots.rowsCapped(fmt.number(maxSnapshotRows), fmt.number(total))
              : t.snapshots.rowsAll(fmt.number(total))}
          </p>
        )}
        {visibility === "public" && <Alert variant="info">{t.snapshots.redactNote}</Alert>}
        {create.isError && <Alert variant="error">{errorMessage(create.error, t.snapshots.createError)}</Alert>}

        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t.common.cancel}
          </Button>
          <Button type="submit" variant="primary" icon="share" loading={pending} disabled={!title.trim()}>
            {t.snapshots.create}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
