"use client";
import React, { useMemo, useState } from "react";
import { Alert } from "@/components/atoms/Alert";
import { Button } from "@/components/atoms/Button";
import { EmptyState } from "@/components/atoms/EmptyState";
import { Input } from "@/components/atoms/Input";
import { Skeleton } from "@/components/atoms/Skeleton";
import { Switch } from "@/components/atoms/Switch";
import { Tag } from "@/components/atoms/Tag";
import { Card } from "@/components/molecules/Card";
import { useToast } from "@/components/molecules/Toast";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { errorMessage } from "@/common/api/errorMessage";
import { useI18n } from "@/common/i18n/I18nProvider";
import type { Dictionary } from "@/common/i18n/dictionaries";
import { useMe } from "@/hooks/useAuth";
import {
  Setting,
  SettingCategory,
  useResetSetting,
  useSettings,
  useSettingsHistory,
  useUpdateSettings,
} from "@/hooks/useSettings";

const CATEGORIES: SettingCategory[] = ["workspaces", "logs", "features", "security"];

type SettingKey = keyof Dictionary["settings"]["keys"];

/** Borrador de la pagina: numeros como texto, para poder vaciar el campo mientras se escribe. */
type Draft = Record<string, string | boolean>;

const keyCopy = (t: Dictionary, key: string) =>
  t.settings.keys[key as SettingKey] as { label: string; description: string; unit?: string } | undefined;

/** Valor que se enviaria para una clave del borrador, o el error que lo impide. */
const parseDraft = (setting: Setting, raw: string | boolean, t: Dictionary): { value?: number | boolean; error?: string } => {
  if (setting.type === "boolean") return { value: raw as boolean };
  const text = String(raw).trim();
  const value = Number(text);
  if (text === "" || !Number.isInteger(value) || value < (setting.min ?? 0) || value > (setting.max ?? Infinity)) {
    return { error: t.settings.range(setting.min ?? 0, setting.max ?? 0) };
  }
  return { value };
};

const formatValue = (setting: Setting, value: number | boolean, t: Dictionary) => {
  if (typeof value === "boolean") return value ? t.settings.on : t.settings.off;
  // En los limites que admiten 0, el 0 significa "sin limite".
  if (value === 0 && setting.min === 0) return t.settings.unlimited;
  const unit = keyCopy(t, setting.key)?.unit;
  return unit ? `${value} ${unit}` : String(value);
};

const SettingRow: React.FC<{
  setting: Setting;
  draft: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
}> = ({ setting, draft, onChange }) => {
  const { t, fmt } = useI18n();
  const notify = useToast();
  const reset = useResetSetting();
  const copy = keyCopy(t, setting.key);
  const label = copy?.label ?? setting.key;

  const current = draft ?? (setting.type === "number" ? String(setting.value) : setting.value);
  const error = draft !== undefined ? parseDraft(setting, draft, t).error : undefined;

  return (
    <li className="flex flex-col gap-3 border-b border-line px-5 py-4 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-ink">{label}</span>
          {setting.overridden && <Tag tone="brand">{t.settings.modified}</Tag>}
          {draft !== undefined && <Tag tone="warning">{t.settings.unsaved}</Tag>}
        </div>
        {copy?.description && <p className="mt-1 text-sm leading-relaxed text-ink-3">{copy.description}</p>}
        <p className="mt-1.5 text-xs text-ink-3">
          {t.settings.defaultValue(formatValue(setting, setting.defaultValue, t))}
          {setting.overridden && setting.updatedBy && setting.updatedAt && (
            <> · {t.settings.updatedBy(setting.updatedBy, fmt.relative(setting.updatedAt))}</>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:pt-0.5">
        {setting.overridden && (
          <Button
            size="sm"
            variant="ghost"
            icon="refresh"
            loading={reset.isPending}
            onClick={async () => {
              await reset.mutateAsync(setting.key);
              notify(t.settings.resetDone);
            }}
          >
            {t.settings.reset}
          </Button>
        )}
        {setting.type === "boolean" ? (
          <Switch checked={current as boolean} onChange={onChange} label={label} hideLabel />
        ) : (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                size="sm"
                wrapperClassName="w-28"
                className="text-right font-mono"
                aria-label={label}
                min={setting.min}
                max={setting.max}
                step={1}
                value={current as string}
                invalid={error !== undefined}
                onChange={(event) => onChange(event.target.value)}
              />
              {copy?.unit && <span className="w-20 text-xs text-ink-3">{copy.unit}</span>}
            </div>
            {error && <span className="text-xs text-danger">{error}</span>}
          </div>
        )}
      </div>
    </li>
  );
};

/** Quien cambio que y cuando, del mas reciente al mas antiguo. */
const SettingsHistory: React.FC<{ byKey: Map<string, Setting> }> = ({ byKey }) => {
  const { t, fmt } = useI18n();
  const history = useSettingsHistory(true);
  const changes = history.data?.pages.flatMap((page) => page.data) ?? [];

  // Una clave que ya no esta en el catalogo se muestra tal cual: el historial no se reescribe.
  const show = (key: string, value: number | boolean) => {
    const setting = byKey.get(key);
    return setting ? formatValue(setting, value, t) : String(value);
  };

  return (
    <Card title={t.settings.history.title} description={t.settings.history.description} divider flush>
      {history.isLoading ? (
        <div className="flex flex-col gap-2 p-5">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : history.isError ? (
        <div className="p-5">
          <Alert variant="error">{errorMessage(history.error, t.settings.history.loadError)}</Alert>
        </div>
      ) : changes.length === 0 ? (
        <EmptyState icon="clock" title={t.settings.history.empty} description={t.settings.history.emptyHint} />
      ) : (
        <>
          <ul>
            {changes.map((change) => (
              <li
                key={change.id}
                className="flex flex-col gap-1 border-b border-line px-5 py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{keyCopy(t, change.key)?.label ?? change.key}</span>
                    {change.reset && <Tag>{t.settings.history.reset}</Tag>}
                  </div>
                  <p className="mt-0.5 text-sm text-ink-2">
                    {show(change.key, change.from)} → <span className="font-medium text-ink">{show(change.key, change.to)}</span>
                  </p>
                </div>
                <p className="shrink-0 text-xs text-ink-3" title={fmt.dateTime(change.at)}>
                  {t.settings.history.by(change.by, fmt.relative(change.at))}
                </p>
              </li>
            ))}
          </ul>
          {history.hasNextPage && (
            <div className="border-t border-line px-5 py-3">
              <Button size="sm" variant="ghost" loading={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
                {t.settings.history.more}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
};

/** Configuracion de la aplicacion. Solo la ve, y solo la cambia, la cuenta root. */
export default function PlatformSettingsPage() {
  const { t } = useI18n();
  const notify = useToast();
  const me = useMe();
  const isRoot = me.data?.isRoot === true;
  const settings = useSettings(isRoot);
  const update = useUpdateSettings();
  const [draft, setDraft] = useState<Draft>({});

  const byKey = useMemo(() => new Map((settings.data ?? []).map((setting) => [setting.key, setting])), [settings.data]);

  const pending = Object.keys(draft);
  const parsed = pending.map((key) => [key, parseDraft(byKey.get(key)!, draft[key], t)] as const);
  const invalid = parsed.some(([, result]) => result.error !== undefined);

  const change = (setting: Setting, value: string | boolean) => {
    setDraft((previous) => {
      const next = { ...previous };
      // Volver al valor guardado quita la clave del borrador: no cuenta como cambio.
      const same = setting.type === "number" ? String(setting.value) === String(value).trim() : setting.value === value;
      if (same) delete next[setting.key];
      else next[setting.key] = value;
      return next;
    });
  };

  const save = async () => {
    const values = Object.fromEntries(parsed.map(([key, result]) => [key, result.value as number | boolean]));
    await update.mutateAsync(values);
    setDraft({});
    notify(t.settings.saved);
  };

  if (me.isSuccess && !isRoot) {
    return (
      <DashboardLayout title={t.settings.title} eyebrow={t.settings.eyebrow} width="narrow">
        <Alert variant="error">{t.settings.rootOnly}</Alert>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={t.settings.title} eyebrow={t.settings.eyebrow} description={t.settings.description} width="narrow">
      {settings.isLoading || !me.isSuccess ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-48 w-full" />
          ))}
        </div>
      ) : settings.isError ? (
        <Alert variant="error">{errorMessage(settings.error, t.settings.loadError)}</Alert>
      ) : (
        <div className="flex flex-col gap-4 pb-24">
          {CATEGORIES.map((category) => {
            const items = (settings.data ?? []).filter((setting) => setting.category === category);
            if (items.length === 0) return null;
            return (
              <Card
                key={category}
                title={t.settings.categories[category].title}
                description={t.settings.categories[category].description}
                divider
                flush
              >
                <ul>
                  {items.map((setting) => (
                    <SettingRow
                      key={setting.key}
                      setting={setting}
                      draft={draft[setting.key]}
                      onChange={(value) => change(setting, value)}
                    />
                  ))}
                </ul>
              </Card>
            );
          })}
          <SettingsHistory byKey={byKey} />
          <Alert variant="info">{t.settings.envNote}</Alert>
        </div>
      )}

      {/* Barra de guardado: aparece con cambios pendientes y se queda a la vista al desplazarse. */}
      {pending.length > 0 && (
        <div className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-pop">
          <span className="text-sm font-medium text-ink">{t.settings.pending(pending.length)}</span>
          {update.isError && <Alert variant="error">{errorMessage(update.error, t.common.unknownError)}</Alert>}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDraft({})} disabled={update.isPending}>
              {t.settings.discard}
            </Button>
            <Button variant="primary" icon="check" loading={update.isPending} disabled={invalid} onClick={save}>
              {t.settings.save}
            </Button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
