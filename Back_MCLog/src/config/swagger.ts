import swaggerJSDoc from "swagger-jsdoc";

const logQueryParams = [
  { in: "query", name: "page", schema: { type: "integer", minimum: 1 } },
  { in: "query", name: "pageSize", schema: { type: "integer", minimum: 1, maximum: 200 } },
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
      "/api/logs/errors/groups": {
        get: {
          tags: ["análisis"],
          summary: "Errores agrupados por causa, del más frecuente al menos",
          description:
            "Las repeticiones del mismo fallo caen en un grupo aunque sus mensajes lleven ids o fechas distintos. El fingerprint devuelto sirve para ver las ocurrencias con GET /api/logs?fingerprint=…",
          security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
          parameters: [
            { in: "query", name: "hours", schema: { type: "integer", minimum: 1, maximum: 744, default: 24 } },
            { in: "query", name: "from", schema: { type: "string", format: "date-time" } },
            { in: "query", name: "to", schema: { type: "string", format: "date-time" } },
            { in: "query", name: "application", schema: { type: "string" } },
            { in: "query", name: "service", schema: { type: "string" } },
            { in: "query", name: "environment", schema: { type: "string", enum: ["development", "staging", "production"] } },
            { in: "query", name: "level", schema: { type: "string", enum: ["error", "warn"], default: "error" } },
            { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { type: "array", items: { $ref: "#/components/schemas/ErrorGroup" } },
                      from: { type: "string", format: "date-time" },
                      to: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/logs/trace/{traceId}": {
        get: {
          tags: ["análisis"],
          summary: "Todos los logs de una traza, en orden cronológico",
          security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
          parameters: [{ in: "path", name: "traceId", required: true, schema: { type: "string", maxLength: 128 } }],
          responses: {
            200: { description: "OK (máximo 1000 registros)" },
            404: { description: "No hay logs con esa traza" },
          },
        },
      },
      "/api/logs/{id}/context": {
        get: {
          tags: ["análisis"],
          summary: "Lo ocurrido alrededor de un log, en su misma aplicación y servicio",
          security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
          parameters: [
            { in: "path", name: "id", required: true, schema: { type: "integer" } },
            {
              in: "query",
              name: "before",
              schema: { type: "integer", minimum: 1, maximum: 3600, default: 60 },
              description: "Segundos hacia atrás",
            },
            {
              in: "query",
              name: "after",
              schema: { type: "integer", minimum: 1, maximum: 3600, default: 60 },
              description: "Segundos hacia delante",
            },
            { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
          ],
          responses: {
            200: { description: "OK" },
            404: { description: "No existe, o queda fuera del alcance de la clave" },
          },
        },
      },
      "/api/logs/applications": {
        get: {
          tags: ["análisis"],
          summary: "Inventario de aplicaciones con sus servicios, entornos y errores recientes",
          security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
          responses: { 200: { description: "OK" } },
        },
      },
      "/api/keys": {
        get: {
          tags: ["administración"],
          summary: "Listar API keys (nunca devuelve el secreto)",
          security: [{ BearerAuth: [] }],
          responses: { 200: { description: "OK" }, 403: { description: "Requiere rol admin" } },
        },
        post: {
          tags: ["administración"],
          summary: "Crear una API key",
          description:
            "El secreto en claro se devuelve en el campo `key` y no vuelve a mostrarse: en base de datos solo queda su hash.",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "scopes"],
                  properties: {
                    name: { type: "string", maxLength: 120 },
                    scopes: { type: "array", items: { type: "string", enum: ["ingest", "read", "metrics"] } },
                    applications: { type: "array", items: { type: "string" }, description: "Vacío = todas" },
                    expiresAt: { type: "string", format: "date-time", nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Creada; `key` contiene el secreto" },
            403: { description: "Requiere rol admin" },
          },
        },
      },
      "/api/keys/{id}": {
        delete: {
          tags: ["administración"],
          summary: "Revocar una API key (inmediato e irreversible)",
          security: [{ BearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Revocada" }, 404: { description: "No existe" } },
        },
      },
      "/auth/me": {
        get: {
          tags: ["auth"],
          summary: "Usuario de la sesión actual",
          security: [{ BearerAuth: [] }],
          responses: { 200: { description: "OK" }, 401: { description: "Sin sesión" } },
        },
      },
      "/auth/me/password": {
        patch: {
          tags: ["auth"],
          summary: "Cambiar la propia contraseña (revoca todas las sesiones)",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["currentPassword", "newPassword"],
                  properties: { currentPassword: { type: "string" }, newPassword: { type: "string", minLength: 10 } },
                },
              },
            },
          },
          responses: {
            200: { description: "Cambiada" },
            400: { description: "Contraseña actual incorrecta o nueva inválida" },
          },
        },
      },
      "/auth/users": {
        get: {
          tags: ["administración"],
          summary: "Listar usuarios",
          security: [{ BearerAuth: [] }],
          responses: { 200: { description: "OK" }, 403: { description: "Requiere rol admin" } },
        },
        post: {
          tags: ["administración"],
          summary: "Crear un usuario",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: {
                    email: { type: "string", format: "email" },
                    password: { type: "string", minLength: 10 },
                    role: { type: "string", enum: ["user", "admin"], default: "user" },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Creado" }, 409: { description: "Email ya registrado" } },
        },
      },
      "/auth/users/{id}": {
        patch: {
          tags: ["administración"],
          summary: "Cambiar rol o contraseña de un usuario (revoca sus sesiones)",
          security: [{ BearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: {
            200: { description: "Actualizado" },
            409: { description: "No se puede degradar al último admin" },
          },
        },
        delete: {
          tags: ["administración"],
          summary: "Eliminar un usuario",
          security: [{ BearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: {
            200: { description: "Eliminado" },
            409: { description: "No puedes borrarte a ti mismo ni eliminar al último admin" },
          },
        },
      },
      "/api/logs/stream": {
        get: {
          tags: ["análisis"],
          summary: "Stream de logs en vivo (Server-Sent Events)",
          description:
            "Emite los logs según se ingieren. La conexión queda abierta; el navegador la reconecta solo. El bus es por instancia: con varias réplicas, cada cliente ve los logs que entraron por la suya.",
          security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
          parameters: [
            { in: "query", name: "level", schema: { type: "string", enum: ["debug", "info", "warn", "error"] } },
            { in: "query", name: "application", schema: { type: "string" } },
            { in: "query", name: "environment", schema: { type: "string", enum: ["development", "staging", "production"] } },
          ],
          responses: {
            200: { description: "Flujo text/event-stream con eventos `ready` y `log`" },
            503: { description: "Se alcanzó SSE_MAX_CONNECTIONS" },
          },
        },
      },
      "/api/alerts/channels": {
        get: {
          tags: ["alertas"],
          summary: "Listar canales (los secretos llegan enmascarados)",
          security: [{ BearerAuth: [] }],
          responses: { 200: { description: "OK" }, 403: { description: "Requiere rol admin" } },
        },
        post: {
          tags: ["alertas"],
          summary: "Crear un canal de aviso",
          description:
            "La forma de `config` depende del tipo: webhook `{ url, secret? }`, email `{ to: [] }`, telegram `{ botToken, chatId }`.",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "type", "config"],
                  properties: {
                    name: { type: "string", maxLength: 120 },
                    type: { type: "string", enum: ["webhook", "email", "telegram"] },
                    config: { type: "object" },
                    enabled: { type: "boolean", default: true },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Creado" }, 400: { description: "Configuración incompleta para ese tipo" } },
        },
      },
      "/api/alerts/channels/{id}/test": {
        post: {
          tags: ["alertas"],
          summary: "Enviar un aviso de prueba",
          description: "Responde 200 también cuando el canal falla: el resultado del envío es el dato que se pide.",
          security: [{ BearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Resultado del envío (`ok` y, si falla, `error`)" } },
        },
      },
      "/api/alerts/rules": {
        get: {
          tags: ["alertas"],
          summary: "Listar reglas con sus canales",
          security: [{ BearerAuth: [] }],
          responses: { 200: { description: "OK" } },
        },
        post: {
          tags: ["alertas"],
          summary: "Crear una regla",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: {
                    name: { type: "string", maxLength: 120 },
                    type: {
                      type: "string",
                      enum: ["threshold", "new_error_group"],
                      default: "threshold",
                      description: "threshold: N coincidencias en la ventana. new_error_group: una huella nunca vista.",
                    },
                    application: { type: "string", nullable: true },
                    service: { type: "string", nullable: true },
                    environment: { type: "string", enum: ["development", "staging", "production"], nullable: true },
                    level: { type: "string", enum: ["debug", "info", "warn", "error"], default: "error" },
                    threshold: { type: "integer", minimum: 1, default: 1 },
                    windowMinutes: { type: "integer", minimum: 1, maximum: 1440, default: 10 },
                    cooldownMinutes: {
                      type: "integer",
                      minimum: 0,
                      maximum: 1440,
                      default: 30,
                      description: "Silencio tras avisar. Arranca aunque el envío falle.",
                    },
                    channelIds: { type: "array", items: { type: "integer" } },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Creada" } },
        },
      },
      "/api/alerts/events": {
        get: {
          tags: ["alertas"],
          summary: "Historial de disparos, con el resultado por canal",
          security: [{ BearerAuth: [] }],
          parameters: [
            { in: "query", name: "ruleId", schema: { type: "integer" } },
            { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
      "/mcp": {
        post: {
          tags: ["status"],
          summary: "Servidor MCP para asistentes de IA (JSON-RPC 2.0)",
          description:
            "Expone ocho herramientas de investigación de errores. Sin estado: cada petición se atiende y se cierra. Requiere API key con scope read o JWT. Guía en docs/AI_INTEGRATION.md.",
          security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
          responses: {
            200: { description: "Respuesta JSON-RPC" },
            401: { description: "Sin credenciales" },
            403: { description: "La clave no tiene scope read" },
            405: { description: "GET y DELETE no se admiten: el endpoint es sin estado" },
          },
        },
      },
      "/openapi.json": {
        get: {
          tags: ["status"],
          summary: "Esta misma especificación, en crudo",
          responses: { 200: { description: "OK" } },
        },
      },
      "/health": {
        get: {
          tags: ["status"],
          summary: "Health check (incluye conexión a DB, versión y uptime)",
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
            error: {
              type: "object",
              description:
                "Excepción capturada. Se reparte en errorName, errorCode y errorStack, y si falta message se usa el suyo. Es lo que permite agrupar las repeticiones del mismo fallo.",
              properties: {
                name: { type: "string", example: "TypeError" },
                message: { type: "string" },
                code: { type: "string", example: "ETIMEDOUT", description: "Se acepta también numérico" },
                stack: { type: "string" },
              },
            },
            errorName: { type: "string", maxLength: 200, description: "Alternativa a error.name" },
            errorCode: { type: "string", maxLength: 100, description: "Alternativa a error.code" },
            errorStack: { type: "string", maxLength: 50000, description: "Alternativa a error.stack" },
            fingerprint: {
              type: "string",
              maxLength: 64,
              description: "Huella de agrupación propia. Si falta, el servidor la calcula para error y warn.",
            },
          },
        },
        ErrorGroup: {
          type: "object",
          description: "Un fallo distinto, con todas sus ocurrencias contadas.",
          properties: {
            fingerprint: { type: "string", example: "c6caa3b09384f1e27a5b0d4e8c1f2a39" },
            application: { type: "string" },
            service: { type: "string", nullable: true },
            level: { type: "string", enum: ["error", "warn"] },
            errorName: { type: "string", nullable: true },
            errorCode: { type: "string", nullable: true },
            sampleMessage: { type: "string", description: "Mensaje de la ocurrencia más reciente" },
            count: { type: "integer", example: 29 },
            firstSeen: { type: "string", format: "date-time" },
            lastSeen: { type: "string", format: "date-time" },
            lastLogId: { type: "integer" },
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
