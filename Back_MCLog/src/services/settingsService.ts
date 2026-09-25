import { Prisma } from "@prisma/client";
import { config } from "../config/env";
import logger from "../config/logger";
import { prisma } from "../config/prisma";

/**
 * Configuracion de la aplicacion que la cuenta root cambia en caliente.
 *
 * El catalogo es cerrado: solo existen las claves de `SETTINGS`, cada una con
 * su tipo, sus limites y su valor predeterminado. El predeterminado sale de la
 * variable de entorno equivalente, si la hay, y se lee en cada consulta: sin
 * fila en `AppSetting`, todo se comporta igual que antes de existir esto.
 *
 * Los valores se sirven desde memoria, porque algunos se consultan en el
 * camino caliente (ingesta, exportacion). Se recargan al guardar y, para que
 * varias instancias converjan, cada minuto.
 *
 * Lo que no esta aqui (secretos, CORS, cookies, JWT) sigue siendo solo de
 * entorno a proposito: cambiarlo en caliente abriria puertas o tumbaria sesiones.
 */

export const SETTING_CATEGORIES = ["workspaces", "logs", "features", "security"] as const;

/**
 * Retencion de logs, en meses. Siempre se borra algo: como minimo se guardan
 * tres meses y como maximo cinco anos. No hay "nunca": la tabla no debe crecer
 * sin limite. Un RETENTION_MONTHS fuera de rango se acota, no se rechaza.
 */
export const RETENTION_MIN_MONTHS = 3;
export const RETENTION_MAX_MONTHS = 60;
const clampRetention = (months: number) => Math.min(RETENTION_MAX_MONTHS, Math.max(RETENTION_MIN_MONTHS, Math.round(months)));
export type SettingCategory = (typeof SETTING_CATEGORIES)[number];

type NumberSetting = { type: "number"; category: SettingCategory; min: number; max: number; default: () => number };
type BooleanSetting = { type: "boolean"; category: SettingCategory; default: () => boolean };
type SettingDefinition = NumberSetting | BooleanSetting;

export const SETTINGS = {
  // --- Espacios e invitaciones. 0 = sin limite. ---
  /** Miembros por espacio, contando las invitaciones pendientes. */
  maxWorkspaceMembers: { type: "number", category: "workspaces", min: 0, max: 10_000, default: () => 0 },
  /** Altas de miembros por espacio en 24 h: frena el envio masivo de invitaciones. */
  maxInvitationsPerDay: { type: "number", category: "workspaces", min: 0, max: 10_000, default: () => 0 },
  /** Dias que vale un enlace de invitacion. */
  invitationTtlDays: { type: "number", category: "workspaces", min: 1, max: 30, default: () => 7 },
  /** Si cualquier cuenta puede crear espacios, o solo los admins de plataforma. */
  allowWorkspaceCreation: { type: "boolean", category: "workspaces", default: () => true },
  /** Espacios que una cuenta puede crear por su cuenta (los que posee). */
  maxOwnedWorkspaces: { type: "number", category: "workspaces", min: 0, max: 1_000, default: () => 0 },

  // --- Logs ---
  /** Meses que se conservan los logs antes de borrarse (3 meses a 5 anos). */
  retentionMonths: {
    type: "number",
    category: "logs",
    min: RETENTION_MIN_MONTHS,
    max: RETENTION_MAX_MONTHS,
    default: () => clampRetention(config.retentionMonths),
  },
  /** Filas maximas de una exportacion CSV/NDJSON. */
  maxExportRows: { type: "number", category: "logs", min: 100, max: 100_000, default: () => config.maxExportRows },
  /** Logs maximos en un lote de ingesta. */
  maxBatchSize: { type: "number", category: "logs", min: 1, max: 5_000, default: () => config.maxBatchSize },
  /** Conexiones simultaneas al stream en vivo, por instancia. */
  maxLiveConnections: { type: "number", category: "logs", min: 1, max: 1_000, default: () => config.sseMaxConnections },
  /** Logs que guarda un snapshot, como mucho. Cada uno es una copia: pesa en la base de datos. */
  maxSnapshotRows: { type: "number", category: "logs", min: 10, max: 2_000, default: () => 500 },
  /** Snapshots vigentes por espacio. 0 = sin limite. */
  maxSnapshotsPerWorkspace: { type: "number", category: "logs", min: 0, max: 10_000, default: () => 100 },

  // --- Funciones ---
  /** Endpoint MCP para asistentes de IA. */
  mcpEnabled: { type: "boolean", category: "features", default: () => config.mcpEnabled },
  /** Evaluacion de reglas de alerta. Apagarlo silencia todos los avisos. */
  alertsEnabled: { type: "boolean", category: "features", default: () => true },
  /** Lab de pruebas (y con el, la ingesta con sesion de usuario). */
  labEnabled: { type: "boolean", category: "features", default: () => true },
  /** Snapshots publicos: enlaces que se abren sin cuenta. Los de equipo no dependen de esto. */
  publicSnapshotsEnabled: { type: "boolean", category: "features", default: () => true },

  // --- Seguridad ---
  /** Minutos que vale un enlace de "olvide mi contrasena". */
  passwordResetTtlMinutes: { type: "number", category: "security", min: 5, max: 1_440, default: () => config.passwordResetTtlMinutes },
} satisfies Record<string, SettingDefinition>;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = (typeof SETTINGS)[K] extends { type: "number" } ? number : boolean;

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

const isSettingKey = (key: string): key is SettingKey => Object.prototype.hasOwnProperty.call(SETTINGS, key);

/** Valores guardados que ya pasaron la validacion. */
const overrides = new Map<SettingKey, number | boolean>();

/** Valor vigente: el guardado o, si no hay, el predeterminado. Sincrono: sirve desde memoria. */
export const getSetting = <K extends SettingKey>(key: K): SettingValue<K> =>
  (overrides.has(key) ? overrides.get(key) : SETTINGS[key].default()) as SettingValue<K>;

/** Valida un valor contra su definicion. Devuelve el mensaje de error o null. */
export const validateSetting = (key: string, value: unknown): string | null => {
  if (!isSettingKey(key)) return "Unknown setting";
  const definition: SettingDefinition = SETTINGS[key];
  if (definition.type === "boolean") return typeof value === "boolean" ? null : "Must be true or false";
  if (typeof value !== "number" || !Number.isInteger(value)) return "Must be an integer";
  if (value < definition.min || value > definition.max) return `Must be between ${definition.min} and ${definition.max}`;
  return null;
};

/** Recarga los valores desde la base de datos. Una fila invalida se ignora, no tumba nada. */
export const refreshSettings = async () => {
  const rows = await prisma.appSetting.findMany();
  overrides.clear();
  for (const row of rows) {
    if (isSettingKey(row.key) && validateSetting(row.key, row.value) === null) {
      overrides.set(row.key, row.value as number | boolean);
    } else {
      logger.warn("Ignoring invalid app setting", { key: row.key });
    }
  }
};

const SYNC_INTERVAL_MS = 60_000;
let syncTimer: NodeJS.Timeout | null = null;

/** Carga inicial y recarga periodica, para que varias instancias vean el mismo valor. */
export const startSettingsSync = async () => {
  await refreshSettings();
  if (syncTimer) return;
  syncTimer = setInterval(() => {
    refreshSettings().catch((error) => logger.error("Settings refresh failed", { error: String(error) }));
  }, SYNC_INTERVAL_MS);
  syncTimer.unref();
};

export const stopSettingsSync = () => {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = null;
};

export type SettingView = {
  key: SettingKey;
  category: SettingCategory;
  type: "number" | "boolean";
  min?: number;
  max?: number;
  value: number | boolean;
  defaultValue: number | boolean;
  /** true si hay un valor guardado que sustituye al predeterminado. */
  overridden: boolean;
  updatedAt: Date | null;
  updatedBy: string | null;
};

/** El catalogo completo con el valor vigente de cada clave y quien la cambio por ultima vez. */
export const listSettings = async (): Promise<SettingView[]> => {
  await refreshSettings();
  const rows = await prisma.appSetting.findMany({ include: { updatedBy: { select: { email: true } } } });
  const byKey = new Map(rows.map((row) => [row.key, row]));

  return SETTING_KEYS.map((key) => {
    const definition: SettingDefinition = SETTINGS[key];
    const row = overrides.has(key) ? byKey.get(key) : undefined;
    return {
      key,
      category: definition.category,
      type: definition.type,
      ...(definition.type === "number" ? { min: definition.min, max: definition.max } : {}),
      value: getSetting(key),
      defaultValue: definition.default(),
      overridden: overrides.has(key),
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy?.email ?? null,
    };
  });
};

export class SettingsValidationError extends Error {
  constructor(readonly errors: Record<string, string>) {
    super("Invalid settings");
    this.name = "SettingsValidationError";
  }
}

/**
 * Guarda varios valores de una vez. Se validan todos antes de escribir nada:
 * o se aplican todos, o ninguno. Devuelve lo que cambio, para dejarlo en el log.
 */
export const updateSettings = async (values: Record<string, unknown>, userId: number) => {
  const errors: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    const problem = validateSetting(key, value);
    if (problem) errors[key] = problem;
  }
  if (Object.keys(errors).length > 0) throw new SettingsValidationError(errors);

  const changes = Object.entries(values).map(([key, value]) => ({
    key: key as SettingKey,
    from: getSetting(key as SettingKey),
    to: value as number | boolean,
  }));

  await prisma.$transaction(
    changes.map(({ key, to }) =>
      prisma.appSetting.upsert({
        where: { key },
        create: { key, value: to as Prisma.InputJsonValue, updatedById: userId },
        update: { value: to as Prisma.InputJsonValue, updatedById: userId },
      }),
    ),
  );
  await refreshSettings();
  return changes.filter((change) => change.from !== change.to);
};

/** Vuelve al valor predeterminado borrando el guardado. */
export const resetSetting = async (key: string) => {
  if (!isSettingKey(key)) throw new SettingsValidationError({ [key]: "Unknown setting" });
  await prisma.appSetting.deleteMany({ where: { key } });
  await refreshSettings();
};
