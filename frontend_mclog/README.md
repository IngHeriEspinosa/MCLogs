# MCLog — Frontend (frontend_mclog)

Dashboard web para consultar y gestionar los logs centralizados de MCLog.

- Next.js 14 (App Router) + React Query v5 + Tailwind.
- Login con sesión en cookies httpOnly y renovación automática.
- Estadísticas en vivo, filtros combinables (nivel, entorno, aplicación, búsqueda, fechas), orden, paginación, detalle expandible con metadata y export CSV/NDJSON con filtros aplicados.
- Filtros sincronizados con la URL (enlaces compartibles).

## Arranque

```bash
npm install
npm run dev     # http://localhost:3001 (el backend debe estar en http://localhost:3000)
```

Configuración en `.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## Documentación

- [docs/TECHNICAL.md](docs/TECHNICAL.md) — arquitectura del front y decisiones de diseño.
- [docs/USER_GUIDE.md](docs/USER_GUIDE.md) — manual de usuario final.
- [../docs/README.md](../docs/README.md) — índice de la documentación del proyecto.
