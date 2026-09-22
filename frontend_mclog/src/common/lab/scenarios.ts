import type { IconName } from "@/components/atoms/Icon";

/**
 * Escenarios del Lab: lotes de logs de ejemplo que se envian a la API real
 * para ver cada pantalla con datos, sin integrar ninguna aplicacion.
 *
 * Todo va a aplicaciones con el prefijo `lab-`: se distinguen de un vistazo y
 * el boton de limpieza puede borrarlas sin tocar nada mas. Los datos sensibles
 * son ficticios (dominios example.*, IPs de documentacion RFC 5737, tokens
 * inventados).
 */

export const LAB_PREFIX = "lab-";

/** Aplicaciones que usan los escenarios; la limpieza parte de esta lista. */
export const LAB_APPLICATIONS = ["gateway", "auth", "inventory", "billing", "checkout", "worker", "custom"].map(
  (name) => `${LAB_PREFIX}${name}`,
);

export type LabLevel = "debug" | "info" | "warn" | "error";
export type LabEnvironment = "development" | "staging" | "production";

/** Lo que acepta `POST /api/log`; en lote, cada elemento de `logs`. */
export type LabLog = {
  application: string;
  service?: string;
  host?: string;
  level: LabLevel;
  environment: LabEnvironment;
  message: string;
  timestamp?: string;
  traceId?: string;
  spanId?: string;
  errorName?: string;
  errorCode?: string;
  errorStack?: string;
  metadata?: Record<string, unknown>;
};

export type LabLinkKind = "logs" | "errors" | "trace" | "reports" | "alerts" | "liveTab";
export type LabLink = { kind: LabLinkKind; href: string; newTab?: boolean };

export type LabPlan = {
  logs: LabLog[];
  /** "stream" los manda de uno en uno, para verlos llegar en vivo. */
  mode: "batch" | "stream";
  intervalMs?: number;
  links: LabLink[];
};

export type LabScenarioId = "traffic" | "grouping" | "trace" | "incident" | "newError" | "sensitive" | "live";

export type LabScenario = {
  id: LabScenarioId;
  icon: IconName;
  accent: "brand" | "error" | "warn" | "info" | "neutral";
  /** Cuantos logs manda y, si va en vivo, cuanto tarda. Se muestra antes de ejecutar. */
  estimate: { count: number; seconds?: number };
  /** Enlaces utiles antes de ejecutar (p. ej. abrir Logs en vivo antes de enviar). */
  links?: LabLink[];
  build: (context: { environment: LabEnvironment; now: number }) => LabPlan;
};

const MINUTE = 60_000;

// --- Aleatoriedad ------------------------------------------------------------

const random = () => {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] / 2 ** 32;
};

const between = (min: number, max: number) => Math.floor(min + random() * (max - min + 1));
const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
const hex = (length: number) => Array.from({ length }, () => Math.floor(random() * 16).toString(16)).join("");

/**
 * Palabra de letras g-z. La huella del backend normaliza numeros y tiras hex,
 * asi que un identificador hecho solo de estas letras sobrevive a la
 * normalizacion y cambia la huella de verdad.
 */
const word = (length: number) =>
  Array.from({ length }, () => String.fromCharCode(103 + Math.floor(random() * 20))).join("");

const order = () => `ORD-${between(10000, 99999)}`;
const at = (now: number, msAgo: number) => new Date(now - msAgo).toISOString();

// --- Escenarios --------------------------------------------------------------

const traffic: LabScenario = {
  id: "traffic",
  icon: "chart",
  accent: "brand",
  estimate: { count: 120 },
  build: ({ environment, now }) => {
    const services = [
      { application: "lab-gateway", service: "edge", hosts: ["gw-1", "gw-2"] },
      { application: "lab-billing", service: "api", hosts: ["billing-1", "billing-2"] },
      { application: "lab-inventory", service: "sync", hosts: ["inv-1"] },
    ] as const;
    const info = [
      () => `GET /api/orders/${order()} 200 in ${between(12, 380)} ms`,
      () => `Invoice INV-${between(1000, 9999)} issued for customer C-${between(10, 99)}`,
      () => `Stock synced for SKU-${between(1000, 9999)} (qty ${between(1, 250)})`,
      () => `Webhook delivered to partner P-${between(1, 40)}`,
    ];
    const debug = [
      () => `Cache hit ratio ${between(80, 99)}% over the last minute`,
      () => `Query plan cached (${between(2, 40)} ms)`,
      () => `Cursor advanced to ${between(10000, 99999)}`,
    ];
    const warn = [
      () => `Upstream latency ${between(1200, 2800)} ms exceeds the 1000 ms budget`,
      () => `Retrying request to payments (attempt ${between(2, 4)})`,
    ];

    const logs = Array.from({ length: 120 }, (): LabLog => {
      const source = pick(services);
      const roll = random();
      const base = {
        application: source.application,
        service: source.service,
        host: pick(source.hosts),
        environment,
        timestamp: at(now, random() * 60 * MINUTE),
      };
      if (roll < 0.02) {
        const sku = `SKU_${word(3)}`;
        return {
          ...base,
          level: "error",
          errorName: "ValidationError",
          message: `Invalid SKU format "${sku}" in order ${order()}`,
          errorStack: [
            `ValidationError: Invalid SKU format "${sku}"`,
            "    at parseSku (/app/src/inventory/sku.ts:31:11)",
            "    at SyncJob.run (/app/src/inventory/sync.ts:74:20)",
          ].join("\n"),
        };
      }
      if (roll < 0.1) return { ...base, level: "warn", message: pick(warn)() };
      if (roll < 0.3) return { ...base, level: "debug", message: pick(debug)() };
      return { ...base, level: "info", message: pick(info)(), metadata: { durationMs: between(4, 900) } };
    });

    return {
      logs,
      mode: "batch",
      links: [
        { kind: "logs", href: `/logs?range=1h&application=${LAB_PREFIX}` },
        { kind: "errors", href: `/errors?range=1h&application=${LAB_PREFIX}` },
      ],
    };
  },
};

const grouping: LabScenario = {
  id: "grouping",
  icon: "layers",
  accent: "error",
  estimate: { count: 25 },
  build: ({ environment, now }) => {
    // Mismo servicio, clase, codigo y marco de stack: solo cambia lo que el
    // backend normaliza (numeros en el mensaje), asi que caen en un grupo.
    const stack = [
      "TimeoutError: Payment provider did not answer within 5000 ms",
      "    at PaymentClient.charge (/app/src/checkout/payments.ts:58:15)",
      "    at async CheckoutService.pay (/app/src/checkout/service.ts:122:7)",
    ].join("\n");
    const logs = Array.from({ length: 25 }, (): LabLog => {
      const orderId = order();
      const attempt = between(1, 3);
      return {
        application: "lab-checkout",
        service: "api",
        host: pick(["checkout-1", "checkout-2"]),
        environment,
        level: "error",
        timestamp: at(now, random() * 30 * MINUTE),
        errorName: "TimeoutError",
        errorCode: "ETIMEDOUT",
        message: `Payment provider did not answer within 5000 ms (order ${orderId}, attempt ${attempt})`,
        errorStack: stack,
        traceId: hex(32),
        metadata: { orderId, attempt, provider: "payments-sandbox" },
      };
    });
    return {
      logs,
      mode: "batch",
      links: [
        { kind: "errors", href: `/errors?range=1h&application=lab-checkout` },
        { kind: "logs", href: `/logs?range=1h&application=lab-checkout&level=error` },
      ],
    };
  },
};

const trace: LabScenario = {
  id: "trace",
  icon: "route",
  accent: "info",
  estimate: { count: 7 },
  build: ({ environment, now }) => {
    const traceId = `lab-${hex(24)}`;
    const orderId = order();
    const start = now - 2 * MINUTE;
    const steps: Array<Omit<LabLog, "environment" | "traceId" | "timestamp"> & { offset: number }> = [
      { application: "lab-gateway", service: "edge", level: "info", message: "POST /api/checkout received", offset: 0 },
      { application: "lab-auth", service: "auth", level: "debug", message: "Token verified for user U-4821", offset: 42 },
      { application: "lab-inventory", service: "api", level: "info", message: `Reserved 3 items for ${orderId}`, offset: 180 },
      { application: "lab-billing", service: "api", level: "info", message: `Computing totals for ${orderId}`, offset: 260 },
      {
        application: "lab-billing",
        service: "api",
        level: "error",
        message: "Cannot read properties of undefined (reading 'taxRate')",
        errorName: "TypeError",
        errorStack: [
          "TypeError: Cannot read properties of undefined (reading 'taxRate')",
          "    at computeTotals (/app/src/billing/totals.ts:42:31)",
          "    at InvoiceService.issue (/app/src/billing/invoiceService.ts:118:22)",
          "    at async /app/src/routes/invoices.ts:57:5",
          "    at async Layer.handle (/app/node_modules/express/lib/router/layer.js:95:5)",
        ].join("\n"),
        metadata: { orderId, region: "DO" },
        offset: 2270,
      },
      { application: "lab-inventory", service: "api", level: "warn", message: `Reservation for ${orderId} released after failure`, offset: 2320 },
      { application: "lab-gateway", service: "edge", level: "warn", message: "Responded 500 to client after 2.4 s", offset: 2410 },
    ];
    return {
      logs: steps.map(({ offset, ...step }) => ({
        ...step,
        environment,
        traceId,
        spanId: hex(8),
        host: `${step.application.replace(LAB_PREFIX, "")}-1`,
        timestamp: new Date(start + offset).toISOString(),
      })),
      mode: "batch",
      links: [{ kind: "trace", href: `/trace/${encodeURIComponent(traceId)}` }],
    };
  },
};

const incident: LabScenario = {
  id: "incident",
  icon: "errors",
  accent: "error",
  estimate: { count: 80 },
  build: ({ environment, now }) => {
    const logs = Array.from({ length: 80 }, (_, index): LabLog => {
      const base = {
        application: "lab-billing",
        service: "api",
        host: pick(["billing-1", "billing-2"]),
        environment,
        timestamp: at(now, random() * 5 * MINUTE),
      };
      if (index % 4 === 0) {
        return { ...base, level: "warn", message: `Query took ${between(3000, 6000)} ms (threshold 1000 ms)` };
      }
      return {
        ...base,
        level: "error",
        errorName: "PoolExhaustedError",
        errorCode: "EPOOL",
        message: `Connection pool exhausted: 20/20 connections in use, waited ${between(2000, 5000)} ms`,
        errorStack: [
          "PoolExhaustedError: Connection pool exhausted",
          "    at Pool.acquire (/app/src/db/pool.ts:91:13)",
          "    at async InvoiceRepository.save (/app/src/billing/repository.ts:40:18)",
        ].join("\n"),
      };
    });
    return {
      logs,
      mode: "batch",
      links: [
        { kind: "logs", href: `/logs?range=15m&application=lab-billing&level=error` },
        { kind: "alerts", href: "/settings/alerts" },
      ],
    };
  },
};

const newError: LabScenario = {
  id: "newError",
  icon: "zap",
  accent: "warn",
  estimate: { count: 3 },
  build: ({ environment, now }) => {
    // La palabra aleatoria en el marco del stack cambia la huella en cada
    // ejecucion: para MCLog es siempre un error que no habia visto nunca.
    const rule = word(6);
    const logs = Array.from({ length: 3 }, (): LabLog => ({
      application: "lab-checkout",
      service: "api",
      host: "checkout-1",
      environment,
      level: "error",
      timestamp: at(now, random() * 2 * MINUTE),
      errorName: "RangeError",
      message: `Discount exceeds order total after applying promotion rule "${rule}"`,
      errorStack: [
        "RangeError: Discount exceeds order total",
        `    at Promotions.${rule}Rule (/app/src/checkout/promotions.ts:88:13)`,
        "    at CheckoutService.applyPromotions (/app/src/checkout/service.ts:64:21)",
      ].join("\n"),
      metadata: { release: `2026.9.${between(1, 30)}`, rule },
    }));
    return {
      logs,
      mode: "batch",
      links: [
        { kind: "errors", href: `/errors?range=1h&application=lab-checkout` },
        { kind: "alerts", href: "/settings/alerts" },
      ],
    };
  },
};

const sensitive: LabScenario = {
  id: "sensitive",
  icon: "shield",
  accent: "neutral",
  estimate: { count: 6 },
  build: ({ environment, now }) => {
    const base = { application: "lab-auth", service: "auth", host: "auth-1", environment };
    const logs: LabLog[] = [
      {
        ...base,
        level: "info",
        timestamp: at(now, 50_000),
        message: "Password reset requested for ana.garcia@example.com from 203.0.113.42",
      },
      {
        ...base,
        level: "warn",
        timestamp: at(now, 40_000),
        message: "Login failed for carlos.ruiz@example.org: password=Hunter2024! (attempt 3)",
      },
      {
        ...base,
        level: "error",
        timestamp: at(now, 30_000),
        errorName: "AuthError",
        // Sin prefijos de proveedores reales (sk_live_, ghp_...): los escaneres
        // de secretos los marcarian aunque el valor sea inventado.
        message: "Upstream rejected Authorization: Bearer lab_FAKE_access_token_NOT_REAL_0000",
        errorStack: "AuthError: Upstream rejected the credentials\n    at IdentityClient.exchange (/app/src/auth/identity.ts:77:11)",
      },
      {
        ...base,
        level: "info",
        timestamp: at(now, 20_000),
        message:
          "Session issued token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJsYWItdXNlciJ9.bGFiLXNpZ25hdHVyZS1mYWtl",
      },
      {
        ...base,
        level: "debug",
        timestamp: at(now, 10_000),
        message: "Outgoing request to the CRM with client credentials",
        metadata: { email: "soporte@example.net", apiKey: "lab_FAKE_9f8e7d6c5b4a", ip: "198.51.100.23" },
      },
      {
        ...base,
        level: "warn",
        timestamp: at(now, 5_000),
        message: "Webhook secret=whsec_labFAKE12345678 rejected by partner 198.51.100.7",
      },
    ];
    return {
      logs,
      mode: "batch",
      links: [
        { kind: "reports", href: `/reports?kind=agent-md&range=1h&application=lab-auth&generate=1` },
        { kind: "logs", href: `/logs?range=1h&application=lab-auth` },
      ],
    };
  },
};

const live: LabScenario = {
  id: "live",
  icon: "radio",
  accent: "info",
  estimate: { count: 20, seconds: 15 },
  // Hay que abrir Logs antes de enviar para verlos llegar, asi que el enlace
  // esta disponible desde el principio.
  links: [{ kind: "liveTab", href: `/logs?range=15m&application=lab-worker`, newTab: true }],
  build: ({ environment }) => {
    // Sin timestamp: que lo ponga el servidor al recibirlo, como un log real.
    const logs = Array.from({ length: 20 }, (_, index): LabLog => {
      const job = `JOB-${between(1000, 9999)}`;
      const base = { application: "lab-worker", service: "queue", host: pick(["worker-1", "worker-2"]), environment };
      if (index === 13) {
        return {
          ...base,
          level: "error",
          errorName: "JobFailedError",
          message: `Job ${job} failed: remote file not found`,
          errorStack: "JobFailedError: remote file not found\n    at Worker.process (/app/src/worker/process.ts:52:9)",
        };
      }
      if (index % 6 === 5) return { ...base, level: "warn", message: `Job ${job} retried (queue depth ${between(40, 90)})` };
      return { ...base, level: "info", message: `Processed ${job} in ${between(40, 900)} ms` };
    });
    return {
      logs,
      mode: "stream",
      intervalMs: 750,
      links: [],
    };
  },
};

export const LAB_SCENARIOS: LabScenario[] = [traffic, grouping, trace, incident, newError, sensitive, live];
