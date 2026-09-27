import type { ApiKey } from '@prisma/client';
import { prisma } from '../config/prisma';
import { PublicApiKey, isLegacyApiKeyEnabled, toPublicApiKey } from './apiKeyService';

/**
 * Inventario de las API keys de toda la plataforma, para el admin de
 * plataforma. Cada espacio ve solo sus claves; aqui se ven todas juntas, con su
 * espacio, su estado y los motivos por los que conviene revisarlas.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Umbrales de la evaluacion. Se devuelven con el inventario para que el panel los explique. */
export const INVENTORY_THRESHOLDS = {
    /** Una clave usada alguna vez que lleva mas de esto sin usarse se considera abandonada. */
    staleAfterDays: 90,
    /** Margen para empezar a usar una clave recien creada antes de avisar de que nunca se uso. */
    neverUsedGraceDays: 7,
    /** Antelacion con la que se avisa de que una clave va a caducar. */
    expiringSoonDays: 14,
    /** Ventana en la que una clave cuenta como "usada por MCP" en el resumen. */
    mcpActiveDays: 30
} as const;

export type ApiKeyStatus = 'active' | 'revoked' | 'expired';

/**
 * Motivos para revisar una clave activa, de mas a menos grave:
 * - `read-unrestricted`: lee todas las aplicaciones de su espacio.
 * - `stale`: se uso, pero no en `staleAfterDays`. Probablemente sobra.
 * - `never-used`: pasado el margen, nunca se ha usado. Probablemente sobra.
 * - `expiring-soon`: caduca en menos de `expiringSoonDays`; su emisor se cortara.
 * - `ingest-unrestricted`: puede escribir logs en nombre de cualquier aplicacion.
 * - `read-no-expiry`: una clave de lectura sin fecha de caducidad.
 */
export const API_KEY_RISKS = [
    'read-unrestricted',
    'stale',
    'never-used',
    'expiring-soon',
    'ingest-unrestricted',
    'read-no-expiry'
] as const;
export type ApiKeyRisk = (typeof API_KEY_RISKS)[number];

type AssessableKey = Pick<ApiKey, 'scopes' | 'applications' | 'createdAt' | 'expiresAt' | 'lastUsedAt' | 'revokedAt'>;

export const apiKeyStatus = (key: Pick<ApiKey, 'revokedAt' | 'expiresAt'>, now: Date): ApiKeyStatus => {
    if (key.revokedAt) return 'revoked';
    if (key.expiresAt && key.expiresAt.getTime() <= now.getTime()) return 'expired';
    return 'active';
};

/**
 * Motivos de revision de una clave, en el orden de `API_KEY_RISKS`. Una clave
 * revocada o caducada ya no puede hacer nada: no tiene riesgos.
 */
export const assessApiKey = (key: AssessableKey, now: Date): ApiKeyRisk[] => {
    if (apiKeyStatus(key, now) !== 'active') return [];

    const found = new Set<ApiKeyRisk>();
    const unrestricted = key.applications.length === 0;
    const canRead = key.scopes.includes('read');
    const age = now.getTime() - key.createdAt.getTime();

    if (canRead && unrestricted) found.add('read-unrestricted');
    if (canRead && !key.expiresAt) found.add('read-no-expiry');
    if (key.scopes.includes('ingest') && unrestricted) found.add('ingest-unrestricted');

    // `lastUsedAt` se anota en cualquier uso, MCP incluido: basta para saber si se usa.
    if (!key.lastUsedAt) {
        if (age > INVENTORY_THRESHOLDS.neverUsedGraceDays * DAY_MS) found.add('never-used');
    } else if (now.getTime() - key.lastUsedAt.getTime() > INVENTORY_THRESHOLDS.staleAfterDays * DAY_MS) {
        found.add('stale');
    }

    if (key.expiresAt && key.expiresAt.getTime() - now.getTime() <= INVENTORY_THRESHOLDS.expiringSoonDays * DAY_MS) {
        found.add('expiring-soon');
    }

    return API_KEY_RISKS.filter((risk) => found.has(risk));
};

export type InventoryKey = PublicApiKey & {
    workspace: { id: number; name: string };
    /** Quien la creo. null si la cuenta ya no existe o la creo el sistema. */
    createdBy: { id: number; email: string } | null;
    status: ApiKeyStatus;
    risks: ApiKeyRisk[];
};

export type InventorySummary = {
    total: number;
    active: number;
    /** Revocadas o caducadas. */
    inactive: number;
    /** Activas con permiso de lectura: las que pueden sacar datos. */
    activeRead: number;
    /** Activas con al menos un motivo de revision. */
    withRisks: number;
    /** Activas usadas contra el servidor MCP en los ultimos `mcpActiveDays`. */
    mcpActive: number;
    /** Espacios con al menos una clave activa. */
    workspaces: number;
};

export type ApiKeyInventory = {
    data: InventoryKey[];
    summary: InventorySummary;
    /** La clave heredada API_KEY existe, pero no esta en la lista: no vive en base de datos. */
    legacyKey: { enabled: boolean };
    thresholds: typeof INVENTORY_THRESHOLDS;
};

export const summarizeInventory = (keys: InventoryKey[], now: Date): InventorySummary => {
    const active = keys.filter((key) => key.status === 'active');
    const mcpSince = now.getTime() - INVENTORY_THRESHOLDS.mcpActiveDays * DAY_MS;
    return {
        total: keys.length,
        active: active.length,
        inactive: keys.length - active.length,
        activeRead: active.filter((key) => key.scopes.includes('read')).length,
        withRisks: active.filter((key) => key.risks.length > 0).length,
        mcpActive: active.filter((key) => key.lastMcpUsedAt && key.lastMcpUsedAt.getTime() >= mcpSince).length,
        workspaces: new Set(active.map((key) => key.workspace.id)).size
    };
};

/**
 * Todas las claves de los espacios vigentes, de la mas reciente a la mas
 * antigua. Las de espacios borrados se omiten: se revocaron con el espacio y el
 * planificador las elimina al purgarlo.
 */
export const getApiKeyInventory = async (now = new Date()): Promise<ApiKeyInventory> => {
    const rows = await prisma.apiKey.findMany({
        where: { workspace: { deletedAt: null } },
        include: {
            workspace: { select: { id: true, name: true } },
            createdBy: { select: { id: true, email: true } }
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    });

    const data = rows.map(({ workspace, createdBy, ...key }): InventoryKey => ({
        ...toPublicApiKey(key),
        workspace,
        createdBy,
        status: apiKeyStatus(key, now),
        risks: assessApiKey(key, now)
    }));

    return {
        data,
        summary: summarizeInventory(data, now),
        legacyKey: { enabled: isLegacyApiKeyEnabled() },
        thresholds: INVENTORY_THRESHOLDS
    };
};
