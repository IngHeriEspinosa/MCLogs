# MCLog — Documentación

Índice completo de la documentación del proyecto.

> Estos mismos documentos se publican en web en **<https://ingheriespinosa.github.io/MCLogs/docs>**. Se generan desde los `.md` de esta carpeta, así que para corregir un texto se edita el `.md` y el sitio se actualiza solo.

## Empieza por aquí

| Si eres… | Lee |
|---|---|
| **Nuevo en el proyecto** | [Primeros pasos](guias/primeros-pasos.md) — instálalo y envía tu primer log en 15 minutos |
| **Usuario del dashboard** | [USER_GUIDE.md § Parte A](USER_GUIDE.md#parte-a--consultar-logs-dashboard) — cómo buscar e investigar |
| **Integrando una app** | [INTEGRATION.md](INTEGRATION.md) — contrato REST y ejemplos por lenguaje |
| **Conectando una IA** | [AI_INTEGRATION.md](AI_INTEGRATION.md) — servidor MCP para Claude Code, Cursor y Claude Desktop |
| **Desarrollando el sistema** | [TECHNICAL.md](TECHNICAL.md) y [ARCHITECTURE.md](ARCHITECTURE.md) |
| **Desplegando en producción** | [DEPLOYMENT.md](DEPLOYMENT.md) — VPS con Docker Compose, o CapRover + Railway |
| **Operando el servicio** | [USER_GUIDE.md § Parte C](USER_GUIDE.md#parte-c--administrar-el-servicio) — retención, usuarios, mantenimiento |
| **Buscando una respuesta rápida** | [FAQ.md](FAQ.md) · [GLOSSARY.md](GLOSSARY.md) |

## Guías paso a paso

Cada guía recorre un proceso de principio a fin: qué vas a conseguir, qué necesitas antes, los pasos numerados con los nombres exactos de los botones, cómo comprobar que funcionó y qué hacer si algo falla.

| Guía | Para |
|---|---|
| [Primeros pasos](guias/primeros-pasos.md) | Instalar MCLog en tu equipo, entrar, crear una API key y enviar tu primer log |
| [Integrar una aplicación Node.js](guias/integrar-node.md) | Enviar logs y excepciones desde Node con `@multicomputos-srl/mclog` |
| [Integrar NetSuite](guias/integrar-netsuite.md) | Subir el cliente SuiteScript y registrar logs desde User Events y Map/Reduce |
| [Investigar un incidente](guias/investigar-incidente.md) | Ir del aviso a la causa: Errores, ocurrencias, traza, contexto y brief para IA |
| [Buscar registros](guias/buscar-registros.md) | Filtros, búsqueda avanzada por campo, compartir y exportar |
| [Compartir un snapshot](guias/compartir-snapshots.md) | Enlace a una copia congelada de Logs, Errores o una Traza, para tu equipo o público con los datos enmascarados |
| [Proteger tu cuenta](guias/seguridad-cuenta.md) | Contraseña, verificación en dos pasos, códigos de recuperación y eliminar la cuenta |
| [Administrar espacios, usuarios y claves](guias/administrar-usuarios-y-claves.md) | Espacios de trabajo, invitaciones, roles, cuenta root, API keys con permisos y rotación |
| [Configurar alertas](guias/configurar-alertas.md) | Canales (webhook, correo, Telegram), reglas y cómo probarlas |
| [Probar con el Lab](guias/probar-con-el-lab.md) | Cada escenario de prueba, el compositor de logs y la limpieza |
| [Presentar MCLog: guion de una demo](guias/presentar-una-demo.md) | 25 minutos para enseñarlo a tu equipo: preparación, guion paso a paso, preguntas previsibles y plan B |
| [Conectar una IA](guias/conectar-ia.md) | Clave de lectura, configuración del cliente MCP y primeras preguntas |
| [Desplegar en un VPS](guias/desplegar-vps.md) | Producción con Docker Compose y Caddy, de cero a HTTPS |
| [Desplegar en CapRover y Railway](guias/desplegar-caprover-railway.md) | API y base de datos en CapRover, dashboard en Railway |
| [Copias y mantenimiento](guias/copias-y-mantenimiento.md) | Retención, copias de seguridad, restauración y actualizaciones |

## Documentación general

| Documento | Contenido |
|---|---|
| [FEATURES.md](FEATURES.md) | **Desglose funcional completo**: cada funcionalidad, quién la usa, dónde vive en el código |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Arquitectura, topologías de despliegue, flujo de datos, decisiones de diseño y escalabilidad |
| [TECHNICAL.md](TECHNICAL.md) | **Documentación técnica** del sistema: modelo de datos, referencia de API, seguridad, configuración |
| [DEPLOYMENT.md](DEPLOYMENT.md) | **Despliegue en producción**: VPS con Docker Compose y Caddy, o CapRover + Railway; copias de seguridad, escalado |
| [USER_GUIDE.md](USER_GUIDE.md) | **Manual de usuario**: consultar (A), enviar logs (B), administrar (C) |
| [INTEGRATION.md](INTEGRATION.md) | Guía de integración REST con ejemplos en curl, Node, Python y NetSuite |
| [AI_INTEGRATION.md](AI_INTEGRATION.md) | **Conectar un asistente de IA** por MCP: claves, clientes, herramientas y buenas prácticas |
| [GLOSSARY.md](GLOSSARY.md) | **Glosario** de todos los términos del proyecto |
| [FAQ.md](FAQ.md) | **Preguntas frecuentes** y errores concretos con su solución |
| [CHANGELOG.md](../CHANGELOG.md) | **Historial de cambios** por fecha, con lo que requiere acción al actualizar |

## Documentación por componente

| Componente | Documentos |
|---|---|
| **Backend** [`Back_MCLog/`](../Back_MCLog/) | [README](../Back_MCLog/docs/README.md) · [Técnico](../Back_MCLog/docs/TECHNICAL.md) · [Operación](../Back_MCLog/docs/USER_GUIDE.md) |
| **Dashboard** [`frontend_mclog/`](../frontend_mclog/) | [README](../frontend_mclog/README.md) · [Técnico](../frontend_mclog/docs/TECHNICAL.md) · [Manual](../frontend_mclog/docs/USER_GUIDE.md) |
| **Librería npm** [`packages/mclog/`](../packages/mclog/) | [README](../packages/mclog/README.md) |
| **NetSuite** [`integrations/netsuite/`](../integrations/netsuite/) | [README](../integrations/netsuite/README.md) |
| **Sitio público** [`site/`](../site/) | [README](../site/README.md) |
| **Seguridad** | [SECURITY.md](../SECURITY.md) — cómo reportar vulnerabilidades y recomendaciones de despliegue |

> Los documentos centrales (`docs/`) describen el **sistema completo** y son la referencia autoritativa. Los documentos por componente entran en el detalle interno de cada uno.

## Referencia viva

`http://localhost:3000/docs` — Swagger UI con los endpoints ejecutables desde el navegador. La especificación en crudo está en `/openapi.json`.
