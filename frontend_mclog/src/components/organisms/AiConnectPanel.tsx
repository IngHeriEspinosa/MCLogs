"use client";
import React, { useEffect, useState } from "react";
import { Alert } from "@/components/atoms/Alert";
import { Button, ButtonLink } from "@/components/atoms/Button";
import { Segmented } from "@/components/atoms/Segmented";
import { Tag } from "@/components/atoms/Tag";
import { Card } from "@/components/molecules/Card";
import { CodeBlock } from "@/components/molecules/CodeBlock";
import { CopyButton } from "@/components/molecules/CopyButton";
import { useToast } from "@/components/molecules/Toast";
import { downloadSkill } from "@/common/api/download";
import { useI18n } from "@/common/i18n/I18nProvider";
import {
  INSTALL_SKILL_COMMAND,
  MCP_CLIENTS,
  McpClient,
  buildMcpSnippet,
  mcpUrl,
  snippetLanguage,
} from "@/common/mcp/snippets";
import { API_BASE } from "@/config/api";
import { useMe } from "@/hooks/useAuth";
import { usePublicSettings } from "@/hooks/useSettings";

/** Descarga del skill de IA con aviso del resultado. */
const DownloadSkillButton: React.FC = () => {
  const { t } = useI18n();
  const notify = useToast();
  const [pending, setPending] = useState(false);

  const download = async () => {
    setPending(true);
    try {
      notify(t.toast.downloaded(await downloadSkill()));
    } catch {
      notify(t.apiKeys.ai.downloadFailed, "error");
    } finally {
      setPending(false);
    }
  };

  return (
    <Button icon="download" onClick={download} loading={pending}>
      {t.apiKeys.ai.download}
    </Button>
  );
};

/**
 * Como conectar un asistente de IA a este espacio: estado del MCP en la
 * plataforma, URL, configuracion por cliente y el skill de instalacion.
 *
 * Solo lo ve el dueño del espacio (la pagina de API keys ya lo exige), que es
 * quien puede crear la clave `read` que el asistente necesita. Si la cuenta
 * root ha apagado el MCP, no se ofrece una conexion que no va a responder.
 */
export const AiConnectPanel: React.FC<{ className?: string }> = ({ className = "" }) => {
  const { t } = useI18n();
  const { mcpEnabled } = usePublicSettings();
  const me = useMe();
  const [client, setClient] = useState<McpClient>("claude-code");
  // En produccion la API comparte origen con el panel y API_BASE va vacio: el
  // origen real solo se conoce en el navegador, como en el Lab.
  const [origin, setOrigin] = useState(API_BASE);
  useEffect(() => setOrigin(API_BASE || window.location.origin), []);

  const url = mcpUrl(origin);
  const copy = t.apiKeys.ai;

  return (
    <Card
      className={className}
      title={copy.title}
      description={copy.description}
      divider
      actions={
        <Tag tone={mcpEnabled ? "success" : "warning"}>
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${mcpEnabled ? "bg-success" : "bg-warning"}`} />
          {mcpEnabled ? copy.enabled : copy.disabled}
        </Tag>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {mcpEnabled ? (
            <>
              <div className="flex flex-col gap-1.5">
                <p className="eyebrow">{copy.url}</p>
                <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 py-1.5 pl-3.5 pr-1.5">
                  <code className="min-w-0 flex-1 break-all font-mono text-[0.8125rem] text-ink">{url}</code>
                  <CopyButton text={url} label={t.common.copy} iconOnly size="xs" variant="ghost" />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="eyebrow">{copy.client}</p>
                  <Segmented
                    size="sm"
                    semantics="tabs"
                    label={copy.client}
                    value={client}
                    onChange={setClient}
                    options={MCP_CLIENTS.map((value) => ({ value, label: copy.clients[value] }))}
                  />
                </div>
                <CodeBlock
                  code={buildMcpSnippet(client, url, copy.keyPlaceholder)}
                  language={snippetLanguage(client)}
                  maxHeight="18rem"
                />
                <p className="text-xs leading-relaxed text-ink-3">{copy.keyHint(copy.keyPlaceholder)}</p>
              </div>
            </>
          ) : (
            <Alert
              variant="warning"
              title={copy.disabledTitle}
              action={
                me.data?.isRoot ? (
                  <ButtonLink href="/settings/platform" size="sm" icon="sliders">
                    {copy.enableAction}
                  </ButtonLink>
                ) : undefined
              }
            >
              {me.data?.isRoot ? copy.disabledTextRoot : copy.disabledText}
            </Alert>
          )}
        </div>

        <aside className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4">
          <p className="font-heading text-sm font-semibold text-ink">{copy.skillTitle}</p>
          <p className="text-xs leading-relaxed text-ink-2">{copy.skillDescription}</p>
          {mcpEnabled && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-ink-3">{copy.skillCommand}</p>
              <div className="flex items-center gap-2 rounded-lg bg-code py-1 pl-3 pr-1">
                <code className="min-w-0 flex-1 break-all font-mono text-xs text-code-ink">{INSTALL_SKILL_COMMAND}</code>
                <CopyButton
                  text={INSTALL_SKILL_COMMAND}
                  label={t.common.copy}
                  iconOnly
                  size="xs"
                  variant="ghost"
                  className="bg-white/10 text-[#d7e3e8] hover:bg-white/20 hover:text-white"
                />
              </div>
            </div>
          )}
          <p className="text-xs text-ink-3">{copy.skillManual}</p>
          <div>
            <DownloadSkillButton />
          </div>
        </aside>
      </div>
    </Card>
  );
};
