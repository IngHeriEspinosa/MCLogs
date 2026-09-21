# frontend_mclog · Documento Técnico

## Stack

Next.js 14 (App Router) · React 18 · TypeScript · TanStack React Query v5 · axios · Tailwind CSS.

Sin librerías de componentes, iconos ni gráficos: selects, calendario, menús, diálogos, iconos y gráficos son propios. Pesan menos que cualquier paquete equivalente y el proyecto no suma dependencias.

## Estructura

```
src/
  app/
    layout.tsx                 Server component: fuentes, script de tema, idioma desde cookie
    providers.tsx              QueryClient + ThemeProvider + I18nProvider + ToastProvider
    icon.svg                   Favicon (el mismo isotipo que el sitio público)
    page.tsx                   Logs: filtros, resumen, tabla, inspector y modo en vivo
    errors/page.tsx            Errores agrupados por huella
    reports/page.tsx           Generador de reportes (Markdown, brief para IA, JSON)
    trace/[traceId]/page.tsx   Una operación completa, con línea temporal en cascada
    settings/api-keys/page.tsx Claves con permisos (admin)
    settings/users/page.tsx    Usuarios y roles (admin)
    settings/alerts/page.tsx   Canales, reglas e historial de avisos (admin)
    settings/password/page.tsx Mi cuenta: sesión, preferencias y contraseña
    (auth)/login/page.tsx      Login
  common/
    api/                       client (axios + refresh), download, errorMessage, logout
    i18n/                      config, format (Intl), I18nProvider, dictionaries/{es,en}
    theme/                     config (cookie + script anti-destello), ThemeProvider
    time/                      range (rangos relativos/absolutos ↔ URL), timeline (serie horaria)
    reports/                   collect, build, markdown, redact
    clipboard.ts               Copiar con respaldo para contextos sin HTTPS
  hooks/
    useAuth.ts                 Sesión, logs y estadísticas + tipos
    useErrors.ts               Grupos de error, traza, contexto, inventario de aplicaciones
    useLogFilters.ts           Filtros de la vista de logs, con la URL como fuente de verdad
    useOptions.ts              Opciones traducidas de los selects de filtro
    useFloating.ts             Posicionamiento de paneles flotantes y cierre al pulsar fuera
    useElementSize.ts          Tamaño real de un elemento (gráficos)
    usePreference.ts           Preferencias en localStorage y media queries
    useApiKeys / useUsers / useAlerts / useLogStream / useDebounce
  components/
    atoms/                     Button, Input, Field, Checkbox, Switch, Segmented, Icon,
                               LevelBadge, Tag, Alert, Skeleton, Spinner, EmptyState
    molecules/                 Card, Select, Menu, Dialog, Toast, Calendar, DateRangePicker,
                               DatePicker, StatTile, Sparkline, ActivityChart, Distribution,
                               CodeBlock, MarkdownView, CopyButton, ConfirmButton, Portal
    organisms/                 Sidebar, Topbar, LogFilterBar, LogOverview, LogTable, LogInspector
    templates/                 DashboardLayout, AuthLayout
  config/api.ts                API_BASE desde NEXT_PUBLIC_API_URL
```

## Sistema visual

- **Tokens de color como variables CSS** (`src/styles/globals.css`), en tripletes RGB para que Tailwind aplique opacidad (`bg-brand/10`). `tailwind.config.js` los expone con nombres de rol: `canvas`, `surface`, `ink`, `line`, `brand`, `lvl-*`, `rail`… Un mismo `bg-surface` sirve en los dos temas, así que casi ningún componente necesita `dark:`.
- **Contraste comprobado** para todo el texto (≥ 4,5:1 en los dos temas). Los valores están anotados junto a los tokens.
- **Riel de navegación en petróleo oscuro en los dos temas**: es la pieza que da identidad a la consola. El lienzo lleva una trama de puntos que se desvanece; nunca va detrás de un gráfico.
- **Tipografías autoalojadas** con `next/font`: Inter (texto), Plus Jakarta Sans (títulos) y JetBrains Mono (horas, IDs, código). Se descargan **al compilar** y se sirven desde el propio dashboard: ninguna visita llama a Google.

## Pantallas grandes (hasta 4K)

- Breakpoints extra: `3xl` 1920 px, `4xl` 2560 px, `5xl` 3200 px.
- **El tamaño raíz crece** (16 → 17 → 19 px). Como Tailwind trabaja en `rem`, toda la interfaz escala en proporción y un 4K sin escalado del sistema sigue siendo legible. El gráfico de actividad lee el tamaño raíz en un efecto de layout (no al renderizar, para no romper la hidratación) y escala alto, ejes y etiquetas con él.
- Las vistas de datos usan todo el ancho hasta 3840 px: el resumen pasa a una sola fila, la tabla gana columnas (host a partir de `2xl`, traza a partir de `4xl`) y **el detalle del log se abre como columna fija junto a la tabla desde 1920 px**, en lugar de como cajón superpuesto. Los formularios se quedan en una columna legible (`width="narrow"`).

## Idiomas (es / en)

- `dictionaries/es.ts` es la referencia y define el tipo `Dictionary`; `en.ts` está tipado contra él, así que **una traducción que falte es un error de compilación**.
- Los textos con datos son funciones que reciben los números ya formateados: el diccionario decide el orden de las palabras y `format.ts` el formato (`Intl`, creado una vez por idioma).
- El idioma se guarda en la cookie `mclog_locale`. El layout la lee en el servidor (o, si no existe, `Accept-Language`), así que la primera pintura ya sale en el idioma correcto. Cambiarlo es inmediato y no recarga.
- Los reportes tienen su propio selector de idioma, independiente del de la interfaz.

## Tema (claro / oscuro / sistema)

- La preferencia va en la cookie `mclog_theme`. Un script en `<head>` fija `data-theme` en `<html>` **antes de pintar**, así el modo oscuro no destella en blanco al cargar. Con "Sistema" sigue los cambios del sistema operativo en caliente.
- Tailwind usa `darkMode: ["selector", '[data-theme="dark"]']`: el usuario puede elegir oscuro aunque su sistema diga claro.

## Datos y estado

- **Sesión**: tokens en cookies httpOnly del backend; el interceptor de axios reintenta una vez con `/auth/refresh` ante un 401 y redirige a `/login` si falla. Es el único guard: la fuente de verdad es el backend.
- **Autorización visual, nunca como control**: el menú oculta la administración a quien no es admin, pero cada página comprueba el rol y el backend lo exige igualmente.
- **Filtros en la URL** (`useLogFilters`): rango (`range=24h` o `from`/`to` en ISO), nivel, entorno, aplicación, búsqueda, huella, orden y página. Los enlaces antiguos con `from`/`to` de un `datetime-local` siguen funcionando.
- **Rangos relativos estables**: "últimas 24 h" se resuelve contra un instante fijado al elegir el rango o al refrescar, no en cada render; si no, la clave de la consulta cambiaría en bucle.
- **Refetch sin saltos**: `keepPreviousData` mantiene tablas y gráficos visibles, atenuados, mientras llegan los datos nuevos.
- **El resumen respeta rango, aplicación y entorno** (lo que acepta `/api/logs/stats`), no la búsqueda ni el nivel. Los totales de la serie salen de sumar la serie horaria; con "Todo el histórico", de los totales históricos del backend.

## Componentes interactivos propios

- **Select**: patrón ARIA *select-only combobox*. El disparador conserva el foco y anuncia la opción activa con `aria-activedescendant`; admite buscador, valor libre y búsqueda por primera letra.
- **Paneles flotantes** (`useFloating` + `Portal`): `position: fixed` con coordenadas de ventana, para que ninguna tabla con `overflow` los recorte; se abren hacia arriba si abajo no caben. Si el ancla está dentro de un `<dialog>` modal, el panel se monta dentro del diálogo (la *top layer* taparía cualquier cosa montada en `<body>`).
- **Calendario**: tabindex móvil y teclado completo (flechas, RePag/AvPag, Inicio/Fin). El selector de rangos pone primero los rangos rápidos y detrás el rango a medida con horas.
- **Dialog**: `<dialog>` nativo, que ya atrapa el foco y deja inerte el resto.
- **Inspector del log**: en modo cajón atrapa el foco y lo devuelve al cerrar; `Esc` lo cierra en los dos modos. Con el inspector abierto, las flechas recorren la tabla y van cambiando el detalle.

## Gráficos

Todos en SVG propio, con la paleta de niveles **validada para cada superficie** (separación en daltonismo y visión normal). En oscuro el ámbar baja a `#c98500` y el rojo sube a `#d03b3b`, porque el par del modo claro no se distinguía bastante sobre el fondo oscuro. `debug` es gris a propósito.

- **Actividad**: columnas apiladas de 24 px como máximo, extremo superior redondeado y base recta, 2 px de hueco entre segmentos, rejilla fina y sólida. Los errores van abajo, pegados a la línea base. Solo se rotula el pico. El número de columnas depende del ancho real (en 4K se ve más detalle) y las horas se agrupan en intervalos "redondos" (1, 2, 3, 4, 6, 8, 12, 24 h…). **Arrastrar acota el rango** y un clic aísla una columna; el tooltip muestra todos los niveles del intervalo. Hay vista de tabla para quien no puede o no quiere leer el gráfico.
- Las **horas vacías se rellenan** alineadas en UTC, igual que el `DATE_TRUNC('hour')` del backend.
- **Tarjetas de métrica**: filo superior de 2 px con el color de la serie y sparkline; el número y la etiqueta van en tinta y el número nunca se recorta.

## Reportes

Todo se construye en el navegador (`common/reports`): nada sale de él hasta que se descarga o se copia.

- `collect.ts` pide en paralelo solo lo que usan las secciones elegidas (estadísticas, grupos de error, errores recientes, inventario) y después el ejemplo más reciente de cada fallo, para su stack (tope de 10 peticiones).
- `build.ts` genera tres formatos:
  - **Informe Markdown** para personas: hallazgos en prosa y tablas.
  - **Brief para agentes IA** (`.md`): front matter YAML, rol, objetivo, pasos, reglas, notas del operador, herramientas del servidor MCP `mclog` y formato de respuesta; los datos van en bloques YAML/CSV/JSON dentro de `<mclog_data>`.
  - **JSON** con esquema `mclog.agent-report/v1`, para pipelines.
- **Defensa contra inyección de instrucciones**: los logs son texto de terceros. Todo lo que viene de ellos va dentro de `<mclog_data>` y las reglas dicen explícitamente que ese contenido no es de fiar. Las reglas también advierten que `first_seen` es la primera ocurrencia *dentro de la ventana*, para que el agente no confunda un fallo antiguo con uno nuevo.
- `redact.ts` enmascara correos, IPs, JWT, cabeceras `Bearer`, pares `password=…` y cadenas largas tipo clave. Solo toca texto libre: huellas, traceId e IDs se conservan porque el agente necesita citarlos. Activado por defecto en los formatos para IA y siempre en los briefs rápidos ("Copiar para IA").
- `markdown.ts` escapa `|` en tablas y elige vallas de código más largas que cualquier racha de comillas invertidas del contenido: un log no puede romper el documento.
- La vista previa (`MarkdownView`) es un parser pequeño que devuelve elementos de React, **nunca HTML**: un log con `<script>` se ve como texto.

## Stream en vivo

`useLogStream` abre un `EventSource` contra `GET /api/logs/stream`.

- `EventSource` no admite cabeceras propias, así que la autenticación viaja en la cookie de sesión.
- El navegador reconecta solo; el hook no tiene lógica de reintento.
- Los logs de un lote llegan sin `id`, así que el hook añade una `streamKey` local como clave de lista.
- Solo se activa en la primera página, con orden por fecha descendente y un rango abierto hasta ahora. En cualquier otra vista, anteponer filas nuevas mentiría sobre lo que se está mirando.
- Mientras está activo se refresca la tabla cada 15 s y se vacía el buffer, para que las filas del stream se sustituyan por las del servidor, con id y metadata completos.

## Acciones destructivas

`ConfirmButton` pide un segundo clic y se desarma solo a los 5 s. Se usa en lugar de `window.confirm`, que bloquea el hilo, no se puede estilar y algunos navegadores suprimen.

## Configuración

`.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:3000
```

En producción detrás de Caddy, **déjala sin definir**: las peticiones salen relativas al mismo dominio y desaparecen tanto el CORS entre orígenes como la necesidad de cookies `SameSite=None`. Para un despliegue con dominios separados, pásala como `--build-arg` al construir la imagen, y configura en el backend `CORS_ORIGINS` con el dominio del dashboard y `COOKIE_SECURE=1`.

**El build necesita acceso a `fonts.googleapis.com`** para descargar las tipografías (después se sirven desde el propio dashboard). Detrás de un proxy corporativo que intercepta TLS, Node no confía en su certificado por defecto; con Node 22.15+ basta con `NODE_OPTIONS=--use-system-ca`, que usa el almacén de certificados del sistema sin desactivar la verificación.

## Scripts

```bash
npm run dev     # http://localhost:3001
npm run build   # build de producción (output standalone)
npm start       # sirve el build en 3001
npm run lint
```
