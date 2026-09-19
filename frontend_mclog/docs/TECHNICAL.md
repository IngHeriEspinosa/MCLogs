# frontend_mclog · Documento Técnico

## Stack

Next.js 14 (App Router) · React 18 · TypeScript · TanStack React Query v5 · axios · Tailwind CSS.

## Estructura

```
src/
  app/
    layout.tsx            Server component: metadata + <Providers>
    providers.tsx         Client component: QueryClientProvider (staleTime 15s, retry 1)
    page.tsx              Dashboard de logs (client, envuelto en <Suspense> por useSearchParams)
    (auth)/login/page.tsx Login
  common/api/
    client.ts             axios con withCredentials; interceptor 401 → /auth/refresh → retry;
                          si falla, redirige a /login
    download.ts           Export CSV/NDJSON aplicando los filtros activos
    logout.ts             POST /auth/logout
  hooks/
    useAuth.ts            useLogin, useLogout, useLogs, useLogStats + tipos LogEntry/LogsResponse/LogStats
    useDebounce.ts        Debounce genérico (350 ms) para búsqueda y filtro de aplicación
  components/
    atoms/                PrimaryButton, Skeleton, LevelBadge (color por severidad)
    molecules/            Card, DownloadActions, StatsCards (total, 24h, errores, app top)
    templates/            DashboardLayout, AuthLayout
  config/api.ts           API_BASE desde NEXT_PUBLIC_API_URL
```

## Decisiones de diseño

- **Sesión**: los tokens viven en cookies httpOnly gestionadas por el backend; el front nunca toca tokens. El interceptor de axios reintenta una vez con `/auth/refresh` ante un 401 y redirige a `/login` si el refresh falla — ese es el guard de autenticación (no hay middleware de rutas: la fuente de verdad es el backend).
- **Estado de servidor con React Query v5**: `placeholderData: keepPreviousData` mantiene la tabla visible al paginar/filtrar (solo baja la opacidad con `isFetching`); las stats se refrescan cada 60 s.
- **Filtros en la URL** (`?level=error&application=x&from=...`): compartir el enlace reproduce la vista. Los valores por defecto se omiten de la URL.
- **Debounce** de 350 ms en búsqueda y aplicación para no lanzar una petición por tecla.
- **Detalle expandible**: clic en una fila muestra host, traceId, mensaje completo y `metadata` formateada.
- **Puerto 3001** (`next dev -p 3001`): el backend ocupa el 3000. `CORS_ORIGINS` del backend debe incluir `http://localhost:3001`.

## Configuración

`.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:3000
```

En producción apunta a la URL pública de la API (HTTPS). Recuerda configurar en el backend `CORS_ORIGINS` con el dominio del dashboard y `COOKIE_SECURE=1`.

## Scripts

```bash
npm run dev     # http://localhost:3001
npm run build   # build de producción
npm start       # sirve el build en 3001
npm run lint
```
