import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_INVENTORY_FILTERS,
  countByView,
  filterInventory,
  inventoryWorkspaces,
  sortInventory,
  worstSeverity,
} from "@/common/keys/inventory";
import type { InventoryKey } from "@/common/keys/inventory";

const key = (overrides: Partial<InventoryKey>): InventoryKey => ({
  id: 1,
  name: "clave",
  prefix: "mclog_00000000",
  scopes: ["ingest"],
  applications: [],
  createdAt: "2026-09-01T00:00:00.000Z",
  expiresAt: null,
  lastUsedAt: null,
  lastMcpUsedAt: null,
  revokedAt: null,
  workspaceId: 1,
  workspace: { id: 1, name: "Principal" },
  createdBy: null,
  status: "active",
  risks: [],
  ...overrides,
});

const KEYS: InventoryKey[] = [
  key({ id: 1, name: "NetSuite producción", applications: ["SuiteApp-Facturación"], createdBy: { id: 1, email: "ana@acme.com" } }),
  key({ id: 2, name: "Claude Code", scopes: ["read"], risks: ["read-unrestricted", "read-no-expiry"], workspace: { id: 2, name: "Cliente ACME" } }),
  key({ id: 3, name: "Prometheus", scopes: ["metrics"], status: "revoked", revokedAt: "2026-09-10T00:00:00.000Z" }),
  key({ id: 4, name: "ETL ventas", risks: ["stale"], workspace: { id: 2, name: "Cliente ACME" } }),
  key({ id: 5, name: "Script viejo", status: "expired", expiresAt: "2026-09-02T00:00:00.000Z" }),
];

const ids = (keys: InventoryKey[]) => keys.map((k) => k.id);

describe("Filtros del inventario", () => {
  it("por defecto muestra las activas", () => {
    assert.deepEqual(ids(filterInventory(KEYS, DEFAULT_INVENTORY_FILTERS)), [1, 2, 4]);
  });

  it("vistas: con avisos (solo activas), inactivas y todas", () => {
    assert.deepEqual(ids(filterInventory(KEYS, { ...DEFAULT_INVENTORY_FILTERS, view: "attention" })), [2, 4]);
    assert.deepEqual(ids(filterInventory(KEYS, { ...DEFAULT_INVENTORY_FILTERS, view: "inactive" })), [3, 5]);
    assert.equal(filterInventory(KEYS, { ...DEFAULT_INVENTORY_FILTERS, view: "all" }).length, 5);
  });

  it("una clave inactiva con avisos no aparece en 'con avisos'", () => {
    const revoked = key({ id: 9, status: "revoked", risks: ["read-unrestricted"] });
    assert.deepEqual(filterInventory([revoked], { ...DEFAULT_INVENTORY_FILTERS, view: "attention" }), []);
  });

  it("por permiso y por espacio", () => {
    assert.deepEqual(ids(filterInventory(KEYS, { ...DEFAULT_INVENTORY_FILTERS, view: "all", scope: "read" })), [2]);
    assert.deepEqual(ids(filterInventory(KEYS, { ...DEFAULT_INVENTORY_FILTERS, view: "all", workspaceId: 2 })), [2, 4]);
  });

  it("la busqueda cubre nombre, prefijo, espacio, aplicaciones y creador, sin mayusculas ni tildes", () => {
    const search = (query: string) => ids(filterInventory(KEYS, { ...DEFAULT_INVENTORY_FILTERS, view: "all", query }));
    assert.deepEqual(search("NETSUITE PRODUCCION"), [1]);
    assert.deepEqual(search("facturacion"), [1]);
    assert.deepEqual(search("ana@acme"), [1]);
    assert.deepEqual(search("acme"), [1, 2, 4]);
    assert.deepEqual(search("  mclog_0000  ").length, 5);
    assert.deepEqual(search("no existe"), []);
  });
});

describe("Orden del inventario", () => {
  it("activas primero, luego el aviso mas grave, luego mas avisos y luego la mas reciente", () => {
    const sorted = sortInventory([
      key({ id: 10, status: "revoked", risks: [] }),
      key({ id: 11, risks: ["read-no-expiry"] }),
      key({ id: 12, risks: [], createdAt: "2026-09-20T00:00:00.000Z" }),
      key({ id: 13, risks: ["stale", "read-no-expiry"] }),
      key({ id: 14, risks: ["stale"] }),
      key({ id: 15, risks: ["read-unrestricted"] }),
      key({ id: 16, risks: [], createdAt: "2026-09-25T00:00:00.000Z" }),
    ]);
    assert.deepEqual(ids(sorted), [15, 13, 14, 11, 16, 12, 10]);
  });

  it("no modifica la lista original", () => {
    const original = [key({ id: 1 }), key({ id: 2, risks: ["stale"] })];
    sortInventory(original);
    assert.deepEqual(ids(original), [1, 2]);
  });

  it("gravedad del peor aviso", () => {
    assert.equal(worstSeverity({ risks: [] }), null);
    assert.equal(worstSeverity({ risks: ["read-no-expiry", "stale"] }), "medium");
    assert.equal(worstSeverity({ risks: ["ingest-unrestricted", "read-unrestricted"] }), "high");
  });
});

describe("Contadores y espacios", () => {
  it("cuenta cada vista", () => {
    assert.deepEqual(countByView(KEYS), { attention: 2, active: 3, inactive: 2, all: 5 });
  });

  it("lista los espacios sin repetir, por nombre", () => {
    assert.deepEqual(inventoryWorkspaces(KEYS), [
      { id: 2, name: "Cliente ACME" },
      { id: 1, name: "Principal" },
    ]);
  });
});
