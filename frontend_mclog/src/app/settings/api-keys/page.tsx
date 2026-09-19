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
  ApiKeyScope,
  CreatedApiKey,
  SCOPE_DESCRIPTIONS,
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
} from "@/hooks/useApiKeys";

const SCOPES: ApiKeyScope[] = ["ingest", "read", "metrics"];

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString() : "—");

/** Panel que muestra el secreto recien creado. Solo aparece una vez. */
const NewKeyPanel: React.FC<{ created: CreatedApiKey; onClose: () => void }> = ({ created, onClose }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created.key);
      setCopied(true);
    } catch {
      // Sin permiso de portapapeles (o sin HTTPS): el valor sigue visible y
      // seleccionable a mano, asi que no hace falta avisar de nada.
    }
  };

  return (
    <Card title={`Clave creada: ${created.apiKey.name}`}>
      <Alert variant="success" className="mb-3">
        Copia la clave ahora. En la base de datos solo queda su hash, así que esta es la única vez que se muestra.
      </Alert>
      <div className="flex flex-wrap items-center gap-2">
        <code className="flex-1 break-all rounded-lg bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100">
          {created.key}
        </code>
        <PrimaryButton type="button" onClick={copy}>
          {copied ? "Copiada" : "Copiar"}
        </PrimaryButton>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Ya la he guardado
        </button>
      </div>
    </Card>
  );
};

const CreateKeyForm: React.FC<{ onCreated: (created: CreatedApiKey) => void }> = ({ onCreated }) => {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>(["ingest"]);
  const [applications, setApplications] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const create = useCreateApiKey();

  const toggleScope = (scope: ApiKeyScope) =>
    setScopes((current) => (current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope]));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const created = await create.mutateAsync({
      name: name.trim(),
      scopes,
      applications: applications
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    });
    onCreated(created);
    setName("");
    setScopes(["ingest"]);
    setApplications("");
    setExpiresAt("");
  };

  return (
    <Card title="Nueva clave">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <label className="text-sm font-medium text-slate-700">
          Nombre
          <input
            className={`mt-1 ${inputClass}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. NetSuite producción"
            maxLength={120}
            required
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">
            Para reconocerla después en esta lista.
          </span>
        </label>

        <fieldset>
          <legend className="text-sm font-medium text-slate-700">Permisos</legend>
          <div className="mt-2 flex flex-col gap-2">
            {SCOPES.map((scope) => (
              <label key={scope} className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={scopes.includes(scope)}
                  onChange={() => toggleScope(scope)}
                />
                <span>
                  <code className="font-mono text-xs">{scope}</code>
                  <span className="ml-2 text-slate-500">{SCOPE_DESCRIPTIONS[scope]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="text-sm font-medium text-slate-700">
          Aplicaciones
          <input
            className={`mt-1 ${inputClass}`}
            value={applications}
            onChange={(e) => setApplications(e.target.value)}
            placeholder="facturacion, ventas"
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">
            Separadas por comas. Si lo dejas vacío, la clave alcanza a todas las aplicaciones. Acotarla impide tanto
            escribir como leer fuera de esa lista.
          </span>
        </label>

        <label className="text-sm font-medium text-slate-700">
          Caducidad
          <input
            type="date"
            className={`mt-1 ${inputClass}`}
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">Opcional. Vacío = sin caducidad.</span>
        </label>

        {create.isError && <Alert variant="error">{errorMessage(create.error)}</Alert>}

        <div>
          <PrimaryButton type="submit" loading={create.isPending} disabled={scopes.length === 0 || !name.trim()}>
            Crear clave
          </PrimaryButton>
          {scopes.length === 0 && (
            <span className="ml-3 text-xs text-slate-500">Selecciona al menos un permiso.</span>
          )}
        </div>
      </form>
    </Card>
  );
};

const KeysTable: React.FC = () => {
  const keys = useApiKeys();
  const revoke = useRevokeApiKey();

  if (keys.isLoading) {
    return (
      <Card title="Claves">
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (keys.isError) {
    return (
      <Card title="Claves">
        <Alert variant="error">{errorMessage(keys.error, "No pudimos cargar las claves")}</Alert>
      </Card>
    );
  }

  const data = keys.data ?? [];

  return (
    <Card title={`Claves (${data.length})`}>
      {revoke.isError && <Alert variant="error" className="mb-3">{errorMessage(revoke.error)}</Alert>}

      {data.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          Todavía no hay claves. Crea una para que tus aplicaciones envíen logs o para que una IA los consulte.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-slate-800">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="py-2 pr-4">Nombre</th>
                <th className="py-2 pr-4">Prefijo</th>
                <th className="py-2 pr-4">Permisos</th>
                <th className="py-2 pr-4">Aplicaciones</th>
                <th className="py-2 pr-4">Último uso</th>
                <th className="py-2 pr-4">Estado</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {data.map((key) => {
                const expirada = key.expiresAt !== null && new Date(key.expiresAt) <= new Date();
                const inactiva = key.revokedAt !== null || expirada;
                return (
                  <tr key={key.id} className={`border-b border-slate-100 ${inactiva ? "text-slate-400" : ""}`}>
                    <td className="py-2 pr-4 font-medium">{key.name}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{key.prefix}</td>
                    <td className="py-2 pr-4 text-xs">{key.scopes.join(", ")}</td>
                    <td className="py-2 pr-4 text-xs">
                      {key.applications.length > 0 ? key.applications.join(", ") : "todas"}
                    </td>
                    <td className="py-2 pr-4 text-xs">{formatDate(key.lastUsedAt)}</td>
                    <td className="py-2 pr-4 text-xs">
                      {key.revokedAt ? "revocada" : expirada ? "caducada" : "activa"}
                    </td>
                    <td className="py-2 text-right">
                      {!inactiva && (
                        <ConfirmButton
                          onConfirm={() => revoke.mutate(key.id)}
                          confirmLabel="Sí, revocar"
                          pending={revoke.isPending && revoke.variables === key.id}
                        >
                          Revocar
                        </ConfirmButton>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-500">
            Revocar es inmediato y no se puede deshacer: la clave deja de servir en la siguiente petición.
          </p>
        </div>
      )}
    </Card>
  );
};

export default function ApiKeysPage() {
  const me = useMe();
  const [created, setCreated] = useState<CreatedApiKey | null>(null);

  if (me.isSuccess && me.data.role !== "admin") {
    return (
      <DashboardLayout title="API keys">
        <Alert variant="error">Esta sección requiere rol de administrador.</Alert>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="API keys" bare>
      <p className="text-sm text-slate-600">
        Las claves autentican a las máquinas. Una clave de <code className="font-mono text-xs">ingest</code> solo puede
        escribir logs: aunque se filtre, no expone lo que ya está almacenado. Para que una IA lea errores, crea una de{" "}
        <code className="font-mono text-xs">read</code>.
      </p>

      {created && <NewKeyPanel created={created} onClose={() => setCreated(null)} />}
      <CreateKeyForm onCreated={setCreated} />
      <KeysTable />
    </DashboardLayout>
  );
}
