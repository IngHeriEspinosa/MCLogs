"use client";
import React, { useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/atoms/Alert";
import { Button } from "@/components/atoms/Button";
import { Checkbox } from "@/components/atoms/Checkbox";
import { EmptyState } from "@/components/atoms/EmptyState";
import { Field, Fieldset } from "@/components/atoms/Field";
import { Icon, IconName } from "@/components/atoms/Icon";
import { Input } from "@/components/atoms/Input";
import { Segmented } from "@/components/atoms/Segmented";
import { Skeleton } from "@/components/atoms/Skeleton";
import { Switch } from "@/components/atoms/Switch";
import { Tag } from "@/components/atoms/Tag";
import { Card } from "@/components/molecules/Card";
import { ConfirmButton } from "@/components/molecules/ConfirmButton";
import { Menu } from "@/components/molecules/Menu";
import { Select } from "@/components/molecules/Select";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { errorMessage } from "@/common/api/errorMessage";
import { useI18n } from "@/common/i18n/I18nProvider";
import { useWorkspace } from "@/hooks/useWorkspaces";
import {
  AlertChannel,
  AlertChannelType,
  AlertRuleType,
  ALERT_RULE_TYPES,
  useCreateDigest,
  useDeleteDigest,
  useDigests,
  useSendDigest,
  useUpdateDigest,
  useAlertChannels,
  useAlertEvents,
  useAlertRules,
  useCreateChannel,
  useCreateRule,
  useDeleteChannel,
  useDeleteRule,
  useTestChannel,
  useUpdateChannel,
  useUpdateRule,
} from "@/hooks/useAlerts";
import { useFilterOptions } from "@/hooks/useOptions";

type Tab = "channels" | "rules" | "history" | "digests";

/** Icono de cada tipo de regla. */
const RULE_ICON: Record<AlertRuleType, IconName> = {
  threshold: "activity",
  new_error_group: "zap",
  regression: "refresh",
  error_rate: "chart",
  silence: "clock",
  spike: "arrowUp",
};
/** Tipos que usan volumen minimo, y los que no miran el nivel. */
const USES_MIN_VOLUME: ReadonlySet<AlertRuleType> = new Set<AlertRuleType>(["error_rate", "spike"]);
const IGNORES_LEVEL: ReadonlySet<AlertRuleType> = new Set<AlertRuleType>(["error_rate", "silence"]);
const CHANNEL_TYPES: AlertChannelType[] = ["webhook", "email", "telegram", "pagerduty"];
const CHANNEL_ICON: Record<AlertChannelType, IconName> = { webhook: "webhook", email: "mail", telegram: "send", pagerduty: "bell" };
/** "" = automatico: el backend lo deduce de la URL. */
const WEBHOOK_FORMATS = ["", "generic", "slack", "discord", "teams"] as const;
type WebhookFormat = (typeof WEBHOOK_FORMATS)[number];

const ListSkeleton = () => (
  <div className="flex flex-col gap-2">
    {Array.from({ length: 3 }).map((_, index) => (
      <Skeleton key={index} className="h-16 w-full" />
    ))}
  </div>
);

// --- Canales ---

/**
 * Crea un canal o, con `channel`, edita uno existente. Los secretos llegan
 * enmascarados y no se precargan: dejarlos vacíos conserva los guardados,
 * porque el backend descarta un valor vacío o enmascarado al mezclar.
 */
const ChannelForm: React.FC<{ channel?: AlertChannel; onDone?: () => void }> = ({ channel, onDone }) => {
  const { t } = useI18n();
  const config = channel?.config ?? {};
  const editing = Boolean(channel);
  const [type, setType] = useState<AlertChannelType>(channel?.type ?? "webhook");
  const [name, setName] = useState(channel?.name ?? "");
  const [url, setUrl] = useState(String(config.url ?? ""));
  const [secret, setSecret] = useState("");
  const [format, setFormat] = useState<WebhookFormat>(
    WEBHOOK_FORMATS.includes(config.format as WebhookFormat) ? (config.format as WebhookFormat) : "",
  );
  const [to, setTo] = useState(((config.to as string[] | undefined) ?? []).join(", "));
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState(String(config.chatId ?? ""));
  // Vacia al editar: el servidor conserva la guardada si no se escribe otra.
  const [routingKey, setRoutingKey] = useState("");
  const create = useCreateChannel();
  const update = useUpdateChannel();
  const mutation = editing ? update : create;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextConfig =
      type === "webhook"
        ? { url: url.trim(), ...(secret.trim() ? { secret: secret.trim() } : {}), ...(format ? { format } : {}) }
        : type === "email"
          ? { to: to.split(",").map((value) => value.trim()).filter(Boolean) }
          : type === "telegram"
            ? { botToken: botToken.trim(), chatId: chatId.trim() }
            : { routingKey: routingKey.trim() };

    if (channel) {
      await update.mutateAsync({ id: channel.id, name: name.trim(), config: nextConfig });
      onDone?.();
      return;
    }

    await create.mutateAsync({ name: name.trim(), type, config: nextConfig });
    setName("");
    setUrl("");
    setSecret("");
    setFormat("");
    setTo("");
    setBotToken("");
    setChatId("");
    setRoutingKey("");
  };

  const keepHint = editing ? t.alerts.keepSecretHint : undefined;

  return (
    <Card title={editing ? t.alerts.editChannel : t.alerts.newChannel} divider>
      <form className="flex flex-col gap-5" onSubmit={submit}>
        <Field label={t.alerts.type} info={t.fieldInfo.alerts.channelType}>
          {editing ? (
            <span className="flex items-center gap-2 text-sm text-ink">
              <Icon name={CHANNEL_ICON[type]} className="h-4 w-4 text-ink-3" />
              {t.alerts.channelTypes[type]}
            </span>
          ) : (
            <Segmented
              label={t.alerts.type}
              value={type}
              onChange={setType}
              className="w-full"
              options={CHANNEL_TYPES.map((value) => ({ value, label: t.alerts.channelTypes[value], icon: CHANNEL_ICON[value] }))}
            />
          )}
        </Field>
        <Field label={t.alerts.name} info={t.fieldInfo.alerts.channelName}>
          <Input value={name} onChange={(event) => setName(event.target.value)} required />
        </Field>

        {type === "webhook" && (
          <>
            <Field label={t.alerts.url} hint={t.alerts.urlHint} info={t.fieldInfo.alerts.url}>
              <Input type="url" icon="webhook" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://hooks.slack.com/services/…" required />
            </Field>
            <Field label={t.alerts.secret} hint={keepHint ?? t.alerts.secretHint} aside={t.common.optional} info={t.fieldInfo.alerts.secret}>
              <Input
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                placeholder={typeof config.secret === "string" ? config.secret : undefined}
                className="font-mono"
              />
            </Field>
            <Field label={t.alerts.format} info={t.fieldInfo.alerts.format}>
              <Select
                label={t.alerts.format}
                value={format}
                onChange={(next) => setFormat(next as WebhookFormat)}
                options={WEBHOOK_FORMATS.map((value) => ({ value, label: t.alerts.formats[value || "auto"] }))}
              />
            </Field>
          </>
        )}

        {type === "email" && (
          <Field label={t.alerts.recipients} hint={t.alerts.recipientsHint} info={t.fieldInfo.alerts.recipients}>
            <Input icon="mail" value={to} onChange={(event) => setTo(event.target.value)} placeholder="ops@company.com, oncall@company.com" required />
          </Field>
        )}

        {type === "telegram" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.alerts.botToken} hint={keepHint} info={t.fieldInfo.alerts.botToken}>
              <Input
                value={botToken}
                onChange={(event) => setBotToken(event.target.value)}
                placeholder={editing ? String(config.botToken ?? "") : "123456:ABC-DEF…"}
                className="font-mono"
                required={!editing}
              />
            </Field>
            <Field label={t.alerts.chatId} info={t.fieldInfo.alerts.chatId}>
              <Input value={chatId} onChange={(event) => setChatId(event.target.value)} className="font-mono" required />
            </Field>
          </div>
        )}

        {type === "pagerduty" && (
          <Field label={t.alerts.routingKey} hint={keepHint ?? t.alerts.routingKeyHint} info={t.fieldInfo.alerts.routingKey}>
            <Input
              value={routingKey}
              onChange={(event) => setRoutingKey(event.target.value)}
              placeholder={editing ? String(config.routingKey ?? "") : "R0123456789ABCDEF0123456789ABCDE"}
              className="font-mono"
              required={!editing}
              autoComplete="off"
            />
          </Field>
        )}

        {mutation.isError && <Alert variant="error">{errorMessage(mutation.error, t.common.unknownError)}</Alert>}

        {editing ? (
          <div className="flex gap-2">
            <Button type="submit" variant="primary" icon="check" loading={update.isPending} className="flex-1">
              {t.common.save}
            </Button>
            <Button onClick={onDone}>{t.common.cancel}</Button>
          </div>
        ) : (
          <Button type="submit" variant="primary" icon="plus" loading={create.isPending}>
            {t.alerts.createChannel}
          </Button>
        )}
      </form>
    </Card>
  );
};

const ChannelsTab: React.FC = () => {
  const { t } = useI18n();
  const channels = useAlertChannels();
  const update = useUpdateChannel();
  const remove = useDeleteChannel();
  const test = useTestChannel();
  const [tested, setTested] = useState<{ id: number; ok: boolean; error?: string } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const runTest = async (id: number) => {
    setTested(null);
    const result = await test.mutateAsync(id);
    setTested({ id, ok: result.ok, error: result.error });
  };

  const data = channels.data ?? [];
  const editing: AlertChannel | undefined = data.find((channel) => channel.id === editingId);

  const removeChannel = (id: number) => {
    if (id === editingId) setEditingId(null);
    remove.mutate(id);
  };

  return (
    <div className="grid items-start gap-4 2xl:grid-cols-[26rem_minmax(0,1fr)] 3xl:gap-5">
      {/* La `key` reinicia el estado del formulario al cambiar de canal. */}
      <ChannelForm key={editing?.id ?? "new"} channel={editing} onDone={() => setEditingId(null)} />
      <Card title={`${t.alerts.channels} · ${data.length}`} divider>
        {channels.isLoading && <ListSkeleton />}
        {channels.isError && <Alert variant="error">{errorMessage(channels.error, t.common.unknownError)}</Alert>}
        {channels.isSuccess && data.length === 0 && (
          <EmptyState icon="bell" title={t.alerts.channelsEmpty} description={t.alerts.channelsEmptyHint} />
        )}
        <ul className="flex flex-col gap-2">
          {data.map((channel) => (
            <li key={channel.id} className="rounded-xl border border-line p-3.5 transition-colors hover:border-line-strong">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    channel.enabled ? "bg-brand-soft text-brand" : "bg-surface-3 text-ink-3"
                  }`}
                >
                  <Icon name={CHANNEL_ICON[channel.type]} className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                    {channel.name}
                    <Tag tone="neutral">{t.alerts.channelTypes[channel.type]}</Tag>
                    {!channel.enabled && <Tag tone="warning">{t.common.disabled}</Tag>}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-xs text-ink-3">
                    {channel.type === "webhook" && String(channel.config.url ?? "")}
                    {channel.type === "email" && (channel.config.to as string[] | undefined)?.join(", ")}
                    {channel.type === "telegram" && t.alerts.chat(String(channel.config.chatId ?? ""))}
                    {channel.type === "pagerduty" && t.alerts.pagerDutyKey(String(channel.config.routingKey ?? ""))}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Switch
                    hideLabel
                    size="sm"
                    label={channel.enabled ? t.common.disable : t.common.enable}
                    checked={channel.enabled}
                    onChange={(enabled) => update.mutate({ id: channel.id, enabled })}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="send"
                    onClick={() => runTest(channel.id)}
                    loading={test.isPending && test.variables === channel.id}
                    disabled={test.isPending}
                    className="ml-2"
                  >
                    {t.alerts.sendTest}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="pencil"
                    onClick={() => setEditingId(channel.id)}
                    aria-pressed={channel.id === editingId}
                  >
                    {t.common.edit}
                  </Button>
                  <ConfirmButton onConfirm={() => removeChannel(channel.id)} confirmLabel={t.common.confirmRemove}>
                    {t.common.remove}
                  </ConfirmButton>
                </div>
              </div>
              {tested?.id === channel.id && (
                <Alert variant={tested.ok ? "success" : "error"} className="mt-3">
                  {tested.ok ? t.alerts.testOk : t.alerts.testFailed(tested.error ?? "")}
                </Alert>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
};

// --- Reglas ---

const RuleForm: React.FC = () => {
  const { t } = useI18n();
  const options = useFilterOptions();
  const channels = useAlertChannels();
  const create = useCreateRule();

  const [name, setName] = useState("");
  const [type, setType] = useState<AlertRuleType>("threshold");
  const [application, setApplication] = useState("");
  const [service, setService] = useState("");
  const [environment, setEnvironment] = useState("");
  const [level, setLevel] = useState("error");
  const [minVolume, setMinVolume] = useState(20);
  const [threshold, setThreshold] = useState(5);
  const [windowMinutes, setWindowMinutes] = useState(10);
  const [cooldownMinutes, setCooldownMinutes] = useState(30);
  const [channelIds, setChannelIds] = useState<number[]>([]);

  const toggleChannel = (id: number, checked: boolean) =>
    setChannelIds((current) => (checked ? [...current, id] : current.filter((value) => value !== id)));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await create.mutateAsync({
      name: name.trim(),
      type,
      application: application.trim() || null,
      service: service.trim() || null,
      environment: environment || null,
      level,
      minVolume,
      threshold,
      windowMinutes,
      cooldownMinutes,
      channelIds,
    });
    setName("");
    setApplication("");
    setService("");
    setChannelIds([]);
  };

  const numberInput = (value: number, onChange: (value: number) => void, min: number, max?: number) => (
    <Input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="font-mono tabular-nums" />
  );

  return (
    <Card title={t.alerts.newRule} divider>
      <form className="flex flex-col gap-5" onSubmit={submit}>
        <Field label={t.alerts.name} info={t.fieldInfo.alerts.ruleName}>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t.alerts.ruleNamePlaceholder} required />
        </Field>

        <Field label={t.alerts.type} info={t.fieldInfo.alerts.ruleType}>
          <Select
            label={t.alerts.type}
            icon={RULE_ICON[type]}
            value={type}
            onChange={setType}
            options={ALERT_RULE_TYPES.map((value) => ({ value, label: t.alerts.ruleTypes[value] }))}
          />
        </Field>
        <p className="-mt-2 rounded-lg bg-surface-2 px-3 py-2 text-xs leading-relaxed text-ink-2">{t.alerts.ruleTypeHints[type]}</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.alerts.application} info={t.fieldInfo.alerts.application}>
            <Select
              icon="box"
              value={application}
              onChange={setApplication}
              options={[{ value: "", label: t.alerts.allApps }, ...options.apps.slice(1)]}
              searchable
              allowCustom
            />
          </Field>
          <Field label={t.alerts.environment} info={t.fieldInfo.alerts.environment}>
            <Select
              icon="layers"
              value={environment}
              onChange={setEnvironment}
              options={[{ value: "", label: t.alerts.allEnvs }, ...options.environments.slice(1)]}
            />
          </Field>
          <Field label={t.alerts.service} info={t.fieldInfo.alerts.service} aside={t.common.optional}>
            <Input icon="layers" value={service} onChange={(event) => setService(event.target.value)} maxLength={120} />
          </Field>
        </div>

        {!IGNORES_LEVEL.has(type) && (
        <Field label={t.alerts.minLevel} info={t.fieldInfo.alerts.minLevel}>
          <Select
            value={level}
            onChange={setLevel}
            options={[
              { value: "error", label: t.alerts.minLevels.error, dotClass: "bg-lvl-error" },
              { value: "warn", label: t.alerts.minLevels.warn, dotClass: "bg-lvl-warn" },
            ]}
          />
        </Field>
        )}

        <div className="grid grid-cols-3 gap-3">
          {type !== "silence" && (
            <Field label={t.alerts.thresholdLabels[type]} info={t.fieldInfo.alerts.thresholds[type]}>
              {numberInput(threshold, setThreshold, 1, type === "error_rate" ? 100 : undefined)}
            </Field>
          )}
          <Field label={t.alerts.window} info={t.fieldInfo.alerts.window}>{numberInput(windowMinutes, setWindowMinutes, 1, 1440)}</Field>
          <Field label={t.alerts.cooldown} info={t.fieldInfo.alerts.cooldown}>{numberInput(cooldownMinutes, setCooldownMinutes, 0, 1440)}</Field>
          {USES_MIN_VOLUME.has(type) && (
            <Field label={t.alerts.minVolume} info={t.fieldInfo.alerts.minVolume}>
              {numberInput(minVolume, setMinVolume, 1)}
            </Field>
          )}
        </div>

        <Fieldset legend={t.alerts.notifyVia} info={t.fieldInfo.alerts.notifyVia} hint={channelIds.length === 0 ? t.alerts.pickChannel : undefined}>
          {channels.data?.length === 0 ? (
            <p className="text-xs text-ink-3">{t.alerts.needChannel}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {channels.data?.map((channel) => (
                <Checkbox
                  key={channel.id}
                  variant="card"
                  checked={channelIds.includes(channel.id)}
                  onChange={(checked) => toggleChannel(channel.id, checked)}
                  label={channel.name}
                  description={t.alerts.channelTypes[channel.type]}
                />
              ))}
            </div>
          )}
        </Fieldset>

        {create.isError && <Alert variant="error">{errorMessage(create.error, t.common.unknownError)}</Alert>}

        <Button type="submit" variant="primary" icon="plus" loading={create.isPending} disabled={channelIds.length === 0}>
          {t.alerts.createRule}
        </Button>
      </form>
    </Card>
  );
};

const RulesTab: React.FC = () => {
  const { t, fmt } = useI18n();
  const rules = useAlertRules();
  const update = useUpdateRule();
  const remove = useDeleteRule();
  const data = rules.data ?? [];

  return (
    <div className="grid items-start gap-4 2xl:grid-cols-[28rem_minmax(0,1fr)] 3xl:gap-5">
      <RuleForm />
      <Card title={`${t.alerts.rules} · ${data.length}`} divider>
        {rules.isLoading && <ListSkeleton />}
        {rules.isError && <Alert variant="error">{errorMessage(rules.error, t.common.unknownError)}</Alert>}
        {rules.isSuccess && data.length === 0 && (
          <EmptyState icon="bell" title={t.alerts.rulesEmpty} description={t.alerts.rulesEmptyHint} />
        )}
        <ul className="flex flex-col gap-2">
          {data.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3.5 transition-colors hover:border-line-strong">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  rule.enabled ? "bg-brand-soft text-brand" : "bg-surface-3 text-ink-3"
                }`}
              >
                <Icon name={RULE_ICON[rule.type]} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                  {rule.name}
                  <Tag tone="neutral">{t.alerts.ruleTypes[rule.type]}</Tag>
                  {!rule.enabled && <Tag tone="warning">{t.common.disabled}</Tag>}
                  {rule.enabled && rule.state === "firing" && <Tag tone="danger" icon="alertCircle">{t.alerts.firing}</Tag>}
                  {rule.mutedUntil && Date.parse(rule.mutedUntil) > Date.now() && (
                    <Tag tone="neutral" icon="eyeOff">{t.alerts.mutedUntil(fmt.dateTimeShort(rule.mutedUntil))}</Tag>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-ink-3">
                  {t.alerts.summaries[rule.type](rule.threshold, rule.windowMinutes, rule.minVolume)}
                  {" · "}
                  <span className="font-mono">{rule.application ?? t.alerts.allAppsLower}</span>
                  {rule.service ? <span className="font-mono"> › {rule.service}</span> : null}
                  {rule.environment ? ` · ${rule.environment}` : ""}
                  {" · "}
                  {t.alerts.levelLabel(rule.level)}
                  {" · "}
                  {t.alerts.via(rule.channels.map((channel) => channel.name).join(", ") || t.alerts.noChannel)}
                </p>
                {rule.lastTriggeredAt && (
                  <p className="mt-0.5 text-xs text-ink-3" title={fmt.dateTime(rule.lastTriggeredAt)}>
                    {t.alerts.lastTriggered(fmt.relative(rule.lastTriggeredAt))}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Menu
                  label={t.alerts.mute}
                  icon="eyeOff"
                  iconOnly
                  variant="ghost"
                  size="sm"
                  items={[
                    { key: "1h", label: t.alerts.mute1h, onSelect: () => update.mutate({ id: rule.id, mutedUntil: new Date(Date.now() + 3600_000).toISOString() }) },
                    { key: "24h", label: t.alerts.mute24h, onSelect: () => update.mutate({ id: rule.id, mutedUntil: new Date(Date.now() + 24 * 3600_000).toISOString() }) },
                    { key: "off", label: t.alerts.unmute, disabled: !rule.mutedUntil, onSelect: () => update.mutate({ id: rule.id, mutedUntil: null }) },
                  ]}
                />
                <Switch
                  hideLabel
                  size="sm"
                  label={rule.enabled ? t.common.disable : t.common.enable}
                  checked={rule.enabled}
                  onChange={(enabled) => update.mutate({ id: rule.id, enabled })}
                />
                <span className="ml-2">
                  <ConfirmButton onConfirm={() => remove.mutate(rule.id)} confirmLabel={t.common.confirmRemove}>
                    {t.common.remove}
                  </ConfirmButton>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
};

// --- Historial ---

const HistoryTab: React.FC = () => {
  const { t, fmt } = useI18n();
  const events = useAlertEvents();
  const data = events.data ?? [];

  return (
    <Card title={t.alerts.history} divider>
      {events.isLoading && <ListSkeleton />}
      {events.isError && <Alert variant="error">{errorMessage(events.error, t.common.unknownError)}</Alert>}
      {events.isSuccess && data.length === 0 && <EmptyState icon="bell" title={t.alerts.historyEmpty} />}
      <ol className="relative flex flex-col gap-2">
        {data.map((event) => {
          const failed = event.deliveries.filter((delivery) => !delivery.ok);
          const resolved = event.kind === "resolve";
          return (
            <li key={event.id} className="rounded-xl border border-line p-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    failed.length ? "bg-danger-soft text-danger" : "bg-success-soft text-success"
                  }`}
                >
                  <Icon name={failed.length ? "alertCircle" : "checkCircle"} className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                    {event.rule.name}
                    <Tag tone={resolved ? "success" : "danger"}>{resolved ? t.alerts.eventResolved : t.alerts.eventTriggered}</Tag>
                  </p>
                  <p className="text-xs text-ink-3">
                    {t.alerts.matches(event.count)} · {t.alerts.delivered(event.deliveries.length - failed.length, event.deliveries.length)}
                  </p>
                  {event.sampleLogIds.length > 0 && (
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                      {t.alerts.samples}
                      {event.sampleLogIds.map((id) => (
                        <Link key={id} href={`/logs?log=${id}`} className="font-mono">
                          #{id}
                        </Link>
                      ))}
                    </p>
                  )}
                </div>
                <span className="font-mono text-xs text-ink-3" title={fmt.dateTime(event.triggeredAt)}>
                  {fmt.relative(event.triggeredAt)}
                </span>
              </div>
              {failed.length > 0 && (
                <Alert variant="error" className="mt-3">
                  {failed.map((delivery) => `${delivery.channelName}: ${delivery.error}`).join(" · ")}
                </Alert>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
};

// --- Resúmenes programados ---

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const DigestForm: React.FC = () => {
  const { t } = useI18n();
  const options = useFilterOptions();
  const channels = useAlertChannels();
  const create = useCreateDigest();
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [hourUtc, setHourUtc] = useState(8);
  const [weekday, setWeekday] = useState(1);
  const [environment, setEnvironment] = useState("");
  const [channelIds, setChannelIds] = useState<number[]>([]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await create.mutateAsync({ name: name.trim(), frequency, hourUtc, weekday, environment: environment || null, channelIds });
    setName("");
    setChannelIds([]);
  };

  return (
    <Card title={t.alerts.digests.new} description={t.alerts.digests.hint} divider>
      <form className="flex flex-col gap-5" onSubmit={submit}>
        <Field label={t.alerts.name}>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t.alerts.digests.namePlaceholder} required maxLength={120} />
        </Field>
        <Field label={t.alerts.digests.frequency}>
          <Segmented
            label={t.alerts.digests.frequency}
            value={frequency}
            onChange={setFrequency}
            className="w-full"
            options={[
              { value: "daily", label: t.alerts.digests.daily },
              { value: "weekly", label: t.alerts.digests.weekly },
            ]}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.alerts.digests.hour} info={t.alerts.digests.hourInfo}>
            <Select
              icon="clock"
              value={String(hourUtc)}
              onChange={(value) => setHourUtc(Number(value))}
              options={Array.from({ length: 24 }, (_, hour) => ({ value: String(hour), label: `${String(hour).padStart(2, "0")}:00 UTC` }))}
            />
          </Field>
          {frequency === "weekly" && (
            <Field label={t.alerts.digests.weekday}>
              <Select
                icon="calendar"
                value={String(weekday)}
                onChange={(value) => setWeekday(Number(value))}
                options={WEEKDAYS.map((day) => ({ value: String(day), label: t.alerts.digests.weekdays[day] }))}
              />
            </Field>
          )}
          <Field label={t.alerts.environment}>
            <Select icon="layers" value={environment} onChange={setEnvironment} options={[{ value: "", label: t.alerts.allEnvs }, ...options.environments.slice(1)]} />
          </Field>
        </div>
        <Fieldset legend={t.alerts.notifyVia} hint={channelIds.length === 0 ? t.alerts.pickChannel : undefined}>
          {channels.data?.length === 0 ? (
            <p className="text-xs text-ink-3">{t.alerts.needChannel}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {channels.data?.map((channel) => (
                <Checkbox
                  key={channel.id}
                  variant="card"
                  checked={channelIds.includes(channel.id)}
                  onChange={(checked) =>
                    setChannelIds((current) => (checked ? [...current, channel.id] : current.filter((value) => value !== channel.id)))
                  }
                  label={channel.name}
                  description={t.alerts.channelTypes[channel.type]}
                />
              ))}
            </div>
          )}
        </Fieldset>
        {create.isError && <Alert variant="error">{errorMessage(create.error, t.common.unknownError)}</Alert>}
        <Button type="submit" variant="primary" icon="plus" loading={create.isPending} disabled={channelIds.length === 0}>
          {t.alerts.digests.create}
        </Button>
      </form>
    </Card>
  );
};

const DigestsTab: React.FC = () => {
  const { t, fmt } = useI18n();
  const digests = useDigests();
  const update = useUpdateDigest();
  const remove = useDeleteDigest();
  const send = useSendDigest();
  const [results, setResults] = useState<Record<number, string>>({});
  const data = digests.data ?? [];

  const sendNow = async (id: number) => {
    const deliveries = await send.mutateAsync(id);
    const failed = deliveries.filter((delivery) => !delivery.ok);
    setResults((current) => ({
      ...current,
      [id]: failed.length
        ? failed.map((delivery) => `${delivery.channelName}: ${delivery.error}`).join(" · ")
        : t.alerts.delivered(deliveries.length, deliveries.length),
    }));
  };

  return (
    <div className="grid items-start gap-4 2xl:grid-cols-[28rem_minmax(0,1fr)] 3xl:gap-5">
      <DigestForm />
      <Card title={`${t.alerts.digests.list} · ${data.length}`} divider>
        {digests.isLoading && <ListSkeleton />}
        {digests.isError && <Alert variant="error">{errorMessage(digests.error, t.common.unknownError)}</Alert>}
        {digests.isSuccess && data.length === 0 && <EmptyState icon="mail" title={t.alerts.digests.empty} description={t.alerts.digests.emptyHint} />}
        <ul className="flex flex-col gap-2">
          {data.map((digest) => (
            <li key={digest.id} className="rounded-xl border border-line p-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                    {digest.name}
                    {!digest.enabled && <Tag tone="warning">{t.common.disabled}</Tag>}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-3">
                    {digest.frequency === "weekly"
                      ? t.alerts.digests.summaryWeekly(t.alerts.digests.weekdays[digest.weekday] ?? "", String(digest.hourUtc).padStart(2, "0"))
                      : t.alerts.digests.summaryDaily(String(digest.hourUtc).padStart(2, "0"))}
                    {digest.environment ? ` · ${digest.environment}` : ""}
                    {" · "}
                    {t.alerts.via(digest.channels.map((channel) => channel.name).join(", ") || t.alerts.noChannel)}
                  </p>
                  {digest.lastSentAt && (
                    <p className="mt-0.5 text-xs text-ink-3" title={fmt.dateTime(digest.lastSentAt)}>
                      {t.alerts.digests.lastSent(fmt.relative(digest.lastSentAt))}
                    </p>
                  )}
                  {results[digest.id] && <p className="mt-1 text-xs text-ink-2">{results[digest.id]}</p>}
                </div>
                <Button size="sm" variant="secondary" icon="send" loading={send.isPending && send.variables === digest.id} onClick={() => void sendNow(digest.id)}>
                  {t.alerts.digests.sendNow}
                </Button>
                <Switch
                  hideLabel
                  size="sm"
                  label={digest.enabled ? t.common.disable : t.common.enable}
                  checked={digest.enabled}
                  onChange={(enabled) => update.mutate({ id: digest.id, enabled })}
                />
                <ConfirmButton onConfirm={() => remove.mutate(digest.id)} confirmLabel={t.common.confirmRemove}>
                  {t.common.remove}
                </ConfirmButton>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
};

export default function AlertsPage() {
  const { t } = useI18n();
  const workspace = useWorkspace();
  const [tab, setTab] = useState<Tab>("channels");

  if (workspace.ready && workspace.current && !workspace.isOwner) {
    return (
      <DashboardLayout title={t.alerts.title} eyebrow={t.alerts.eyebrow} width="narrow">
        <Alert variant="error">{t.common.ownerOnly}</Alert>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title={t.alerts.title}
      eyebrow={t.alerts.eyebrow}
      description={t.alerts.description}
      actions={
        <Segmented
          label={t.alerts.title}
          semantics="tabs"
          value={tab}
          onChange={setTab}
          options={[
            { value: "channels", label: t.alerts.tabs.channels, icon: "send" },
            { value: "rules", label: t.alerts.tabs.rules, icon: "sliders" },
            { value: "history", label: t.alerts.tabs.history, icon: "clock" },
            { value: "digests", label: t.alerts.tabs.digests, icon: "mail" },
          ]}
        />
      }
    >
      {tab === "channels" && <ChannelsTab />}
      {tab === "rules" && <RulesTab />}
      {tab === "history" && <HistoryTab />}
      {tab === "digests" && <DigestsTab />}
    </DashboardLayout>
  );
}
