# MCLog — Sitio público

Landing y documentación pública de MCLog. Se compila a HTML estático y se publica en **GitHub
Pages**: <https://inghieriespinosa.github.io/MCLogs>

No tiene nada que ver con `frontend_mclog/`. Aquel es el dashboard privado que se despliega en tu
instancia bajo `MCLOG_DOMAIN`; este es un sitio público sin autenticación, sin API y sin acceso a
la base de datos.

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
proyecto.** El catálogo `DOCS` de ese fichero decide qué documentos se publican, con qué ruta y en
qué orden.

Dos detalles que conviene conocer antes de tocarlo:

- **Los slugs de los encabezados imitan los de GitHub**, acentos incluidos. Los `.md` ya enlazan
  entre sí con anclas como `USER_GUIDE.md#c7-retención-de-logs`, y si la normalización no coincide
  esos enlaces se rompen solo en la web.
- **Los enlaces del Markdown llevan el `basePath` a mano.** `next/link` lo antepone solo, pero el
  HTML que sale de `marked` no pasa por Next.

Un enlace de un `.md` a un fichero fuera de `docs/` se reescribe apuntando a GitHub, así que las
referencias al código siguen funcionando.

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
    docs.ts               Markdown -> HTML, slugs y reescritura de enlaces
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
