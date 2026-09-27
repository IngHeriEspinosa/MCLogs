import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { ApiKey } from '@prisma/client';
import { config } from '../config/env';
import { prisma } from '../config/prisma';

export const API_KEY_SCOPES = ['ingest', 'read', 'metrics'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

/** Identidad de una peticion autenticada con API key. */
export type ApiKeyPrincipal = {
    id: number;
    name: string;
    /** Espacio de la clave: todo lo que escribe o lee queda dentro de el. */
    workspaceId: number;
    scopes: string[];
    /** Aplicaciones permitidas. Vacio = sin restriccion. */
    applications: string[];
    /** true para la clave unica heredada de la variable API_KEY. */
    legacy: boolean;
};

/** ApiKey sin el hash del secreto, apta para devolver por la API. */
export type PublicApiKey = Omit<ApiKey, 'keyHash'>;

const KEY_NAMESPACE = 'mclog';
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

/** Columnas de "ultimo uso" que se actualizan con throttling. */
type UsageField = 'lastUsedAt' | 'lastMcpUsedAt';

/** Marcas de tiempo de la ultima escritura de cada campo, por id de clave. */
const usageWrites: Record<UsageField, Map<number, number>> = {
    lastUsedAt: new Map(),
    lastMcpUsedAt: new Map()
};

/**
 * La clave heredada de la variable API_KEY esta activa si tiene un valor real.
 * No vive en base de datos, asi que no tiene fila, ni ultimo uso, ni se revoca
 * desde el panel.
 */
export const isLegacyApiKeyEnabled = () => Boolean(config.apiKey) && config.apiKey !== 'change-me';

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

/** Comparacion en tiempo constante de dos hashes hex de la misma longitud. */
const hashesMatch = (a: string, b: string) => {
    const left = Buffer.from(a, 'utf8');
    const right = Buffer.from(b, 'utf8');
    return left.length === right.length && timingSafeEqual(left, right);
};

export const toPublicApiKey = (apiKey: ApiKey): PublicApiKey => {
    const { keyHash, ...rest } = apiKey;
    return rest;
};

/**
 * Extrae la parte publica de una clave ("mclog_ab12cd34").
 * El secreto es base64url y puede contener "_", por eso solo se usan los dos
 * primeros segmentos en lugar de trocear la cadena entera.
 */
const extractPrefix = (raw: string): string | null => {
    const parts = raw.split('_');
    if (parts.length < 3) return null;
    const [namespace, id] = parts;
    if (namespace !== KEY_NAMESPACE || !/^[0-9a-f]{8}$/.test(id)) return null;
    return `${namespace}_${id}`;
};

/** Una cadena con la forma de una clave MCLog (no implica que sea valida). */
export const looksLikeApiKey = (raw: string) => extractPrefix(raw) !== null;

export type CreateApiKeyInput = {
    workspaceId: number;
    name: string;
    scopes: string[];
    applications?: string[];
    expiresAt?: Date | null;
    createdById?: number | null;
};

/**
 * Crea una clave y devuelve el secreto en claro **una unica vez**:
 * en base de datos solo queda su hash, asi que no se puede recuperar despues.
 */
export const createApiKey = async (input: CreateApiKeyInput) => {
    const id = randomBytes(4).toString('hex');
    const secret = randomBytes(32).toString('base64url');
    const prefix = `${KEY_NAMESPACE}_${id}`;
    const key = `${prefix}_${secret}`;

    const apiKey = await prisma.apiKey.create({
        data: {
            workspaceId: input.workspaceId,
            name: input.name,
            prefix,
            keyHash: sha256(key),
            scopes: input.scopes,
            applications: input.applications ?? [],
            expiresAt: input.expiresAt ?? null,
            createdById: input.createdById ?? null
        }
    });

    return { key, apiKey: toPublicApiKey(apiKey) };
};

export const listApiKeys = async (workspaceId: number): Promise<PublicApiKey[]> => {
    const keys = await prisma.apiKey.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } });
    return keys.map(toPublicApiKey);
};

/** Idempotente: revocar de nuevo no cambia la fecha original. */
const revokeExisting = async (existing: ApiKey): Promise<PublicApiKey> => {
    if (existing.revokedAt) return toPublicApiKey(existing);
    const updated = await prisma.apiKey.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
    return toPublicApiKey(updated);
};

/**
 * Revoca una clave del espacio. Una clave de otro espacio se trata como
 * inexistente.
 */
export const revokeApiKey = async (id: number, workspaceId: number): Promise<PublicApiKey | null> => {
    const existing = await prisma.apiKey.findFirst({ where: { id, workspaceId } });
    return existing ? revokeExisting(existing) : null;
};

/**
 * Revoca cualquier clave de la plataforma, sea cual sea su espacio: lo usa el
 * admin de plataforma desde el inventario. Las claves de un espacio borrado ya
 * se revocaron con el y se tratan como inexistentes.
 */
export const revokeAnyApiKey = async (id: number): Promise<PublicApiKey | null> => {
    const existing = await prisma.apiKey.findFirst({ where: { id, workspace: { deletedAt: null } } });
    return existing ? revokeExisting(existing) : null;
};

/**
 * Registra el uso de una clave como mucho una vez cada 5 minutos por campo:
 * el ultimo uso es informativo y no justifica un UPDATE por cada peticion.
 */
const touchUsage = (id: number, field: UsageField) => {
    const writes = usageWrites[field];
    const now = Date.now();
    const previous = writes.get(id) ?? 0;
    if (now - previous < LAST_USED_THROTTLE_MS) return;
    writes.set(id, now);
    prisma.apiKey
        .update({ where: { id }, data: { [field]: new Date(now) } })
        .catch(() => writes.delete(id));
};

/**
 * Anota que la clave se uso contra el servidor MCP. `lastUsedAt` ya lo anota
 * la verificacion; este campo aparte distingue a un asistente de IA.
 */
export const touchLastMcpUsed = (id: number) => touchUsage(id, 'lastMcpUsedAt');

/**
 * Valida una clave en claro. Devuelve su identidad, o null si no existe,
 * esta revocada o ha expirado.
 */
export const verifyApiKey = async (raw: string): Promise<ApiKeyPrincipal | null> => {
    const prefix = extractPrefix(raw);
    if (!prefix) return null;

    const apiKey = await prisma.apiKey.findUnique({ where: { prefix } });
    if (!apiKey) return null;
    if (!hashesMatch(apiKey.keyHash, sha256(raw))) return null;
    if (apiKey.revokedAt) return null;
    if (apiKey.expiresAt && apiKey.expiresAt.getTime() <= Date.now()) return null;

    touchUsage(apiKey.id, 'lastUsedAt');

    return {
        id: apiKey.id,
        name: apiKey.name,
        workspaceId: apiKey.workspaceId,
        scopes: apiKey.scopes,
        applications: apiKey.applications,
        legacy: false
    };
};

/** Solo para tests: limpia el estado en memoria del throttling del ultimo uso. */
export const resetApiKeyCaches = () => Object.values(usageWrites).forEach((writes) => writes.clear());
