# Política de seguridad

## Reportar una vulnerabilidad

**No abras un issue público** para reportar un fallo de seguridad. Un issue es visible para
cualquiera, incluido quien pudiera aprovecharlo antes de que exista un arreglo.

Usa el aviso privado de GitHub:

1. Entra en [la pestaña Security del repositorio](https://github.com/IngHeriEspinosa/MCLogs/security/advisories/new).
2. Describe el fallo, cómo reproducirlo y qué impacto tiene.
3. Recibirás respuesta en el propio aviso, que permanece privado hasta que se publica el arreglo.

Si el formulario no te funciona, abre un issue **sin detalles técnicos** pidiendo un canal privado
de contacto.

### Qué incluir

- Versión o commit afectado.
- Componente: backend (`Back_MCLog/`), dashboard (`frontend_mclog/`), librería npm
  (`packages/mclog/`) o cliente de NetSuite (`integrations/netsuite/`).
- Pasos para reproducirlo, con peticiones de ejemplo si aplica.
- Impacto: qué puede hacer un atacante que hoy no debería poder.

### Qué esperar

Este es un proyecto mantenido por una sola persona, sin acuerdo de nivel de servicio. El
compromiso realista es:

| Etapa | Plazo orientativo |
|---|---|
| Acuse de recibo | 5 días laborables |
| Valoración inicial (confirmado / no aplica) | 15 días naturales |
| Arreglo publicado, según severidad | lo antes posible tras confirmarlo |

Se agradece la divulgación coordinada: dar margen para publicar el arreglo antes de hacer público
el detalle. No hay programa de recompensas.

## Alcance

**Dentro del alcance**, cualquier fallo en el código de este repositorio: omisión de
autenticación o autorización, inyección, exposición de datos entre aplicaciones o entre usuarios,
escalada de privilegios entre roles, fuga de secretos, fallos en la validación de la ingesta o en
el manejo de las API keys y los tokens.

**Fuera del alcance:**

- Instancias de terceros. MCLog es autoalojado: cada instalación la opera su dueño. Si encuentras
  una instancia mal configurada, repórtaselo a quien la opera, no aquí.
- Configuraciones inseguras que el propio proyecto desaconseja en su documentación, como dejar las
  credenciales por defecto de `.env.example` en producción.
- Vulnerabilidades de dependencias sin explotabilidad demostrada en MCLog. Para eso están los
  avisos automáticos de Dependabot.
- Ausencia de cabeceras de seguridad en un despliegue que no usa el Caddyfile incluido.
- Ataques que requieren acceso físico al servidor o credenciales de administrador ya
  comprometidas.

## Versiones mantenidas

El proyecto no publica versiones con soporte prolongado. Los arreglos de seguridad se aplican
sobre la rama `main`; actualizar significa desplegar el último commit.

## Recomendaciones de despliegue

La mayoría de los incidentes en un servicio autoalojado vienen de la configuración, no del código.
Antes de poner MCLog en producción:

- Cambia `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `API_KEY`, `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET`.
  Los valores de `.env.example` son públicos por definición.
- Tras el primer arranque, entra con la cuenta root (`ADMIN_EMAIL`), cambia su contraseña y
  **activa la verificación en dos pasos**. Pide lo mismo a cada administrador: en **Administración →
  Usuarios**, la etiqueta **2FA** muestra quién la tiene.
- Guarda los códigos de recuperación fuera del servidor. A propósito, un admin no puede quitar el
  2FA de otra cuenta; la recuperación sin códigos es un procedimiento de base de datos.
- Emite una API key por emisor, con el permiso mínimo (`ingest`) y acotada a su aplicación. Si se
  filtra una, revócala sin tocar a los demás. No repartas la clave heredada `API_KEY`.
- No expongas PostgreSQL fuera de la red interna (Docker o CapRover).
- Sirve la API **siempre por HTTPS**. Con el despliegue de Docker Compose, usa el `Caddyfile`
  incluido: resuelve el HTTPS y aplica HSTS, `X-Frame-Options` y `X-Content-Type-Options`. Con
  dashboard y API en dominios distintos, usa subdominios del mismo dominio raíz, `COOKIE_SECURE=1`
  y un `CORS_ORIGINS` exacto.
- No guardes credenciales (contraseñas de base de datos, tokens de plataformas, API keys) en
  ficheros del repositorio, aunque estén en `.gitignore`: un fichero ignorado sigue copiándose en
  zips, copias de seguridad y capturas de pantalla.
- Mantén las copias de seguridad diarias activas y comprueba de vez en cuando que se restauran.
- Ajusta la retención al mínimo que te sirva. Un log que ya no existe no se puede filtrar.
- Los **snapshots** son copias que la retención no borra. Pide caducidad a los que no la necesiten
  indefinida, y si no vas a compartir fuera del equipo apaga **Snapshots públicos** en
  **Plataforma → Configuración**: deja de servir también los ya creados. Los públicos se enmascaran
  siempre, pero el enmascarado reduce lo que sale, no sustituye a no loguear secretos.

Detalle completo en [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) y en la sección de seguridad de
[docs/TECHNICAL.md](docs/TECHNICAL.md).
