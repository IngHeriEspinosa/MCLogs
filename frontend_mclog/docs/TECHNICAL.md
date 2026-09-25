# frontend_mclog · Documento Técnico

## Stack

Next.js 14 (App Router) · React 18 · TypeScript · TanStack React Query v5 · axios · Tailwind CSS.

Sin librerías de componentes, iconos ni gráficos: selects, calendario, menús, diálogos, iconos y gráficos son propios. Pesan menos que cualquier paquete equivalente y el proyecto no suma dependencias.

## Estructura

```
src/
  app/
    layout.tsx                 Server component: fuentes, script de tema, idioma desde cookie, Open Graph genérico
    opengraph-image.tsx        Imagen de la vista previa de cualquier enlace al panel (next/og, runtime edge)
    providers.tsx              QueryClient + ThemeProvider + I18nProvider + ToastProvider
    icon.svg                   Favicon (el mismo isotipo que el sitio público)
    page.tsx                   Acceso (SignIn); con sesión abierta redirige a /logs o a ?next=
    logs/page.tsx              Logs: filtros, resumen, tabla, inspector (diálogo), modo en vivo y Compartir
    records/page.tsx           Registros: solo tabla, búsqueda avanzada por campo, inspector y Compartir
    snapshots/page.tsx         Snapshots del espacio: enlace, visibilidad, caducidad, vistas y borrado
    s/[token]/page.tsx         Visor de un snapshot (Logs, Errores o Traza), fuera del panel: sin sesión si es público
    s/[token]/layout.tsx       Etiquetas Open Graph de la vista previa del enlace (servidor)
    s/[token]/opengraph-image  Imagen de la vista previa (next/og, runtime edge)
    errors/page.tsx            Errores agrupados por huella
    reports/page.tsx           Generador de reportes (Markdown, brief para IA, JSON)
    trace/[traceId]/page.tsx   Una operación completa, con línea temporal en cascada
    lab/page.tsx               Lab: escenarios de prueba y compositor de logs (dueño del espacio)
    settings/api-keys/page.tsx Claves con permisos (dueño del espacio)
    settings/users/page.tsx    Cuentas de la plataforma (admin)
    settings/alerts/page.tsx   Canales, reglas e historial de avisos (dueño del espacio)
    settings/password/page.tsx Mi cuenta: sesión, preferencias, contraseña, 2FA y zona de peligro
    (auth)/login/page.tsx      Alias de "/" para enlaces antiguos: monta el mismo SignIn
  common/
    api/                       client (axios + refresh), download, errorMessage, logout
    i18n/                      config, format (Intl), I18nProvider, dictionaries/{es,en}
    theme/                     config (cookie + script anti-destello), ThemeProvider
    time/                      range (rangos relativos/absolutos ↔ URL), timeline (serie horaria)
    reports/                   collect, build, markdown, redact
    snapshots/view.ts          Orden y paginación del visor, y filtros de la vista → cuerpo del POST
    snapshots/preview.ts       Vista previa del enlace: petición al backend (servidor) y textos
    errors/summary.ts          Totales de los errores agrupados (ocurrencias, app más afectada, concentración)
    lab/                       scenarios (los 7 escenarios y el prefijo lab-), run (envío y purga)
    clipboard.ts               Copiar con respaldo para contextos sin HTTPS
  hooks/
    useAuth.ts                 Sesión, login en dos pasos, 2FA, borrar cuenta, logs y estadísticas + tipos
    useErrors.ts               Grupos de error, traza, contexto, inventario de aplicaciones
    useLogFilters.ts           Filtros de Logs y Registros (incluida la búsqueda avanzada), con la URL como fuente de verdad
    useLab.ts                  Ejecución de escenarios, compositor y purga del Lab
    useOptions.ts              Opciones traducidas de los selects de filtro
    useFloating.ts             Posicionamiento de paneles flotantes y cierre al pulsar fuera
    useElementSize.ts          Tamaño real de un elemento (gráficos)
    usePreference.ts           Preferencias en localStorage y media queries
    useSnapshots.ts            Crear, listar, borrar y abrir snapshots (401 = pedir sesión, 404/400 = no existe)
    useSettings.ts             Configuración de la plataforma y banderas públicas (Lab, MCP, snapshots…)
    useApiKeys / useUsers / useAlerts / useLogStream / useDebounce
  components/
    atoms/                     Button, Input, Field, Checkbox, Switch, Segmented, Icon,
                               LevelBadge, Tag, Alert, Skeleton, Spinner, EmptyState
    molecules/                 Card, Select, Menu, Dialog, Toast, Calendar, DateRangePicker,
                               DatePicker, StatTile, Sparkline, ActivityChart, Distribution,
                               CodeBlock, MarkdownView, CopyButton, ConfirmButton, Portal, InfoTip
    organisms/                 Sidebar, Topbar, SignIn, LogFilterBar, LogOverview, LogTable, LogInspector,
                               AdvancedLogSearch, ShareSnapshotDialog, SnapshotOverview,
                               ErrorGroups (tarjetas y tabla de Errores), TraceTimeline (métricas y cascada de una traza),
                               LabScenarioCard, LabComposer, TwoFactorCard, DeleteAccountCard
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
- Las vistas de datos usan todo el ancho hasta 3840 px: el resumen pasa a una sola fila, la tabla gana columnas (host a partir de `2xl`, traza a partir de `4xl`) y el detalle del log, un diálogo al 90 % de la pantalla, aprovecha el espacio a dos columnas. Los formularios se quedan en una columna legible (`width="narrow"`).

## Idiomas (es / en)

- `dictionaries/es.ts` es la referencia y define el tipo `Dictionary`; `en.ts` está tipado contra él, así que **una traducción que falte es un error de compilación**.
- Los textos con datos son funciones que reciben los números ya formateados: el diccionario decide el orden de las palabras y `format.ts` el formato (`Intl`, creado una vez por idioma).
- El idioma se guarda en la cookie `mclog_locale`. El layout la lee en el servidor (o, si no existe, `Accept-Language`), así que la primera pintura ya sale en el idioma correcto. Cambiarlo es inmediato y no recarga.
- Los reportes tienen su propio selector de idioma, independiente del de la interfaz.

## Tema (claro / oscuro / sistema)

- La preferencia va en la cookie `mclog_theme`. Un script en `<head>` fija `data-theme` en `<html>` **antes de pintar**, así el modo oscuro no destella en blanco al cargar. Con "Sistema" sigue los cambios del sistema operativo en caliente.
- Tailwind usa `darkMode: ["selector", '[data-theme="dark"]']`: el usuario puede elegir oscuro aunque su sistema diga claro.

## Datos y estado

- **Sesión**: tokens en cookies httpOnly del backend. Hay dos guardas, y la fuente de verdad es siempre el backend:
  - El interceptor de axios reintenta una vez con `/auth/refresh` ante un 401 y redirige a `/` (el acceso) si falla. Hay **un único refresh en vuelo**: si varias peticiones caducan a la vez, todas esperan al mismo en lugar de rotar el token cada una por su cuenta. Los 401 de `/auth/login`, `/auth/refresh` y `/auth/logout` no se reintentan; `/auth/me` sí, porque es lo que decide si el panel manda al login. Si el refresh de `/auth/me` falla, el interceptor **no** redirige: la pantalla de acceso (`/`) lo consulta solo para saber si hay sesión; el panel ya redirige desde `DashboardLayout`. `GET /api/share/:token` tampoco se reintenta ni redirige: su 401 significa "snapshot de equipo sin sesión" y el visor ofrece entrar sin perder el enlace.
  - `DashboardLayout` pide `/auth/me` y, si falla, manda a `/?next=<ruta>`. Tras entrar, el acceso vuelve a esa ruta (solo rutas internas: empieza por `/` y no por `//`); si no hay `next`, va a `/logs`. Se conserva la ruta con su query.
  - **`/` es el acceso.** `SignIn` pide `/auth/me`: mientras responde muestra un spinner (para no enseñar el formulario un instante a quien ya ha entrado), con sesión redirige a `next` o a `/logs`, y sin ella pinta el login. `/login` monta el mismo componente para no romper enlaces antiguos. Cerrar sesión, borrar la cuenta o cambiar la contraseña vuelven a `/`.
- **Autorización visual, nunca como control**: el menú oculta la administración del espacio a quien no es su dueño y la de la plataforma a quien no es admin, pero cada página comprueba el rol y el backend lo exige igualmente.
- **Filtros en la URL** (`useLogFilters`):
  - Rango (`range=24h` o `from`/`to` en ISO), nivel, entorno, aplicación, búsqueda, huella, orden y página.
  - Los seis campos de la búsqueda avanzada: `message`, `service`, `host`, `traceId`, `errorName`, `errorCode`. `advancedCount` cuenta cuántos hay activos, para el distintivo de la tarjeta.
  - Los enlaces antiguos con `from`/`to` de un `datetime-local` siguen funcionando.
- **Rangos relativos estables**: "últimas 24 h" se resuelve contra un instante fijado al elegir el rango o al refrescar, no en cada render; si no, la clave de la consulta cambiaría en bucle.
- **Refetch sin saltos**: `keepPreviousData` mantiene tablas y gráficos visibles, atenuados, mientras llegan los datos nuevos.
- **El resumen respeta rango, aplicación y entorno** (lo que acepta `/api/logs/stats`), no la búsqueda ni el nivel. Los totales de la serie salen de sumar la serie horaria; con "Todo el histórico", de los totales históricos del backend.

## Componentes interactivos propios

- **Select**: patrón ARIA *select-only combobox*. El disparador conserva el foco y anuncia la opción activa con `aria-activedescendant`; admite buscador, valor libre y búsqueda por primera letra.
- **Paneles flotantes** (`useFloating` + `Portal`): `position: fixed` con coordenadas de ventana, para que ninguna tabla con `overflow` los recorte; se abren hacia arriba si abajo no caben. Si el ancla está dentro de un `<dialog>` modal, el panel se monta dentro del diálogo (la *top layer* taparía cualquier cosa montada en `<body>`).
- **Calendario**: tabindex móvil y teclado completo (flechas, RePag/AvPag, Inicio/Fin). El selector de rangos pone primero los rangos rápidos y detrás el rango a medida con horas.
- **Dialog**: `<dialog>` nativo, que ya atrapa el foco y deja inerte el resto.
- **Ayuda contextual (`InfoTip`)**: el icono de información junto al nombre de un campo, con una explicación más larga que la ayuda visible bajo el campo (no la repite). Los textos viven en `dictionaries/*.fieldInfo`, agrupados por pantalla (`auth`, `log`, `records`, `reports`, `apiKeys`, `users`, `alerts`, `lab`, `account`), y `Field`, `Fieldset` y `Switch` lo montan a partir de su prop `info` (en `Field`, el icono va fuera del `<label>`: dentro, pulsarlo enfocaría el campo).
  - Se abre al pasar el ratón (con 150 ms de retardo para no encender ayudas al cruzar un formulario), al llegar con el teclado y al pulsarlo, que es lo único posible en táctil; pulsado se queda abierto hasta pulsar fuera. El ratón puede entrar en el panel sin que se cierre (120 ms de margen) y `Esc` lo cierra siempre (WCAG 1.4.13).
  - `Esc` se captura y se cancela, para cerrar solo la ayuda y no el diálogo o el detalle del log que la contiene.
  - El texto va también oculto junto al botón como `aria-describedby`: el lector de pantalla lo lee al llegar al icono, sin abrir el panel.
  - Solo el ratón dispara el hover (`pointerType === "mouse"`): en táctil el hover llega con el toque y lo abriría y cerraría a la vez.
- **Inspector del log**: el mismo diálogo en Logs, Registros y el visor de snapshots. `<dialog>` modal al 90 % de la pantalla, con el detalle a dos columnas (mensaje, acciones, stack y metadata a la izquierda; propiedades y contexto a la derecha). Lleva botones anterior/siguiente, la posición "N de M en esta página", y responde a `←`/`→`. Un clic en el fondo o `Esc` lo cierran, y el foco vuelve a la fila. Abrir desde el contexto un log que no está en la página lo muestra sin navegación.
  - `readOnly` (snapshots): sin contexto (no se pide `/api/logs/:id/context`), sin "Ver traza" y sin "Similares", que llevarían a datos en vivo a los que quien mira puede no tener acceso. Copiar JSON y Copiar para IA se mantienen.
- **Ayuda en las métricas**: el icono de cada `StatTile` es el disparador de un `InfoTip` (prop `trigger`) con qué mide la cifra y cómo se calcula; las tarjetas de gráfico (`Card`, prop `info`) llevan el icono ⓘ junto al título. Los textos están en `fieldInfo.metrics` (y `snapshots.viewer.info` para el visor, donde todo va acotado al rango y nada es interactivo).
- **`Segmented`** admite opciones `disabled`: se ven, no se eligen y las flechas las saltan (la opción **Público** del diálogo de compartir, cuando no se puede).
- **Búsqueda avanzada** (`AdvancedLogSearch`): seis campos con debounce de 350 ms. Los valores se recortan antes de pasar a la URL, así que una búsqueda se puede compartir con el enlace. La tarjeta se pliega, y el estado queda en la preferencia `records-advanced`. **Limpiar filtros** no toca estos campos: tienen su propio botón.

## Gráficos

Todos en SVG propio, con la paleta de niveles **validada para cada superficie** (separación en daltonismo y visión normal). En oscuro el ámbar baja a `#c98500` y el rojo sube a `#d03b3b`, porque el par del modo claro no se distinguía bastante sobre el fondo oscuro. `debug` es gris a propósito.

- **Actividad**: columnas apiladas de 24 px como máximo, extremo superior redondeado y base recta, 2 px de hueco entre segmentos, rejilla fina y sólida. Los errores van abajo, pegados a la línea base. Solo se rotula el pico. El número de columnas depende del ancho real (en 4K se ve más detalle) y las horas se agrupan en intervalos "redondos" (1, 2, 3, 4, 6, 8, 12, 24 h…). **Arrastrar acota el rango** y un clic aísla una columna; el tooltip muestra todos los niveles del intervalo. Hay vista de tabla para quien no puede o no quiere leer el gráfico.
- Las **horas vacías se rellenan** alineadas en UTC, igual que el `DATE_TRUNC('hour')` del backend.
- **Tarjetas de métrica**: filo superior de 2 px con el color de la serie y sparkline; el número y la etiqueta van en tinta y el número nunca se recorta. El icono abre la explicación de la métrica.

## Reportes

Todo se construye en el navegador (`common/reports`): nada sale de él hasta que se descarga o se copia.

- `options.ts` define tipos, secciones y la validación de preferencias. No depende del cliente HTTP, así que la página y los tests lo usan sin arrastrar axios. `collect.ts` lo reexporta.
- `collect.ts` pide en paralelo solo lo que usan las secciones elegidas (estadísticas, grupos de error y de warning, errores recientes, inventario, y estadísticas y grupos de la ventana anterior para la comparación). Después pide el ejemplo más reciente de cada fallo, para su stack: como mucho 20 peticiones, de 5 en 5, para no chocar con el rate limit. Los formatos para agentes piden siempre los grupos, porque su resumen cuenta los fallos distintos. El inventario (`/api/logs/applications`) solo admite `hours` hasta ahora, así que se le pide la ventana que cubre desde el inicio del reporte (24–744 h) y el documento dice desde cuándo cuenta.
- `build.ts` genera tres formatos:
  - **Informe Markdown** para personas: hallazgos en prosa, tablas y un enlace a las ocurrencias de cada fallo en MCLog.
  - **Brief para agentes IA** (`.md`, `mclog.agent-brief/v2`): front matter YAML, rol, objetivo, pasos, reglas, notas del operador, herramientas del servidor MCP `mclog` y formato de respuesta; los datos van en bloques YAML/CSV/JSON dentro de `<mclog_data>`.
  - **JSON** con esquema `mclog.agent-report/v2`, para pipelines (cambios respecto a v1 en `docs/AI_INTEGRATION.md`).
- **Comparación con el periodo anterior**: `trendOf` clasifica cada fallo en `new`, `up`, `down`, `flat` o `unknown`. Un cambio cuenta si supera el 25 % y 3 ocurrencias. Si el periodo anterior llegó al tope de 100 grupos, un fallo ausente es `unknown` y no `new`; si lo alcanzó la ventana actual, no se afirma qué dejó de aparecer.
- **Defensa contra inyección de instrucciones**: los logs son texto de terceros. Todo lo que viene de ellos va dentro de `<mclog_data>` y la primera regla (`untrustedRule`) dice explícitamente que ese contenido no es de fiar. Las reglas también advierten que `first_seen` es la primera ocurrencia *dentro de la ventana*, para que el agente no confunda un fallo antiguo con uno nuevo. Las reglas condicionales (enmascarado, comparación) tienen su propia clave en el diccionario, no se filtran por texto.
- `redact.ts` enmascara correos, IPs, JWT, cabeceras `Bearer`, pares `password=…` y cadenas largas tipo clave. Solo toca texto libre: huellas, traceId e IDs se conservan porque el agente necesita citarlos, y los UUID dentro de mensajes también (suelen ser ids de entidades). `createRedactor()` cuenta lo que tapa y la vista previa lo muestra. Activado por defecto en los formatos para IA y siempre en los briefs rápidos ("Copiar para IA").
- `markdown.ts` escapa `|` en tablas y elige vallas de código más largas que cualquier racha de comillas invertidas del contenido: un log no puede romper el documento.
- La vista previa (`MarkdownView`) es un parser pequeño que devuelve elementos de React, **nunca HTML**: un log con `<script>` se ve como texto. Los enlaces solo son clicables si apuntan al propio origen de MCLog (`safeHref`); un `[pulsa aquí](https://…)` dentro de un log se queda en texto.
- Preferencias: tipo, secciones, opciones e idioma se guardan en `localStorage` (`mclog.reports.prefs`) tras montar, para no desajustar la hidratación. Una sección nueva por defecto se añade a quien guardó antes de que existiera. El tipo, el rango y el ámbito se sincronizan con la URL.

### Tests

`npm test` usa el runner nativo de Node 24, que ya ejecuta TypeScript quitando los tipos: no hay dependencias nuevas. `tests/alias-loader.mjs` resuelve los alias `@/` y los imports sin extensión. Por eso, en los módulos que cargan los tests, los imports de solo tipos llevan `type` (`import { es, type Dictionary }`): Node no puede saber que un nombre es un tipo y fallaría al buscarlo.

## Snapshots

Copias congeladas de Logs, Registros, Errores o una Traza con un enlace propio. El backend captura y guarda los datos; el frontend solo pide, muestra y enlaza.

- **Origen**: `ShareSnapshotDialog` recibe un `source` (`logs` con sus filtros, `errors` con rango, nivel, aplicación y entorno, o `trace` con su `traceId`) y lo convierte en `kind` y `filters`. Errores y Traza usan los mismos organismos que el visor (`ErrorGroups`, `TraceTimeline`), así que la copia se ve igual que la pantalla.
- **Crear** (`ShareSnapshotDialog`): título (propuesto con el rango y la aplicación, o el `traceId`), visibilidad (**Equipo** / **Público**) y caducidad (1, 7, 30 días o nunca). `toSnapshotFilters` convierte los filtros de la vista al cuerpo del `POST /api/snapshots`: rango resuelto a fechas con `Date.now()` al pulsar (así "últimas 24 h" son las 24 h hasta ese momento), sin vacíos ni paginación, y la búsqueda por campo solo desde Registros, que es la única vista que la aplica. El diálogo avisa si los logs superan `maxSnapshotRows` y traduce los rechazos previsibles (`403` público no permitido, `409` tope del espacio) en vez de enseñar el mensaje en inglés del backend.
- **Público**: se desactiva en el diálogo si no eres dueño del espacio o si `publicSnapshotsEnabled` está apagado (banderas de `/api/settings/public`). El backend lo exige igualmente.
- **Ver** (`/s/[token]`): página fuera de `DashboardLayout`, con su propia cabecera (idioma y tema). `usePublicSnapshot` distingue tres estados: `ok`, `signIn` (401: snapshot de equipo sin sesión; ofrece `/?next=/s/<token>`) y `notFound` (404, o 400 si el enlace llegó cortado). `layout.tsx` fija `referrer: no-referrer` y `robots: noindex`.
  - `SnapshotOverview` reproduce la disposición del resumen de Logs con los datos guardados, sin interacción.
  - La tabla es `LogTable` con orden y paginación locales (`sortLogs`, `paginate`): los logs ya vienen todos con el snapshot. El orden de niveles es el del enum de PostgreSQL y el id desempata, como en el servidor.
  - El detalle es `LogInspector` en modo `readOnly`.
  - Errores: `ErrorKpis` y `ErrorGroupsTable` con los grupos guardados; **Ver ejemplo** abre el log de ejemplo de cada fallo (←/→ siguen el orden de la tabla).
  - Traza: `TraceKpis` con los totales guardados (de la operación entera, aunque no se guardaran todos los logs) y `TraceTimeline`.
- **Vista previa** (Slack, WhatsApp, Teams): el robot no ejecuta JavaScript, así que `s/[token]/layout.tsx` (`generateMetadata`, en el servidor) pide `GET /api/share/:token/preview` y rellena título, descripción y etiquetas Open Graph/Twitter; `opengraph-image.tsx` dibuja una imagen de 1200×630 con `next/og` (runtime **edge**: en Node, `next/og` resuelve mal la ruta de su fuente en Windows). La llamada usa `API_INTERNAL_URL` o, si falta, `NEXT_PUBLIC_API_URL`, con 3 s de tope. De un snapshot de equipo o desconocido sale una tarjeta genérica.
- **Gestionar** (`/snapshots`, en Observabilidad para cualquier miembro): lista con visibilidad, autor, creación, caducidad y vistas; copiar enlace y borrar (autor o dueño).

## Stream en vivo

`useLogStream` abre un `EventSource` contra `GET /api/logs/stream`.

- `EventSource` no admite cabeceras propias, así que la autenticación viaja en la cookie de sesión.
- El navegador reconecta solo; el hook no tiene lógica de reintento.
- Los logs de un lote llegan sin `id`, así que el hook añade una `streamKey` local como clave de lista.
- Solo se activa en la primera página, con orden por fecha descendente y un rango abierto hasta ahora. En cualquier otra vista, anteponer filas nuevas mentiría sobre lo que se está mirando.
- Mientras está activo se refresca la tabla cada 15 s y se vacía el buffer, para que las filas del stream se sustituyan por las del servidor, con id y metadata completos.

## Login en dos pasos

`SignIn` (`components/organisms/SignIn.tsx`, montado en `/` y en `/login`) es una pequeña máquina de estados:

1. **Contraseña**: `useLogin` llama a `POST /auth/login`. Si la respuesta trae `mfaRequired`, se guarda el `mfaToken` en memoria (nunca en storage) y se pasa al paso 2; si no, la sesión ya está abierta.
2. **Código**: `useLoginSecondFactor` envía `{ mfaToken, code }` a `POST /auth/login/2fa`. El campo acepta el código de 6 dígitos o un código de recuperación. **Volver** descarta el token y limpia la contraseña.

Mapeo de errores:

| Respuesta | Mensaje |
|---|---|
| `401` en el paso 1 | `auth.invalid` |
| `401` en el paso 2 con token caducado | `auth.twoFactorExpired` (el `mfaToken` dura 5 min): el mensaje pide volver al paso 1 con **Volver** |
| `401` en el paso 2 | `auth.twoFactorInvalid` |
| `429` | `auth.tooManyAttempts` |
| Sin respuesta / otro | `networkError` / `serverError` |

## Mi cuenta: 2FA y zona de peligro

- **`TwoFactorCard`**:
  - `useStartTwoFactor` pide `/auth/me/2fa/setup` y muestra el QR (data URI SVG del backend, `<img>` de 176 px) y la clave manual con botón de copiar.
  - `useEnableTwoFactor` confirma con el código. El campo solo admite dígitos, y el botón se habilita con 6.
  - Los 8 códigos de recuperación se muestran en un diálogo que **no se puede descartar** salvo con "Ya los he guardado".
  - `useDisableTwoFactor` pide contraseña y código.
- **`DeleteAccountCard`**:
  - Para la cuenta root muestra un aviso en lugar del botón.
  - El diálogo exige contraseña, el código (solo si el 2FA está activo) y escribir la palabra de confirmación del diccionario (`ELIMINAR` / `DELETE`).
  - Al terminar, `useDeleteAccount` limpia la caché y redirige a `/`.
- `CurrentUser` (de `/auth/me`) incluye `isRoot` y `twoFactorEnabled`. Usuarios (admin) los muestra como etiquetas **Root** y **2FA**, y deshabilita el cambio de rol y el borrado del root.

## Lab

Escenarios que envían **logs reales** a la API con la sesión del dueño del espacio: la ingesta acepta el JWT igual que una API key `ingest`. Viven en `common/lab/`:

- **`scenarios.ts`** define los siete escenarios:

  | id | Qué envía |
  |---|---|
  | `traffic` | 120 logs repartidos en la última hora |
  | `grouping` | 25 veces el mismo timeout |
  | `trace` | 7 logs con un traceId, fallo en billing |
  | `incident` | 80 en 5 minutos |
  | `newError` | 3, con huella nueva en cada ejecución |
  | `sensitive` | 6 con datos personales ficticios |
  | `live` | 20, uno cada 750 ms |

  Cada escenario construye un `LabPlan` (logs, modo `batch` o `stream`, enlaces al resultado). Todas las aplicaciones llevan el prefijo `lab-`.
- **`run.ts`**:
  - En modo `batch` envía en trozos de 100 (muy por debajo de `MAX_BATCH_SIZE`); en `stream`, de uno en uno con 750 ms de pausa.
  - Detener a medias no es un error: lo enviado cuenta.
  - `purgeLab` borra con `DELETE /api/logs` por cada aplicación `lab-*` conocida o presente en el inventario. La purga filtra por nombre exacto, y la fecha límite es "mañana" para no dejar logs con la hora adelantada.
- **`useLab.ts`**:
  - Un `AbortController` por escenario, así que se pueden ejecutar varios a la vez y detener uno solo.
  - Al salir de la página se aborta todo.
  - Al acabar se invalidan las consultas de logs, grupos, aplicaciones y trazas.
- El entorno de destino por defecto es `development`, para no contaminar métricas ni disparar alertas de producción.
- El compositor ("Log a medida") muestra la misma petición en JSON y cURL. El cURL usa `window.location.origin` si `NEXT_PUBLIC_API_URL` está vacía.

## Acciones destructivas

`ConfirmButton` pide un segundo clic y se desarma solo a los 5 s. Se usa en lugar de `window.confirm`, que bloquea el hilo, no se puede estilar y algunos navegadores suprimen.

## Configuración

`.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:3000
# API_INTERNAL_URL=http://api:3000
```

`API_INTERNAL_URL` solo la usa el servidor de Next (vista previa de los enlaces de snapshots) y se lee al arrancar. Hace falta cuando `NEXT_PUBLIC_API_URL` va vacía (detrás de Caddy); en Compose ya está puesta.

Es una variable **de compilación**: Next la incrusta en el bundle, así que cambiarla exige reconstruir la imagen.

- **Detrás de Caddy (mismo dominio)**: **déjala sin definir**. Las peticiones salen relativas al mismo dominio, y así desaparecen tanto el CORS entre orígenes como la necesidad de cookies `SameSite=None`.
- **Dominios separados** (por ejemplo, el dashboard en Railway y la API en CapRover):
  - Pásala como `--build-arg` (en Railway, como variable del servicio, que también llega al build).
  - En el backend, configura `CORS_ORIGINS` con el dominio exacto del dashboard y `COOKIE_SECURE=1`.
  - Si los dominios no comparten sitio, configura también `COOKIE_SAMESITE=none`.

  Ver [DEPLOYMENT.md](../../docs/DEPLOYMENT.md).

La imagen (`Dockerfile`, Node 20) usa `output: "standalone"` y escucha en `PORT`, o en 3001 si no se define: Railway inyecta `PORT` y Compose no.

**El build necesita acceso a `fonts.googleapis.com`** para descargar las tipografías (después se sirven desde el propio dashboard). Detrás de un proxy corporativo que intercepta TLS, Node no confía en su certificado por defecto; con Node 22.15+ basta con `NODE_OPTIONS=--use-system-ca`, que usa el almacén de certificados del sistema sin desactivar la verificación.

## Scripts

```bash
npm run dev     # http://localhost:3001
npm run build   # build de producción (output standalone)
npm start       # sirve el build en 3001
npm run lint
```
