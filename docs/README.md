# MCLog — Documentación

Índice completo de la documentación del proyecto.

## Empieza por aquí

| Si eres… | Lee |
|---|---|
| **Nuevo en el proyecto** | [FEATURES.md](FEATURES.md) — qué hace el sistema, funcionalidad por funcionalidad |
| **Usuario del dashboard** | [USER_GUIDE.md § Parte A](USER_GUIDE.md#parte-a--consultar-logs-dashboard) — cómo buscar e investigar |
| **Integrando una app** | [INTEGRATION.md](INTEGRATION.md) — contrato REST y ejemplos por lenguaje |
| **Desarrollando el sistema** | [TECHNICAL.md](TECHNICAL.md) y [ARCHITECTURE.md](ARCHITECTURE.md) |
| **Operando el servicio** | [USER_GUIDE.md § Parte C](USER_GUIDE.md#parte-c--administrar-el-servicio) — despliegue, retención, backups |
| **Buscando una respuesta rápida** | [FAQ.md](FAQ.md) · [GLOSSARY.md](GLOSSARY.md) |

## Documentación general

| Documento | Contenido |
|---|---|
| [FEATURES.md](FEATURES.md) | **Desglose funcional completo**: cada funcionalidad, quién la usa, dónde vive en el código |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Arquitectura, flujo de datos, decisiones de diseño y ruta de escalabilidad |
| [TECHNICAL.md](TECHNICAL.md) | **Documentación técnica** del sistema: modelo de datos, referencia de API, seguridad, configuración, despliegue |
| [USER_GUIDE.md](USER_GUIDE.md) | **Manual de usuario**: consultar (A), enviar logs (B), administrar (C) |
| [INTEGRATION.md](INTEGRATION.md) | Guía de integración REST con ejemplos en curl, Node, Python y NetSuite |
| [GLOSSARY.md](GLOSSARY.md) | **Glosario** de todos los términos del proyecto |
| [FAQ.md](FAQ.md) | **Preguntas frecuentes** y errores concretos con su solución |

## Documentación por componente

| Componente | Documentos |
|---|---|
| **Backend** [`Back_MCLog/`](../Back_MCLog/) | [README](../Back_MCLog/docs/README.md) · [Técnico](../Back_MCLog/docs/TECHNICAL.md) · [Operación](../Back_MCLog/docs/USER_GUIDE.md) |
| **Dashboard** [`frontend_mclog/`](../frontend_mclog/) | [README](../frontend_mclog/README.md) · [Técnico](../frontend_mclog/docs/TECHNICAL.md) · [Manual](../frontend_mclog/docs/USER_GUIDE.md) |
| **Librería npm** [`log-service-lib/`](../Back_MCLog/log-service-lib/) | [README](../Back_MCLog/log-service-lib/README.md) |
| **NetSuite** [`integrations/netsuite/`](../integrations/netsuite/) | [README](../integrations/netsuite/README.md) |

> Los documentos centrales (`docs/`) describen el **sistema completo** y son la referencia autoritativa. Los documentos por componente entran en el detalle interno de cada uno.

## Referencia viva

`http://localhost:3000/docs` — Swagger UI con los endpoints ejecutables desde el navegador.
