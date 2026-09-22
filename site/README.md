# MCLog — Sitio público

Landing y documentación pública de MCLog. Se compila a HTML estático y se publica en **GitHub
Pages**: <https://ingheriespinosa.github.io/MCLogs>

No tiene nada que ver con `frontend_mclog/`. Aquel es el dashboard privado que se despliega en tu
propia instancia (con Caddy bajo `MCLOG_DOMAIN`, o en Railway); este es un sitio público sin
autenticación, sin API y sin acceso a la base de datos.

## Stack

Next.js 14 (App Router) con `output: "export"` · Tailwind · `marked` + `highlight.js`.
Todo se resuelve en el build: el sitio publicado no lleva servidor ni llamadas a ninguna API.

## Arrancar en local

```bash
npm install
npm run dev     # http://localhost:3002/MCLogs
```

El `basePath` también se aplica en desarrollo, a propósito: así un enlace que se rompería en
producción se rompe también aquí.

```bash
npm run build   # genera out/
npm start       # sirve out/ para revisar el resultado final
```

## La documentación no vive aquí

Las páginas bajo `/docs` se generan leyendo los `.md` de [`../docs/`](../docs/) durante el build
([`src/lib/docs.ts`](src/lib/docs.ts)). **Para corregir un texto se edita el `.md`, no este
proyecto.** El catálogo `DOCS` de ese fichero decide qué documentos se publican, con qué ruta, en
qué grupo y en qué orden.

Los grupos, en el orden en que aparecen:

| Grupo | Contenido |
|---|---|
| **Guías paso a paso** | `docs/guias/*.md`: un proceso de principio a fin cada una |
| **Empezar** · **Integrar** · **Desplegar y operar** · **Referencia** | Los documentos de referencia de `docs/` |

Al final de cada página hay enlaces **Anterior / Siguiente** dentro del mismo grupo, en el orden de
`DOCS`: en las guías, ese orden es el camino recomendado de lectura.

### Añadir una guía

1. Crea `docs/guias/<nombre>.md` con un H1 (se usa como cabecera y se quita del cuerpo) y esta
   estructura: **Qué vas a conseguir**, **Antes de empezar**, **Paso 1 — …**, **Comprueba que
   funcionó**, **Si algo falla** y **Siguiente paso**.
2. Añádela a `DOCS` en `src/lib/docs.ts` con `group: "guias"`, en el punto del recorrido que le
   corresponda.
3. Enlázala desde [`docs/README.md`](../docs/README.md#guías-paso-a-paso).

### Qué entiende el renderizador

- **Enlaces relativos**, resueltos desde la carpeta del `.md`, igual que en GitHub. Un enlace a otro
  documento publicado lleva a su página; `README.md` lleva al índice `/docs`; cualquier otro fichero
  del repositorio (código, READMEs de componentes) se reescribe a GitHub.
- **Avisos al estilo de GitHub**, que se ven igual en el repositorio:

  ```markdown
  > [!NOTE]      información útil
  > [!TIP]       un atajo o buena práctica
  > [!IMPORTANT] algo que no hay que saltarse
  > [!WARNING]   un error habitual o algo con consecuencias
  > [!CAUTION]   una acción destructiva
  ```

  (El marcador va solo en la primera línea del bloque; el texto, en las siguientes.)
- **Listas numeradas de primer nivel** como pasos: número en un círculo y una línea que los une.
  Una lista que empieza en otro número (por ejemplo tras un bloque de código) respeta ese número.
- **Tablas** con scroll horizontal en móvil, **código** resaltado con highlight.js, `<kbd>` para
  teclas, e **imágenes** relativas servidas desde GitHub.

Dos detalles que conviene conocer antes de tocarlo:

- **Los slugs de los encabezados imitan los de GitHub**, acentos incluidos. Los `.md` ya enlazan
  entre sí con anclas como `USER_GUIDE.md#c7-retención-de-logs`, y si la normalización no coincide
  esos enlaces se rompen solo en la web.
- **Los enlaces del Markdown llevan el `basePath` a mano.** `next/link` lo antepone solo, pero el
  HTML que sale de `marked` no pasa por Next.

## Estructura

```
src/
  app/
    page.tsx              Landing
    docs/                 Índice y página por documento
    legal/                Privacidad y licencia
    sitemap.ts robots.ts  SEO
  components/
    landing/              Secciones de la landing
  lib/
    docs.ts               Catálogo DOCS, Markdown -> HTML, slugs, avisos, pasos y reescritura de enlaces
    site.ts               URLs del proyecto y basePath
```

## Despliegue

Automático. [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) compila y publica en
cada push a `main` que toque `site/` o `docs/`. Requiere que en **Settings → Pages** del
repositorio la fuente esté puesta en **GitHub Actions**.

### Con dominio propio

GitHub Pages sirve un repositorio de proyecto bajo `/<repo>`, de ahí el `basePath`. Si algún día
se usa un dominio propio, hay que compilar sin él y actualizar la URL pública:

```bash
SITE_BASE_PATH="" npm run build
```

Y cambiar `SITE_URL` en [`src/lib/site.ts`](src/lib/site.ts).
