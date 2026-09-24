"use client";
// Organism: ShareSnapshotDialog (crear un snapshot de Logs, Registros, Errores o una Traza y dar su enlace)
import React, { useEffect, useState } from "react";
import axios from "axios";
import { Alert } from "@/components/atoms/Alert";
import { Button, ButtonLink } from "@/components/atoms/Button";
import { Field } from "@/components/atoms/Field";
import { Input } from "@/components/atoms/Input";
import { Segmented } from "@/components/atoms/Segmented";
import { CopyButton } from "@/components/molecules/CopyButton";
import { Dialog } from "@/components/molecules/Dialog";
import { Select } from "@/components/molecules/Select";
import { useI18n } from "@/common/i18n/I18nProvider";
import { toSnapshotFilters } from "@/common/snapshots/view";
import { isRelative, resolveRange, TimeRange } from "@/common/time/range";
import type { LogFilters } from "@/hooks/useLogFilters";
import { usePublicSettings } from "@/hooks/useSettings";
import {
  CreateSnapshotInput,
  SnapshotFilters,
  SnapshotKind,
  SnapshotMeta,
  SnapshotVisibility,
  snapshotUrl,
  useCreateSnapshot,
} from "@/hooks/useSnapshots";
import { useWorkspace } from "@/hooks/useWorkspaces";

type Expiry = "1" | "7" | "30" | "never";

/** La pantalla que se comparte, con lo que hace falta para capturarla. */
export type ShareSource =
  /** Logs o Registros. Registros aplica la busqueda por campo (`advanced`); Logs no. */
  | { kind: "logs"; filters: LogFilters; advanced?: boolean }
  | { kind: "errors"; range: TimeRange; level: "error" | "warn"; application: string; environment: string }
  | { kind: "trace"; traceId: string };

type ShareSnapshotDialogProps = {
  open: boolean;
  onClose: () => void;
  source: ShareSource;
  /**
   * Lo que hay ahora en pantalla, para avisar de lo que se guardara: logs que
   * cumplen los filtros, fallos distintos o registros de la traza.
   */
  total: number | null;
};

/**
 * Los filtros que espera el backend. El rango se resuelve al crear: "ultimas
 * 24 h" pasa a ser las 24 h hasta este momento.
 */
const filtersOf = (source: ShareSource): SnapshotFilters => {
  if (source.kind === "logs") return toSnapshotFilters(source.filters, resolveRange(source.filters.range, Date.now()), source.advanced ?? false);
  if (source.kind === "trace") return { traceId: source.traceId };
  const resolved = resolveRange(source.range, Date.now());
  return {
    level: source.level,
    ...(source.application ? { application: source.application } : {}),
    ...(source.environment ? { environment: source.environment } : {}),
    from: resolved.from?.toISOString(),
    to: resolved.to?.toISOString(),
  };
};

const rangeOf = (source: ShareSource): TimeRange | null =>
  source.kind === "logs" ? source.filters.range : source.kind === "errors" ? source.range : null;

const kindOf = (source: ShareSource): SnapshotKind => source.kind;

/**
 * Captura la vista actual en un snapshot. Primero se elige quien lo ve y
 * cuando caduca; despues el dialogo muestra el enlace listo para copiar.
 */
export const ShareSnapshotDialog: React.FC<ShareSnapshotDialogProps> = ({ open, onClose, source, total }) => {
  const { t, fmt } = useI18n();
  const range = rangeOf(source);
  const rangeLabel = !range
    ? ""
    : isRelative(range)
      ? t.time.presets[range.preset]
      : `${fmt.dateTimeShort(range.from)} – ${range.to ? fmt.dateTimeShort(range.to) : t.time.now}`;
  const defaultTitle =
    source.kind === "trace"
      ? t.snapshots.defaultTitleTrace(source.traceId.length > 16 ? `${source.traceId.slice(0, 16)}…` : source.traceId)
      : source.kind === "errors"
        ? t.snapshots.defaultTitleErrors(source.level === "warn" ? t.errors.levelWarnings : t.errors.levelErrors, rangeLabel, source.application || undefined)
        : t.snapshots.defaultTitle(rangeLabel, source.filters.application || undefined);
  const { isOwner } = useWorkspace();
  const { publicSnapshotsEnabled, maxSnapshotRows, maxSnapshotsPerWorkspace } = usePublicSettings();
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

  // Los rechazos previsibles, en el idioma del panel: el backend responde en ingles.
  const failure = (error: unknown) => {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 409) return t.snapshots.limitReached(fmt.number(maxSnapshotsPerWorkspace));
    if (status === 403) return publicBlocked ?? t.snapshots.createError;
    return t.snapshots.createError;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const input: CreateSnapshotInput = {
      title: title.trim(),
      kind: kindOf(source),
      visibility,
      expiresInDays: expiry === "never" ? null : (Number(expiry) as 1 | 7 | 30),
      filters: filtersOf(source),
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
            onChange={setVisibility}
            options={[
              { value: "workspace", label: t.snapshots.visibilityWorkspace, icon: "users" },
              { value: "public", label: t.snapshots.visibilityPublic, icon: canPublish ? "globe" : "lock", disabled: !canPublish },
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
            {source.kind === "errors"
              ? t.snapshots.rowsErrors(fmt.number(total))
              : source.kind === "trace"
                ? total > maxSnapshotRows
                  ? t.snapshots.rowsTraceCapped(fmt.number(maxSnapshotRows), fmt.number(total))
                  : t.snapshots.rowsTrace(fmt.number(total))
                : total > maxSnapshotRows
                  ? t.snapshots.rowsCapped(fmt.number(maxSnapshotRows), fmt.number(total))
                  : t.snapshots.rowsAll(fmt.number(total))}
          </p>
        )}
        {visibility === "public" && <Alert variant="info">{t.snapshots.redactNote}</Alert>}
        {create.isError && <Alert variant="error">{failure(create.error)}</Alert>}

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
