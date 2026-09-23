"use client";
import React, { useState } from "react";
import { Alert } from "@/components/atoms/Alert";
import { Button } from "@/components/atoms/Button";
import { Checkbox } from "@/components/atoms/Checkbox";
import { EmptyState } from "@/components/atoms/EmptyState";
import { Field, Fieldset } from "@/components/atoms/Field";
import { Input } from "@/components/atoms/Input";
import { Skeleton } from "@/components/atoms/Skeleton";
import { Tag } from "@/components/atoms/Tag";
import { Card } from "@/components/molecules/Card";
import { ConfirmButton } from "@/components/molecules/ConfirmButton";
import { CopyButton } from "@/components/molecules/CopyButton";
import { DatePicker } from "@/components/molecules/DatePicker";
import { Dialog } from "@/components/molecules/Dialog";
import { addDays, fromDateValue, startOfDay } from "@/components/molecules/Calendar";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { errorMessage } from "@/common/api/errorMessage";
import { useI18n } from "@/common/i18n/I18nProvider";
import { useWorkspace } from "@/hooks/useWorkspaces";
import { ApiKeyScope, CreatedApiKey, useApiKeys, useCreateApiKey, useRevokeApiKey } from "@/hooks/useApiKeys";

const SCOPES: ApiKeyScope[] = ["ingest", "read", "metrics"];

/** Dialogo con el secreto recien creado. Solo se cierra confirmando que se guardo. */
const NewKeyDialog: React.FC<{ created: CreatedApiKey | null; onClose: () => void }> = ({ created, onClose }) => {
  const { t } = useI18n();
  return (
    <Dialog
      open={created !== null}
      onClose={onClose}
      dismissible={false}
      icon="key"
      title={created ? t.apiKeys.created(created.apiKey.name) : ""}
      footer={
        <Button variant="primary" icon="check" onClick={onClose}>
          {t.apiKeys.saved}
        </Button>
      }
    >
      {created && (
        <div className="flex flex-col gap-3">
          <Alert variant="warning">{t.apiKeys.createdWarning}</Alert>
          <div className="flex items-center gap-2 rounded-xl bg-code p-2 pl-3.5">
            <code className="min-w-0 flex-1 break-all font-mono text-[0.8125rem] text-code-ink">{created.key}</code>
            <CopyButton
              text={created.key}
              label={t.common.copy}
              variant="ghost"
              className="shrink-0 bg-white/10 text-[#d7e3e8] hover:bg-white/20 hover:text-white"
            />
          </div>
        </div>
      )}
    </Dialog>
  );
};

const CreateKeyForm: React.FC<{ onCreated: (created: CreatedApiKey) => void }> = ({ onCreated }) => {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>(["ingest"]);
  const [applications, setApplications] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const create = useCreateApiKey();

  const toggleScope = (scope: ApiKeyScope, checked: boolean) =>
    setScopes((current) => (checked ? [...current, scope] : current.filter((item) => item !== scope)));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    // La caducidad se envia al final del dia elegido, no a las 00:00.
    const expiry = expiresAt ? fromDateValue(expiresAt) : null;
    if (expiry) expiry.setHours(23, 59, 59, 999);
    const created = await create.mutateAsync({
      name: name.trim(),
      scopes,
      applications: applications
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      expiresAt: expiry ? expiry.toISOString() : null,
    });
    onCreated(created);
    setName("");
    setScopes(["ingest"]);
    setApplications("");
    setExpiresAt("");
  };

  return (
    <Card title={t.apiKeys.newKey} divider>
      <form className="flex flex-col gap-5" onSubmit={submit}>
        <Field label={t.apiKeys.name} hint={t.apiKeys.nameHint} info={t.fieldInfo.apiKeys.name}>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t.apiKeys.namePlaceholder} maxLength={120} required />
        </Field>

        <Fieldset legend={t.apiKeys.scopes} info={t.fieldInfo.apiKeys.scopes} hint={scopes.length === 0 ? t.apiKeys.scopeRequired : undefined}>
          {SCOPES.map((scope) => (
            <Checkbox
              key={scope}
              variant="card"
              checked={scopes.includes(scope)}
              onChange={(checked) => toggleScope(scope, checked)}
              label={<span className="font-mono">{scope}</span>}
              description={t.apiKeys.scopeDescriptions[scope]}
            />
          ))}
        </Fieldset>

        <Field label={t.apiKeys.applications} hint={t.apiKeys.applicationsHint} aside={t.common.optional} info={t.fieldInfo.apiKeys.applications}>
          <Input value={applications} onChange={(event) => setApplications(event.target.value)} placeholder={t.apiKeys.applicationsPlaceholder} />
        </Field>

        <Field label={t.apiKeys.expiry} hint={t.apiKeys.expiryHint} aside={t.common.optional} info={t.fieldInfo.apiKeys.expiry}>
          <DatePicker
            value={expiresAt}
            onChange={setExpiresAt}
            placeholder={t.apiKeys.noExpiry}
            minDate={addDays(startOfDay(new Date()), 1)}
          />
        </Field>

        {create.isError && <Alert variant="error">{errorMessage(create.error, t.common.unknownError)}</Alert>}

        <Button type="submit" variant="primary" icon="plus" loading={create.isPending} disabled={scopes.length === 0 || !name.trim()}>
          {t.apiKeys.create}
        </Button>
      </form>
    </Card>
  );
};

const KeysTable: React.FC = () => {
  const { t, fmt } = useI18n();
  const keys = useApiKeys();
  const revoke = useRevokeApiKey();
  const data = keys.data ?? [];

  return (
    <Card title={`${t.apiKeys.keys} · ${data.length}`} divider flush>
      {keys.isLoading ? (
        <div className="flex flex-col gap-2 p-5">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : keys.isError ? (
        <div className="p-5">
          <Alert variant="error">{errorMessage(keys.error, t.apiKeys.loadError)}</Alert>
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon="key" title={t.apiKeys.empty} description={t.apiKeys.emptyHint} />
      ) : (
        <>
          {revoke.isError && (
            <div className="px-5 pt-4">
              <Alert variant="error">{errorMessage(revoke.error, t.common.unknownError)}</Alert>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-surface-2 text-left">
                  {[
                    t.apiKeys.columns.name,
                    t.apiKeys.columns.prefix,
                    t.apiKeys.columns.scopes,
                    t.apiKeys.columns.applications,
                    t.apiKeys.columns.lastUsed,
                    t.apiKeys.columns.status,
                    "",
                  ].map((label, index) => (
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
                {data.map((key) => {
                  const expired = key.expiresAt !== null && new Date(key.expiresAt) <= new Date();
                  const inactive = key.revokedAt !== null || expired;
                  return (
                    <tr key={key.id} className={`transition-colors hover:bg-surface-2 ${inactive ? "opacity-60" : ""}`}>
                      <td className="border-b border-line py-3 pl-5 pr-4">
                        <p className="font-medium text-ink">{key.name}</p>
                        {key.expiresAt && (
                          <p className="text-xs text-ink-3">
                            {t.apiKeys.columns.expires}: {fmt.date(key.expiresAt)}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap border-b border-line px-4 py-3 font-mono text-xs text-ink-2">{key.prefix}…</td>
                      <td className="border-b border-line px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {key.scopes.map((scope) => (
                            <Tag key={scope} mono tone={scope === "ingest" ? "brand" : scope === "read" ? "info" : "neutral"}>
                              {scope}
                            </Tag>
                          ))}
                        </div>
                      </td>
                      <td className="border-b border-line px-4 py-3 font-mono text-xs text-ink-2">
                        {key.applications.length > 0 ? key.applications.join(", ") : t.apiKeys.allApps}
                      </td>
                      <td className="whitespace-nowrap border-b border-line px-4 py-3 text-xs text-ink-2" title={key.lastUsedAt ? fmt.dateTime(key.lastUsedAt) : undefined}>
                        {key.lastUsedAt ? fmt.relative(key.lastUsedAt) : t.apiKeys.never}
                      </td>
                      <td className="border-b border-line px-4 py-3">
                        <Tag tone={key.revokedAt ? "danger" : expired ? "warning" : "success"}>
                          {key.revokedAt ? t.apiKeys.status.revoked : expired ? t.apiKeys.status.expired : t.apiKeys.status.active}
                        </Tag>
                      </td>
                      <td className="border-b border-line py-3 pl-4 pr-5 text-right">
                        {!inactive && (
                          <ConfirmButton
                            onConfirm={() => revoke.mutate(key.id)}
                            confirmLabel={t.apiKeys.confirmRevoke}
                            pending={revoke.isPending && revoke.variables === key.id}
                            icon="lock"
                          >
                            {t.apiKeys.revoke}
                          </ConfirmButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-xs text-ink-3">{t.apiKeys.revokeNote}</p>
        </>
      )}
    </Card>
  );
};

export default function ApiKeysPage() {
  const { t } = useI18n();
  const workspace = useWorkspace();
  const [created, setCreated] = useState<CreatedApiKey | null>(null);

  if (workspace.ready && workspace.current && !workspace.isOwner) {
    return (
      <DashboardLayout title={t.apiKeys.title} eyebrow={t.apiKeys.eyebrow} width="narrow">
        <Alert variant="error">{t.common.ownerOnly}</Alert>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={t.apiKeys.title} eyebrow={t.apiKeys.eyebrow} description={t.apiKeys.description}>
      <div className="grid items-start gap-4 2xl:grid-cols-[26rem_minmax(0,1fr)] 3xl:gap-5">
        <CreateKeyForm onCreated={setCreated} />
        <KeysTable />
      </div>
      <NewKeyDialog created={created} onClose={() => setCreated(null)} />
    </DashboardLayout>
  );
}
