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
  AlertChannelType,
  AlertRuleType,
  CHANNEL_LABELS,
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

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";
const labelClass = "text-sm font-medium text-slate-700";

const TABS = [
  { id: "channels", label: "Canales" },
  { id: "rules", label: "Reglas" },
  { id: "history", label: "Historial" },
] as const;
type Tab = (typeof TABS)[number]["id"];

// --- Canales ---

const ChannelForm: React.FC = () => {
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
          ? { to: to.split(",").map((valor) => valor.trim()).filter(Boolean) }
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
    <Card title="Nuevo canal">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="flex flex-wrap gap-4">
          <label className={`flex-1 ${labelClass}`}>
            Nombre
            <input className={`mt-1 ${inputClass}`} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className={labelClass}>
            Tipo
            <select
              className={`mt-1 ${inputClass}`}
              value={type}
              onChange={(e) => setType(e.target.value as AlertChannelType)}
            >
              {(Object.keys(CHANNEL_LABELS) as AlertChannelType[]).map((valor) => (
                <option key={valor} value={valor}>
                  {CHANNEL_LABELS[valor]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {type === "webhook" && (
          <>
            <label className={labelClass}>
              URL
              <input
                type="url"
                className={`mt-1 ${inputClass}`}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/…"
                required
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Sirve para Slack, Discord, Teams, n8n o cualquier receptor que acepte un POST con JSON.
              </span>
            </label>
            <label className={labelClass}>
              Secreto de firma
              <input className={`mt-1 ${inputClass}`} value={secret} onChange={(e) => setSecret(e.target.value)} />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Opcional. Si lo pones, cada aviso viaja firmado con HMAC-SHA256 en la cabecera{" "}
                <code className="font-mono">x-mclog-signature</code>, para que el receptor compruebe que viene de MCLog.
              </span>
            </label>
          </>
        )}

        {type === "email" && (
          <label className={labelClass}>
            Destinatarios
            <input
              className={`mt-1 ${inputClass}`}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="soporte@empresa.com, guardia@empresa.com"
              required
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Separados por comas. El servidor SMTP se configura con las variables <code className="font-mono">SMTP_*</code>{" "}
              del backend.
            </span>
          </label>
        )}

        {type === "telegram" && (
          <div className="flex flex-wrap gap-4">
            <label className={`flex-1 ${labelClass}`}>
              Token del bot
              <input
                className={`mt-1 ${inputClass}`}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="123456:ABC-DEF…"
                required
              />
            </label>
            <label className={`flex-1 ${labelClass}`}>
              Chat ID
              <input className={`mt-1 ${inputClass}`} value={chatId} onChange={(e) => setChatId(e.target.value)} required />
            </label>
          </div>
        )}

        {create.isError && <Alert variant="error">{errorMessage(create.error)}</Alert>}

        <div>
          <PrimaryButton type="submit" loading={create.isPending}>
            Crear canal
          </PrimaryButton>
        </div>
      </form>
    </Card>
  );
};

const ChannelsTab: React.FC = () => {
  const channels = useAlertChannels();
  const update = useUpdateChannel();
  const remove = useDeleteChannel();
  const test = useTestChannel();
  const [probado, setProbado] = useState<{ id: number; ok: boolean; error?: string } | null>(null);

  const probar = async (id: number) => {
    setProbado(null);
    const resultado = await test.mutateAsync(id);
    setProbado({ id, ok: resultado.ok, error: resultado.error });
  };

  return (
    <>
      <ChannelForm />
      <Card title={`Canales (${channels.data?.length ?? 0})`}>
        {channels.isLoading && <Skeleton className="h-16 w-full" />}
        {channels.isError && <Alert variant="error">{errorMessage(channels.error)}</Alert>}

        {channels.data?.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">
            Todavía no hay canales. Crea uno para poder recibir avisos.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {channels.data?.map((channel) => (
            <div key={channel.id} className="rounded-lg border border-slate-200 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {channel.name}
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">
                      {CHANNEL_LABELS[channel.type]}
                    </span>
                    {!channel.enabled && <span className="ml-2 text-xs text-slate-400">desactivado</span>}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {channel.type === "webhook" && String(channel.config.url ?? "")}
                    {channel.type === "email" && (channel.config.to as string[] | undefined)?.join(", ")}
                    {channel.type === "telegram" && `chat ${String(channel.config.chatId ?? "")}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => probar(channel.id)}
                    disabled={test.isPending}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Enviar prueba
                  </button>
                  <button
                    type="button"
                    onClick={() => update.mutate({ id: channel.id, enabled: !channel.enabled })}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {channel.enabled ? "Desactivar" : "Activar"}
                  </button>
                  <ConfirmButton onConfirm={() => remove.mutate(channel.id)} confirmLabel="Sí, eliminar">
                    Eliminar
                  </ConfirmButton>
                </div>
              </div>

              {probado?.id === channel.id && (
                <Alert variant={probado.ok ? "success" : "error"} className="mt-2">
                  {probado.ok ? "Aviso de prueba entregado." : `No se pudo entregar: ${probado.error}`}
                </Alert>
              )}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
};

// --- Reglas ---

const RuleForm: React.FC = () => {
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

  const toggleChannel = (id: number) =>
    setChannelIds((actual) => (actual.includes(id) ? actual.filter((valor) => valor !== id) : [...actual, id]));

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

  return (
    <Card title="Nueva regla">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="flex flex-wrap gap-4">
          <label className={`flex-1 ${labelClass}`}>
            Nombre
            <input
              className={`mt-1 ${inputClass}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Errores de facturación en producción"
              required
            />
          </label>
          <label className={labelClass}>
            Tipo
            <select
              className={`mt-1 ${inputClass}`}
              value={type}
              onChange={(e) => setType(e.target.value as AlertRuleType)}
            >
              <option value="threshold">Umbral de repeticiones</option>
              <option value="new_error_group">Error nuevo</option>
            </select>
          </label>
        </div>

        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {type === "threshold"
            ? "Avisa cuando se acumulan al menos N coincidencias dentro de la ventana."
            : "Avisa cuando aparece un error que no se había visto nunca antes. Es la señal más útil justo después de un despliegue."}
        </p>

        <div className="flex flex-wrap gap-4">
          <label className={`flex-1 ${labelClass}`}>
            Aplicación
            <input
              className={`mt-1 ${inputClass}`}
              value={application}
              onChange={(e) => setApplication(e.target.value)}
              placeholder="Todas"
            />
          </label>
          <label className={labelClass}>
            Entorno
            <select className={`mt-1 ${inputClass}`} value={environment} onChange={(e) => setEnvironment(e.target.value)}>
              <option value="">Todos</option>
              <option value="development">development</option>
              <option value="staging">staging</option>
              <option value="production">production</option>
            </select>
          </label>
          <label className={labelClass}>
            Nivel mínimo
            <select className={`mt-1 ${inputClass}`} value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="error">error</option>
              <option value="warn">warn y error</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className={labelClass}>
            {type === "threshold" ? "Umbral" : "Errores nuevos"}
            <input
              type="number"
              min={1}
              className={`mt-1 ${inputClass}`}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
          </label>
          <label className={labelClass}>
            Ventana (min)
            <input
              type="number"
              min={1}
              max={1440}
              className={`mt-1 ${inputClass}`}
              value={windowMinutes}
              onChange={(e) => setWindowMinutes(Number(e.target.value))}
            />
          </label>
          <label className={labelClass}>
            Silencio tras avisar (min)
            <input
              type="number"
              min={0}
              max={1440}
              className={`mt-1 ${inputClass}`}
              value={cooldownMinutes}
              onChange={(e) => setCooldownMinutes(Number(e.target.value))}
            />
          </label>
        </div>

        <fieldset>
          <legend className={labelClass}>Avisar por</legend>
          {channels.data?.length === 0 ? (
            <p className="mt-1 text-xs text-slate-500">Crea antes un canal en la pestaña anterior.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-3">
              {channels.data?.map((channel) => (
                <label key={channel.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={channelIds.includes(channel.id)}
                    onChange={() => toggleChannel(channel.id)}
                  />
                  {channel.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        {create.isError && <Alert variant="error">{errorMessage(create.error)}</Alert>}

        <div>
          <PrimaryButton type="submit" loading={create.isPending} disabled={channelIds.length === 0}>
            Crear regla
          </PrimaryButton>
          {channelIds.length === 0 && (
            <span className="ml-3 text-xs text-slate-500">Selecciona al menos un canal.</span>
          )}
        </div>
      </form>
    </Card>
  );
};

const RulesTab: React.FC = () => {
  const rules = useAlertRules();
  const update = useUpdateRule();
  const remove = useDeleteRule();

  return (
    <>
      <RuleForm />
      <Card title={`Reglas (${rules.data?.length ?? 0})`}>
        {rules.isLoading && <Skeleton className="h-16 w-full" />}
        {rules.isError && <Alert variant="error">{errorMessage(rules.error)}</Alert>}

        {rules.data?.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">Todavía no hay reglas.</p>
        )}

        <div className="flex flex-col gap-2">
          {rules.data?.map((rule) => (
            <div key={rule.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {rule.name}
                  {!rule.enabled && <span className="ml-2 text-xs font-normal text-slate-400">desactivada</span>}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {rule.type === "new_error_group"
                    ? `${rule.threshold} error(es) nuevo(s) en ${rule.windowMinutes} min`
                    : `${rule.threshold} o más en ${rule.windowMinutes} min`}
                  {" · "}
                  {rule.application ?? "todas las apps"}
                  {rule.environment ? ` · ${rule.environment}` : ""}
                  {" · nivel "}
                  {rule.level}
                  {" · avisa por "}
                  {rule.channels.map((channel) => channel.name).join(", ") || "ningún canal"}
                </p>
                {rule.lastTriggeredAt && (
                  <p className="text-xs text-slate-400">
                    Último aviso: {new Date(rule.lastTriggeredAt).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => update.mutate({ id: rule.id, enabled: !rule.enabled })}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {rule.enabled ? "Desactivar" : "Activar"}
                </button>
                <ConfirmButton onConfirm={() => remove.mutate(rule.id)} confirmLabel="Sí, eliminar">
                  Eliminar
                </ConfirmButton>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
};

// --- Historial ---

const HistoryTab: React.FC = () => {
  const events = useAlertEvents();

  return (
    <Card title="Últimos avisos">
      {events.isLoading && <Skeleton className="h-16 w-full" />}
      {events.isError && <Alert variant="error">{errorMessage(events.error)}</Alert>}

      {events.data?.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-500">Ninguna regla se ha disparado todavía.</p>
      )}

      <div className="flex flex-col gap-2">
        {events.data?.map((event) => {
          const fallidos = event.deliveries.filter((entrega) => !entrega.ok);
          return (
            <div key={event.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-slate-900">{event.rule.name}</span>
                <span className="text-xs text-slate-500">{new Date(event.triggeredAt).toLocaleString()}</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-600">
                {event.count} coincidencia{event.count === 1 ? "" : "s"} · entregado a{" "}
                {event.deliveries.length - fallidos.length} de {event.deliveries.length} canal
                {event.deliveries.length === 1 ? "" : "es"}
              </p>
              {fallidos.length > 0 && (
                <Alert variant="error" className="mt-2">
                  {fallidos.map((entrega) => `${entrega.channelName}: ${entrega.error}`).join(" · ")}
                </Alert>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default function AlertsPage() {
  const me = useMe();
  const [tab, setTab] = useState<Tab>("channels");

  if (me.isSuccess && me.data.role !== "admin") {
    return (
      <DashboardLayout title="Alertas">
        <Alert variant="error">Esta sección requiere rol de administrador.</Alert>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Alertas" bare>
      <p className="text-sm text-slate-600">
        Una <strong>regla</strong> define cuándo avisar y un <strong>canal</strong> por dónde. El servicio comprueba las
        reglas cada minuto, y tras disparar una la silencia el tiempo que indiques, para que un incidente de una hora no
        genere sesenta avisos iguales.
      </p>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? "page" : undefined}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === item.id
                ? "border-primary-600 text-primary-700"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "channels" && <ChannelsTab />}
      {tab === "rules" && <RulesTab />}
      {tab === "history" && <HistoryTab />}
    </DashboardLayout>
  );
}
