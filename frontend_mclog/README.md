# MCLog — Frontend (frontend_mclog)

Dashboard web para consultar y gestionar los logs centralizados de MCLog.

- Next.js 14 (App Router) + React Query v5 + Tailwind, sin librerías de componentes ni de gráficos.
- Español e inglés; tema claro, oscuro o del sistema, sin destello al cargar.
- Diseñado de móvil a 4K (3840 px): la interfaz escala y aprovecha el ancho.
- Portada pública en `/` y login con sesión en cookies httpOnly y renovación automática, con verificación en dos pasos (TOTP o código de recuperación) si la cuenta la tiene activa.
- **Logs**: resumen con métricas y gráfico de actividad interactivo, filtros combinables sincronizados con la URL, tabla con detalle lateral (stack, metadata, contexto) y modo en vivo.
- **Registros**: la tabla completa con búsqueda avanzada por campo (mensaje, servicio, host, traceId, nombre y código de error) y detalle a pantalla completa con navegación por teclado.
- Errores agrupados por huella y trazas distribuidas con línea temporal.
- Reportes en Markdown para personas, briefs para agentes de IA (Markdown o JSON) con enmascarado de datos sensibles, y export CSV/NDJSON con los filtros aplicados.
- **Administración**: API keys con permisos, usuarios (con la cuenta root protegida), alertas y el **Lab**, que envía escenarios de prueba reales para ver cada pantalla en acción.
- **Mi cuenta**: preferencias, cambio de contraseña, activar o desactivar el 2FA y eliminar la propia cuenta.

## Arranque

```bash
npm install
npm run dev     # http://localhost:3001 (el backend debe estar en http://localhost:3000)
npm test        # tests de los reportes con el runner nativo (Node 24+)
```

Configuración en `.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:3000
```

El build descarga las tipografías de Google Fonts una vez y las sirve después desde el propio dashboard. Detrás de un proxy corporativo con certificado propio, usa `NODE_OPTIONS=--use-system-ca` (Node 22.15+).

## Documentación

- [docs/TECHNICAL.md](docs/TECHNICAL.md) — arquitectura del front y decisiones de diseño.
- [docs/USER_GUIDE.md](docs/USER_GUIDE.md) — manual de usuario final.
- [../docs/README.md](../docs/README.md) — índice de la documentación del proyecto.
