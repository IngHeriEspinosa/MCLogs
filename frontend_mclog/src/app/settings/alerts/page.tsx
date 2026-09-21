"use client";
import React, { useState } from "react";
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
import { Select } from "@/components/molecules/Select";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { errorMessage } from "@/common/api/errorMessage";
import { useI18n } from "@/common/i18n/I18nProvider";
import { useMe } from "@/hooks/useAuth";
import {
  AlertChannelType,
  AlertRuleType,
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

type Tab = "channels" | "rules" | "history";
const CHANNEL_TYPES: AlertChannelType[] = ["webhook", "email", "telegram"];
const CHANNEL_ICON: Record<AlertChannelType, IconName> = { webhook: "webhook", email: "mail", telegram: "send" };

const ListSkeleton = () => (
  <div className="flex flex-col gap-2">
    {Array.from({ length: 3 }).map((_, index) => (
      <Skeleton key={index} className="h-16 w-full" />
    ))}
  </div>
);

// --- Canales ---

const ChannelForm: React.FC = () => {
  const { t } = useI18n();
  const [type, setType] = useState<AlertChannelType>("webhook");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [to, setTo] = useState("");
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const create = useCreateChannel();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const config =
      type === "webhook"
        ? { url: url.trim(), ...(secret.trim() ? { secret: secret.trim() } : {}) }
        : type === "email"
          ? { to: to.split(",").map((value) => value.trim()).filter(Boolean) }
          : { botToken: botToken.trim(), chatId: chatId.trim() };

    await create.mutateAsync({ name: name.trim(), type, config });
    setName("");
    setUrl("");
    setSecret("");
    setTo("");
    setBotToken("");
    setChatId("");
  };

  return (
    <Card title={t.alerts.newChannel} divider>
      <form className="flex flex-col gap-5" onSubmit={submit}>
        <Field label={t.alerts.type}>
          <Segmented
            label={t.alerts.type}
            value={type}
            onChange={setType}
            className="w-full"
            options={CHANNEL_TYPES.map((value) => ({ value, label: t.alerts.channelTypes[value], icon: CHANNEL_ICON[value] }))}
          />
        </Field>
        <Field label={t.alerts.name}>
          <Input value={name} onChange={(event) => setName(event.target.value)} required />
        </Field>

        {type === "webhook" && (
          <>
            <Field label={t.alerts.url} hint={t.alerts.urlHint}>
              <Input type="url" icon="webhook" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://hooks.slack.com/services/…" required />
            </Field>
            <Field label={t.alerts.secret} hint={t.alerts.secretHint} aside={t.common.optional}>
              <Input value={secret} onChange={(event) => setSecret(event.target.value)} className="font-mono" />
            </Field>
          </>
        )}

        {type === "email" && (
          <Field label={t.alerts.recipients} hint={t.alerts.recipientsHint}>
            <Input icon="mail" value={to} onChange={(event) => setTo(event.target.value)} placeholder="ops@company.com, oncall@company.com" required />
          </Field>
        )}

        {type === "telegram" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.alerts.botToken}>
              <Input value={botToken} onChange={(event) => setBotToken(event.target.value)} placeholder="123456:ABC-DEF…" className="font-mono" required />
            </Field>
            <Field label={t.alerts.chatId}>
              <Input value={chatId} onChange={(event) => setChatId(event.target.value)} className="font-mono" required />
            </Field>
          </div>
        )}

        {create.isError && <Alert variant="error">{errorMessage(create.error, t.common.unknownError)}</Alert>}

        <Button type="submit" variant="primary" icon="plus" loading={create.isPending}>
          {t.alerts.createChannel}
        </Button>
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

  const runTest = async (id: number) => {
    setTested(null);
    const result = await test.mutateAsync(id);
    setTested({ id, ok: result.ok, error: result.error });
  };

  const data = channels.data ?? [];

  return (
    <div className="grid items-start gap-4 2xl:grid-cols-[26rem_minmax(0,1fr)] 3xl:gap-5">
      <ChannelForm />
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
                  <ConfirmButton onConfirm={() => remove.mutate(channel.id)} confirmLabel={t.common.confirmRemove}>
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
  const [environment, setEnvironment] = useState("");
  const [level, setLevel] = useState("error");
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
      environment: environment || null,
      level,
      threshold,
      windowMinutes,
      cooldownMinutes,
      channelIds,
    });
    setName("");
    setApplication("");
    setChannelIds([]);
  };

  const numberInput = (value: number, onChange: (value: number) => void, min: number, max?: number) => (
    <Input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="font-mono tabular-nums" />
  );

  return (
    <Card title={t.alerts.newRule} divider>
      <form className="flex flex-col gap-5" onSubmit={submit}>
        <Field label={t.alerts.name}>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t.alerts.ruleNamePlaceholder} required />
        </Field>

        <Field label={t.alerts.type}>
          <Segmented
            label={t.alerts.type}
            value={type}
            onChange={setType}
            className="w-full"
            options={[
              { value: "threshold", label: t.alerts.ruleTypes.threshold, icon: "activity" },
              { value: "new_error_group", label: t.alerts.ruleTypes.new_error_group, icon: "zap" },
            ]}
          />
        </Field>
        <p className="-mt-2 rounded-lg bg-surface-2 px-3 py-2 text-xs leading-relaxed text-ink-2">{t.alerts.ruleTypeHints[type]}</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.alerts.application}>
            <Select
              icon="box"
              value={application}
              onChange={setApplication}
              options={[{ value: "", label: t.alerts.allApps }, ...options.apps.slice(1)]}
              searchable
              allowCustom
            />
          </Field>
          <Field label={t.alerts.environment}>
            <Select
              icon="layers"
              value={environment}
              onChange={setEnvironment}
              options={[{ value: "", label: t.alerts.allEnvs }, ...options.environments.slice(1)]}
            />
          </Field>
        </div>

        <Field label={t.alerts.minLevel}>
          <Select
            value={level}
            onChange={setLevel}
            options={[
              { value: "error", label: t.alerts.minLevels.error, dotClass: "bg-lvl-error" },
              { value: "warn", label: t.alerts.minLevels.warn, dotClass: "bg-lvl-warn" },
            ]}
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label={type === "threshold" ? t.alerts.threshold : t.alerts.newErrors}>{numberInput(threshold, setThreshold, 1)}</Field>
          <Field label={t.alerts.window}>{numberInput(windowMinutes, setWindowMinutes, 1, 1440)}</Field>
          <Field label={t.alerts.cooldown}>{numberInput(cooldownMinutes, setCooldownMinutes, 0, 1440)}</Field>
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
                <Icon name={rule.type === "new_error_group" ? "zap" : "activity"} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                  {rule.name}
                  <Tag tone="neutral">{t.alerts.ruleTypes[rule.type]}</Tag>
                  {!rule.enabled && <Tag tone="warning">{t.common.disabled}</Tag>}
                </p>
                <p className="mt-0.5 text-xs text-ink-3">
                  {rule.type === "new_error_group"
                    ? t.alerts.summaryNew(rule.threshold, rule.windowMinutes)
                    : t.alerts.summaryThreshold(rule.threshold, rule.windowMinutes)}
                  {" · "}
                  <span className="font-mono">{rule.application ?? t.alerts.allAppsLower}</span>
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
                  <p className="text-sm font-medium text-ink">{event.rule.name}</p>
                  <p className="text-xs text-ink-3">
                    {t.alerts.matches(event.count)} · {t.alerts.delivered(event.deliveries.length - failed.length, event.deliveries.length)}
                  </p>
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

export default function AlertsPage() {
  const { t } = useI18n();
  const me = useMe();
  const [tab, setTab] = useState<Tab>("channels");

  if (me.isSuccess && me.data.role !== "admin") {
    return (
      <DashboardLayout title={t.alerts.title} eyebrow={t.alerts.eyebrow} width="narrow">
        <Alert variant="error">{t.common.adminOnly}</Alert>
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
          ]}
        />
      }
    >
      {tab === "channels" && <ChannelsTab />}
      {tab === "rules" && <RulesTab />}
      {tab === "history" && <HistoryTab />}
    </DashboardLayout>
  );
}
