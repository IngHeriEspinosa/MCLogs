# MCLog · Manual de Usuario del Dashboard

> Manual centrado en el dashboard. El manual completo del proyecto —que además cubre cómo enviar logs desde tus aplicaciones y cómo administrar el servicio— está en [docs/USER_GUIDE.md](../../docs/USER_GUIDE.md). Términos en el [glosario](../../docs/GLOSSARY.md); dudas concretas en el [FAQ](../../docs/FAQ.md).

## Acceso

1. Abre el dashboard (en desarrollo: http://localhost:3001).
2. Inicia sesión con tu correo y contraseña (el administrador los crea; el usuario inicial es el `ADMIN_EMAIL` configurado en el backend).
3. La sesión se renueva sola mientras uses la aplicación. Si expira del todo, volverás al login automáticamente.

## Pantalla principal

### Tarjetas de resumen (arriba)
- **Total de logs** almacenados.
- **Últimas 24 h**: volumen reciente.
- **Errores / Warnings**: conteo por severidad.
- **App más activa**: la aplicación que más logs envía.

Se actualizan solas cada minuto.

### Filtros
Puedes combinar todos los filtros; la tabla se actualiza al instante:

- **Nivel**: debug, info, warn o error.
- **Entorno**: development, staging o production.
- **Aplicación**: escribe parte del nombre (busca coincidencias).
- **Buscar**: busca en el mensaje, la aplicación, el host y el traceId.
- **Desde / Hasta**: rango de fechas y hora.
- **Ordenar por**: fecha, aplicación, nivel, host o entorno, ascendente o descendente.

> La URL refleja los filtros activos: copia el enlace del navegador para compartir exactamente lo que estás viendo.

### Tabla de logs
- Cada fila muestra fecha, aplicación, servicio, nivel (con color: rojo=error, ámbar=warn, azul=info, gris=debug), entorno y mensaje.
- **Haz clic en una fila** para expandirla y ver el host, el traceId, el mensaje completo y la metadata (JSON) que envió la aplicación.
- Abajo puedes cambiar el tamaño de página (10/25/50/100) y navegar entre páginas.

### Exportar
Los botones **CSV** y **NDJSON** descargan los logs **con los filtros activos aplicados** (hasta 10 000 registros). CSV abre en Excel; NDJSON es ideal para procesar con herramientas.

### Cerrar sesión
Botón "Cerrar sesión" arriba a la derecha.

## Consejos

- Para investigar un incidente: filtra por `error` + la aplicación + el rango horario del problema, y expande las filas para ver la metadata.
- Si varias aplicaciones participan en una misma operación, busca su **traceId** para ver la traza completa entre sistemas.
- "No hay registros que coincidan" con filtros activos: prueba a limpiar el rango de fechas primero (es el filtro que más se olvida activo).
