import "dotenv/config";

const bool = (value: string | undefined) => value === "1" || value === "true";
/** Booleano cuyo valor por defecto es true: solo un "0"/"false" explicito lo desactiva. */
const boolDefaultTrue = (value: string | undefined) => (value === undefined || value === "" ? true : bool(value));
/** Entero que admite 0 como valor valido (a diferencia de `int`, que lo trata como ausente). */
const intAllowingZero = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};
const int = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: int(process.env.PORT, 3000),
  apiKey: process.env.API_KEY || "change-me",
  bodyLimit: process.env.BODY_LIMIT || "3mb",
  logLevel: process.env.LOG_LEVEL || "info",

  // Rate limiting: consultas (dashboard) e ingesta (apps que envían logs) por separado
  rateLimitWindowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  rateLimitMax: int(process.env.RATE_LIMIT_MAX, 600),
  ingestRateLimitWindowMs: int(process.env.INGEST_RATE_LIMIT_WINDOW_MS, 60 * 1000),
  ingestRateLimitMax: int(process.env.INGEST_RATE_LIMIT_MAX, 2000),
  loginRateLimitWindowMs: int(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  loginRateLimitMax: int(process.env.LOGIN_RATE_LIMIT_MAX, 10),

  maxBatchSize: int(process.env.MAX_BATCH_SIZE, 500),
  maxExportRows: int(process.env.MAX_EXPORT_ROWS, 10000),

  // Mantenimiento automatico. RETENTION_DAYS=0 desactiva la purga.
  retentionDays: intAllowingZero(process.env.RETENTION_DAYS, 0),
  schedulerEnabled: boolDefaultTrue(process.env.SCHEDULER_ENABLED),
  /** Endpoint MCP para asistentes de IA. Activo salvo que se desactive a proposito. */
  mcpEnabled: boolDefaultTrue(process.env.MCP_ENABLED),
  /** Tope de conexiones simultaneas al stream en vivo, por instancia. */
  sseMaxConnections: int(process.env.SSE_MAX_CONNECTIONS, 50),
  // Servidor SMTP para los avisos por correo. Sin SMTP_HOST, ese canal falla
  // con un mensaje claro en lugar de quedarse colgado.
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: int(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "MCLog <no-reply@localhost>",
  },

  /** URL publica del dashboard, para construir enlaces en alertas y notificaciones. */
  publicDashboardUrl: process.env.PUBLIC_DASHBOARD_URL?.replace(/\/+$/, "") || "",

  corsOrigins: process.env.CORS_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean),
  trustProxy: bool(process.env.TRUST_PROXY),
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "dev-access-secret",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret",
  jwtAccessTtl: process.env.JWT_ACCESS_TTL || "15m",
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL || "14d",
  forceHttps: bool(process.env.FORCE_HTTPS),
  cookieSecure: bool(process.env.COOKIE_SECURE) || process.env.NODE_ENV === "production",
  cookieDomain: process.env.COOKIE_DOMAIN,
  cookieSameSite: (process.env.COOKIE_SAMESITE as "lax" | "strict" | "none") || "lax",
};

/**
 * Valores de ejemplo que viajan en `.env.example`, y por tanto son publicos.
 * Arrancar en produccion con cualquiera de ellos equivale a no tener secreto.
 */
const PLACEHOLDER_ADMIN_PASSWORDS = new Set(["ChangeMe123!", "changeme", "admin", "password"]);

export const assertProductionConfig = () => {
  if (config.nodeEnv !== "production") return;
  const problems: string[] = [];
  if (config.apiKey === "change-me" || config.apiKey === "dev-key") {
    problems.push("API_KEY sigue con el valor por defecto");
  }
  if (config.jwtAccessSecret === "dev-access-secret") problems.push("JWT_ACCESS_SECRET sigue con el valor por defecto");
  if (config.jwtRefreshSecret === "dev-refresh-secret") problems.push("JWT_REFRESH_SECRET sigue con el valor por defecto");
  if (!config.corsOrigins?.length) problems.push("CORS_ORIGINS no está definido (en producción no se permite cualquier origen)");
  // ensureAdminUser() corre justo despues de esta comprobacion y da de alta al
  // administrador con lo que haya aqui. Sin este control, quien copiase
  // .env.example y rotase solo lo que se le exigia arriba acababa con una cuenta
  // de administrador cuya contrasena esta publicada en el repositorio.
  if (process.env.ADMIN_PASSWORD && PLACEHOLDER_ADMIN_PASSWORDS.has(process.env.ADMIN_PASSWORD)) {
    problems.push("ADMIN_PASSWORD sigue con un valor de ejemplo");
  }
  if (problems.length) {
    throw new Error(`Configuración insegura para producción:\n - ${problems.join("\n - ")}`);
  }
};
