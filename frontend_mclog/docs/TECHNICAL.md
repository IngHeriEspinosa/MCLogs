# frontend_mclog · Documento Técnico

## Stack

Next.js 14 (App Router) · React 18 · TypeScript · TanStack React Query v5 · axios · Tailwind CSS.

## Estructura

```
src/
  app/
    layout.tsx                 Server component: metadata + <Providers>
    providers.tsx              Client: QueryClientProvider (staleTime 15s, retry 1)
    icon.svg                   Favicon
    page.tsx                   Tabla de logs (client, en <Suspense> por useSearchParams)
    errors/page.tsx            Errores agrupados por causa
    trace/[traceId]/page.tsx   Una operación completa, en orden cronológico
    settings/api-keys/page.tsx Claves con permisos (admin)
    settings/users/page.tsx    Usuarios y roles (admin)
    settings/alerts/page.tsx   Canales, reglas e historial de avisos (admin)
    settings/password/page.tsx Cambio de contraseña propia
    (auth)/login/page.tsx      Login
  common/api/
    client.ts                  axios withCredentials; interceptor 401 → /auth/refresh → retry
    download.ts                Export CSV/NDJSON aplicando los filtros activos
    errorMessage.ts            Extrae el mensaje legible de un error de la API
    logout.ts                  POST /auth/logout
  hooks/
    useAuth.ts                 Sesión y logs: useMe, useLogin, useLogout, useChangePassword,
                               useLogs, useLogStats + tipos
    useErrors.ts               useErrorGroups, useTrace, useLogContext, useApplications
    useApiKeys.ts              CRUD de claves
    useUsers.ts                CRUD de usuarios
    useAlerts.ts               Canales, reglas, historial y envío de prueba
    useLogStream.ts            Conexión SSE al stream en vivo
    useDebounce.ts             Debounce genérico (350 ms)
  components/
    atoms/                     PrimaryButton, Skeleton, LevelBadge, Alert
    molecules/                 Card, DownloadActions, StatsCards, LevelTimeline, ConfirmButton
    templates/                 DashboardLayout (navegación + sesión), AuthLayout
  config/api.ts                API_BASE desde NEXT_PUBLIC_API_URL
```

## Decisiones de diseño

- **Sesión**: los tokens viven en cookies httpOnly gestionadas por el backend; el front nunca toca tokens. El interceptor de axios reintenta una vez con `/auth/refresh` ante un 401 y redirige a `/login` si el refresh falla. Ese es el guard de autenticación: no hay middleware de rutas, la fuente de verdad es el backend.
- **Autorización visual, nunca como control**: `useMe()` decide qué enlaces de administración se muestran, pero **cada página comprueba el rol por su cuenta** y el backend lo exige de todos modos. Ocultar un enlace no protege nada.
- **Estado de servidor con React Query v5**: `placeholderData: keepPreviousData` mantiene la tabla visible al paginar o refiltrar (solo baja la opacidad con `isFetching`); las stats se refrescan cada 60 s.
- **Filtros en la URL** (`?level=error&fingerprint=...`): compartir el enlace reproduce la vista. Los valores por defecto se omiten para mantenerla limpia.
- **Debounce** de 350 ms en búsqueda y aplicación, para no lanzar una petición por tecla.
- **Base de la API vacía en producción**: sin `NEXT_PUBLIC_API_URL`, las peticiones salen relativas y llaman al mismo origen, que es lo correcto detrás de Caddy. En desarrollo apunta al 3000 porque son orígenes distintos. El valor se fija **al compilar**, no al arrancar.
- **Puerto 3001** (`next dev -p 3001`): el backend ocupa el 3000.

### Gráfico de actividad

`LevelTimeline` dibuja SVG en línea, sin librería de gráficos.

- Los niveles son una **escala de severidad**, no categorías sueltas, así que el color va de grave a irrelevante en lugar de recorrer una rueda de tonos.
- Los **errores van abajo**, pegados a la línea base: es el único segmento con origen fijo y por tanto el único comparable de un vistazo entre horas, que es justo lo que interesa mirar.
- Paleta validada sobre la superficie blanca de la tarjeta: separación mínima entre adyacentes de 15.9 con deficiencia de color y 17.8 con visión normal, sobre umbrales de 8 y 15. El amarillo queda por debajo de 3:1 de contraste, algo inherente al tono, y por eso **la leyenda lleva siempre nombre y total visibles**: el color nunca es el único portador del dato.
- Las **horas sin registros se rellenan en el cliente**. La API solo devuelve las que tienen filas, y pintarlas seguidas juntaría horas no contiguas: el gráfico mentiría sobre cuándo ocurrió cada cosa.
- El ancho se mide con `ResizeObserver` y se dibuja en píxeles, para que las esquinas redondeadas no se deformen al escalar.

### Stream en vivo

`useLogStream` abre un `EventSource` contra `GET /api/logs/stream`.

- `EventSource` **no admite cabeceras propias**, así que la autenticación viaja en la cookie de sesión, igual que el resto del dashboard.
- El navegador reconecta solo, de modo que no hay lógica de reintento en el hook.
- Los logs de un lote llegan **sin `id`** (`createMany` no devuelve las filas creadas), así que el hook añade una `streamKey` local para usarla como clave de lista en React.
- Solo se activa en la primera página y con orden por fecha descendente. En cualquier otra vista, anteponer filas nuevas mentiría sobre lo que se está mirando.
- Mientras está activo se refresca la tabla cada 15 s y se vacía el buffer, para que las filas del stream se sustituyan por las del servidor, que traen id y metadata completos.

### Acciones destructivas

`ConfirmButton` pide un segundo clic y se desarma solo a los 5 s. Se usa en lugar de `window.confirm`, que bloquea el hilo, no se puede estilar y algunos navegadores suprimen.

## Configuración

`.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:3000
```

En producción detrás de Caddy, **déjala sin definir**: las peticiones salen relativas al mismo dominio y desaparecen tanto el CORS entre orígenes como la necesidad de cookies `SameSite=None`. Para un despliegue con dominios separados, pásala como `--build-arg` al construir la imagen, y configura en el backend `CORS_ORIGINS` con el dominio del dashboard y `COOKIE_SECURE=1`.

## Scripts

```bash
npm run dev     # http://localhost:3001
npm run build   # build de producción (output standalone)
npm start       # sirve el build en 3001
npm run lint
```
