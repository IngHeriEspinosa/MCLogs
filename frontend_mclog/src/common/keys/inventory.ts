import type { ApiKey, ApiKeyScope } from "@/hooks/useApiKeys";

/**
 * Inventario de API keys de toda la plataforma (admin de plataforma): tipos de
 * la respuesta de GET /api/admin/keys, y como se filtra y ordena en el panel.
 * Los motivos de revision los calcula el backend; aqui solo se presentan.
 */

export type ApiKeyStatus = "active" | "revoked" | "expired";

/** Motivos de revision, de mas a menos grave (mismo orden que el backend). */
export const API_KEY_RISKS = [
  "read-unrestricted",
  "stale",
  "never-used",
  "expiring-soon",
  "ingest-unrestricted",
  "read-no-expiry",
] as const;
export type ApiKeyRisk = (typeof API_KEY_RISKS)[number];

export type RiskSeverity = "high" | "medium" | "low";

/**
 * - high: una clave que puede leer todo su espacio.
 * - medium: una clave que sobra (abandonada o nunca usada) o un emisor a punto de cortarse.
 * - low: buenas practicas que conviene revisar, sin exposicion inmediata.
 */
export const RISK_SEVERITY: Record<ApiKeyRisk, RiskSeverity> = {
  "read-unrestricted": "high",
  stale: "medium",
  "never-used": "medium",
  "expiring-soon": "medium",
  "ingest-unrestricted": "low",
  "read-no-expiry": "low",
};

const SEVERITY_RANK: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 };

export type InventoryKey = ApiKey & {
  workspaceId: number;
  workspace: { id: number; name: string };
  createdBy: { id: number; email: string } | null;
  status: ApiKeyStatus;
  risks: ApiKeyRisk[];
};

export type InventorySummary = {
  total: number;
  active: number;
  inactive: number;
  activeRead: number;
  withRisks: number;
  mcpActive: number;
  workspaces: number;
};

export type InventoryThresholds = {
  staleAfterDays: number;
  neverUsedGraceDays: number;
  expiringSoonDays: number;
  mcpActiveDays: number;
};

export type ApiKeyInventory = {
  data: InventoryKey[];
  summary: InventorySummary;
  legacyKey: { enabled: boolean };
  thresholds: InventoryThresholds;
};

/** attention = activas con algun aviso; inactive = revocadas o caducadas. */
export type InventoryView = "attention" | "active" | "inactive" | "all";

export type InventoryFilters = {
  view: InventoryView;
  scope: ApiKeyScope | "all";
  workspaceId: number | "all";
  query: string;
};

export const DEFAULT_INVENTORY_FILTERS: InventoryFilters = { view: "active", scope: "all", workspaceId: "all", query: "" };

/** Gravedad del peor aviso de la clave, o null si no tiene ninguno. */
export const worstSeverity = (key: Pick<InventoryKey, "risks">): RiskSeverity | null =>
  key.risks.reduce<RiskSeverity | null>(
    (worst, risk) => (worst === null || SEVERITY_RANK[RISK_SEVERITY[risk]] < SEVERITY_RANK[worst] ? RISK_SEVERITY[risk] : worst),
    null,
  );

const matchesView = (key: InventoryKey, view: InventoryView) => {
  switch (view) {
    case "attention":
      return key.status === "active" && key.risks.length > 0;
    case "active":
      return key.status === "active";
    case "inactive":
      return key.status !== "active";
    case "all":
      return true;
  }
};

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** Busca en nombre, prefijo, espacio, aplicaciones y creador, sin distinguir mayusculas ni tildes. */
const matchesQuery = (key: InventoryKey, query: string) => {
  const needle = normalize(query);
  if (!needle) return true;
  return [key.name, key.prefix, key.workspace.name, key.createdBy?.email ?? "", ...key.applications].some((field) =>
    normalize(field).includes(needle),
  );
};

export const filterInventory = (keys: InventoryKey[], filters: InventoryFilters): InventoryKey[] =>
  keys.filter(
    (key) =>
      matchesView(key, filters.view) &&
      (filters.scope === "all" || key.scopes.includes(filters.scope)) &&
      (filters.workspaceId === "all" || key.workspace.id === filters.workspaceId) &&
      matchesQuery(key, filters.query),
  );

/**
 * Lo que pide atencion, primero: activas antes que inactivas; dentro de ellas,
 * el aviso mas grave, luego las que acumulan mas avisos y, a igualdad, la mas
 * reciente. No modifica la lista recibida.
 */
export const sortInventory = (keys: InventoryKey[]): InventoryKey[] => {
  const rank = (key: InventoryKey) => {
    const worst = worstSeverity(key);
    return worst === null ? 3 : SEVERITY_RANK[worst];
  };
  return [...keys].sort(
    (a, b) =>
      Number(b.status === "active") - Number(a.status === "active") ||
      rank(a) - rank(b) ||
      b.risks.length - a.risks.length ||
      Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
      b.id - a.id,
  );
};

/** Numero de claves de cada vista, para las pestanas. */
export const countByView = (keys: InventoryKey[]): Record<InventoryView, number> => ({
  attention: keys.filter((key) => matchesView(key, "attention")).length,
  active: keys.filter((key) => matchesView(key, "active")).length,
  inactive: keys.filter((key) => matchesView(key, "inactive")).length,
  all: keys.length,
});

/** Espacios presentes en el inventario, por nombre, para el filtro. */
export const inventoryWorkspaces = (keys: InventoryKey[]) =>
  [...new Map(keys.map((key) => [key.workspace.id, key.workspace])).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
