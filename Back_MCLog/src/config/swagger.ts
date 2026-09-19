import swaggerJSDoc from "swagger-jsdoc";

const logQueryParams = [
  { in: "query", name: "page", schema: { type: "integer", minimum: 1 } },
  { in: "query", name: "pageSize", schema: { type: "integer", minimum: 1, maximum: 500 } },
  { in: "query", name: "application", schema: { type: "string" } },
  { in: "query", name: "service", schema: { type: "string" } },
  { in: "query", name: "host", schema: { type: "string" } },
  { in: "query", name: "traceId", schema: { type: "string" } },
  { in: "query", name: "level", schema: { type: "string", enum: ["debug", "info", "warn", "error"] } },
  { in: "query", name: "environment", schema: { type: "string", enum: ["development", "staging", "production"] } },
  { in: "query", name: "from", schema: { type: "string", format: "date-time" } },
  { in: "query", name: "to", schema: { type: "string", format: "date-time" } },
  { in: "query", name: "search", schema: { type: "string" } },
  {
    in: "query",
    name: "sort",
    schema: { type: "string", example: "timestamp:desc" },
    description: "campo:direccion — campos: timestamp, application, level, host, environment",
  },
  {
    in: "query",
    name: "format",
    schema: { type: "string", enum: ["json", "csv", "ndjson"] },
    description: "csv/ndjson exportan hasta MAX_EXPORT_ROWS registros aplicando los mismos filtros",
  },
];

export const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "MCLog API",
      version: "2.0.0",
      description:
        "Servicio centralizado de captura y consulta de logs. Ingesta vía API key (x-api-key) o JWT; consultas vía JWT.",
    },
    paths: {
      "/api/log": {
        post: {
          tags: ["ingesta"],
          summary: "Crear un log",
          description: "Acepta API key (x-api-key) para integraciones máquina-a-máquina (NetSuite, scripts) o JWT.",
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LogInput" },
              },
            },
          },
          responses: {
            201: { description: "Creado" },
            400: { description: "Validación" },
            401: { description: "Credenciales inválidas" },
            429: { description: "Rate limit excedido" },
          },
        },
      },
      "/api/logs/batch": {
        post: {
          tags: ["ingesta"],
          summary: "Crear logs en lote",
          description: "Hasta MAX_BATCH_SIZE (500 por defecto) logs por petición. Ideal para Map/Reduce o buffers.",
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["logs"],
                  properties: {
                    logs: { type: "array", items: { $ref: "#/components/schemas/LogInput" } },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Creados", content: { "application/json": { schema: { type: "object", properties: { created: { type: "integer" } } } } } },
            400: { description: "Validación o lote demasiado grande" },
            401: { description: "Credenciales inválidas" },
          },
        },
      },
      "/api/logs": {
        get: {
          tags: ["consulta"],
          summary: "Listar / exportar logs",
          security: [{ BearerAuth: [] }],
          parameters: logQueryParams,
          responses: {
            200: { description: "OK (json paginado, csv o ndjson según format)" },
            401: { description: "Token inválido" },
          },
        },
        delete: {
          tags: ["administración"],
          summary: "Purgar logs anteriores a una fecha (solo admin)",
          security: [{ BearerAuth: [] }],
          parameters: [
            { in: "query", name: "before", required: true, schema: { type: "string", format: "date-time" } },
            { in: "query", name: "application", schema: { type: "string" }, description: "Limitar purga a una aplicación" },
          ],
          responses: {
            200: { description: "Cantidad de logs eliminados" },
            403: { description: "Requiere rol admin" },
          },
        },
      },
      "/api/logs/stats": {
        get: {
          tags: ["consulta"],
          summary: "Estadísticas: totales, últimas 24h, por nivel, por aplicación y por entorno",
          security: [{ BearerAuth: [] }],
          responses: { 200: { description: "OK" }, 401: { description: "Token inválido" } },
        },
      },
      "/api/logs/{id}": {
        get: {
          tags: ["consulta"],
          summary: "Obtener log por id",
          security: [{ BearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: {
            200: { description: "OK" },
            404: { description: "No encontrado" },
          },
        },
      },
      "/health": {
        get: {
          tags: ["status"],
          summary: "Health check (incluye conexión a DB)",
          responses: { 200: { description: "OK" }, 503: { description: "Degraded" } },
        },
      },
      "/metrics": {
        get: {
          tags: ["status"],
          summary: "Prometheus metrics (protegido con API key)",
          security: [{ ApiKeyAuth: [] }],
          responses: { 200: { description: "OK" } },
        },
      },
      "/auth/login": {
        post: {
          tags: ["auth"],
          summary: "Login",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["email", "password"], properties: { email: { type: "string" }, password: { type: "string" } } } } },
          },
          responses: { 200: { description: "Tokens emitidos (body + cookies httpOnly)" }, 401: { description: "Credenciales inválidas" } },
        },
      },
      "/auth/refresh": {
        post: {
          tags: ["auth"],
          summary: "Refrescar token (rota el refresh token)",
          description: "refreshToken puede ir en el body o en la cookie httpOnly refresh_token.",
          requestBody: { required: false, content: { "application/json": { schema: { type: "object", properties: { refreshToken: { type: "string" } } } } } },
          responses: { 200: { description: "Tokens nuevos" }, 401: { description: "Refresh inválido" } },
        },
      },
      "/auth/logout": {
        post: {
          tags: ["auth"],
          summary: "Logout (revoca refresh token y limpia cookies)",
          responses: { 200: { description: "OK" } },
        },
      },
    },
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
        },
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        LogInput: {
          type: "object",
          required: ["application", "level", "environment", "message"],
          properties: {
            application: { type: "string", maxLength: 120, example: "SuiteApp-Facturacion" },
            service: { type: "string", maxLength: 120, example: "ue_invoice_afterSubmit" },
            host: { type: "string", maxLength: 255, example: "netsuite-prod" },
            level: { type: "string", enum: ["debug", "info", "warn", "error"] },
            environment: { type: "string", enum: ["development", "staging", "production"] },
            message: { type: "string", example: "Factura 1234 sincronizada" },
            timestamp: { type: "string", format: "date-time", description: "Opcional; por defecto ahora" },
            traceId: { type: "string", maxLength: 128 },
            spanId: { type: "string", maxLength: 128 },
            metadata: { type: "object", description: "Objeto JSON libre con contexto adicional" },
          },
        },
        Log: {
          allOf: [
            { $ref: "#/components/schemas/LogInput" },
            { type: "object", properties: { id: { type: "integer" }, timestamp: { type: "string", format: "date-time" } } },
          ],
        },
      },
    },
  },
  apis: [],
});
