# Copias y mantenimiento

Las tareas periódicas de quien opera MCLog: controlar cuánto se guarda, tener copias que funcionen, restaurarlas y actualizar a versiones nuevas.

## Qué vas a conseguir

- Una retención ajustada a lo que necesitas.
- Copias de seguridad diarias **fuera del servidor**, y la certeza de que se pueden restaurar.
- Un procedimiento seguro para actualizar MCLog.

## Antes de empezar

- Acceso por SSH al servidor (o al panel de CapRover).
- Saber qué despliegue usas: [VPS con Docker Compose](desplegar-vps.md) o [CapRover + Railway](desplegar-caprover-railway.md).

Los comandos de Docker Compose se lanzan desde la carpeta `deploy/` del proyecto.

## Parte 1 — Retención: cuánto se guarda

MCLog borra solo, **cada hora**, los logs más antiguos que `RETENTION_DAYS`. Lo hace en lotes pequeños para no bloquear la tabla ni frenar la ingesta.

1. Decide cuántos días necesitas consultar hacia atrás. 30 es un buen punto de partida; menos, si el disco es pequeño.
2. Cámbialo:
   - **VPS**: en `deploy/.env`, `RETENTION_DAYS=30`, y aplica con `docker compose -f docker-compose.prod.yml up -d`.
   - **CapRover**: en **App Configs** de `mclog-api`, y **Save & Update**.

> [!WARNING]
> `RETENTION_DAYS=0` **desactiva** el borrado: la tabla crece sin límite hasta llenar el disco.

**Ver cuánto ocupa** (VPS):

```bash
docker compose -f docker-compose.prod.yml exec db psql -U mclog -d mclog -c "\dt+"
```

**Borrar algo concreto** (por ejemplo, todo lo de una aplicación de pruebas): ver [el borrado manual](../../Back_MCLog/docs/USER_GUIDE.md#borrado-manual). Los datos del Lab se borran desde **Espacio → Lab → Borrar datos del lab**.

> [!NOTE]
> La retención y el borrado manual **no tocan los snapshots**: son copias con su propia caducidad. Uno creado con caducidad **Nunca** conserva sus logs hasta que alguien lo borre desde **Snapshots**. Los caducados se borran solos cada hora. Ver [Compartir un snapshot](compartir-snapshots.md).

## Parte 2 — Copias de seguridad

### En un VPS con Docker Compose

El servicio `backup` ya hace un `pg_dump` al arrancar y después cada 24 h, en `deploy/backups/`, y borra los de más de `BACKUP_RETENTION_DAYS` días (14 por defecto).

1. **Comprueba que hay copias**:

   ```bash
   ls -lh backups/
   ```

2. **Fuerza una ahora** (antes de actualizar, por ejemplo):

   ```bash
   docker compose -f docker-compose.prod.yml exec backup /scripts/backup.sh
   ```

3. **Sácalas del servidor.** Están en el mismo disco que la base: si pierdes el disco, las pierdes con él. Con `rclone` configurado hacia S3/Spaces:

   ```bash
   # crontab -e
   30 4 * * * rclone copy /ruta/a/mclog/deploy/backups remoto:mclog-backups
   ```

### En CapRover

CapRover no copia la base por su cuenta. Programa un volcado en el servidor:

```bash
# crontab -e
0 3 * * * docker exec $(docker ps -qf name=srv-captain--mclog-db) pg_dump -U mclog -Fc mclog > /var/backups/mclog_$(date +\%F).dump
```

y llévalo fuera del servidor como arriba.

## Parte 3 — Restaurar una copia

> [!CAUTION]
> Restaurar **sustituye** todos los datos actuales por los de la copia. Todo lo que llegó después de esa copia se pierde.

### En un VPS

1. Elige la copia: `ls backups/`.
2. Para la API, para que nadie escriba mientras restauras:

   ```bash
   docker compose -f docker-compose.prod.yml stop api
   ```

3. Restaura. El script pide confirmación: escribe `si` y pulsa Intro.

   ```bash
   docker compose -f docker-compose.prod.yml run --rm backup \
     /scripts/restore.sh /backups/mclog_2026-09-19_030000.dump
   ```

4. Arranca la API de nuevo:

   ```bash
   docker compose -f docker-compose.prod.yml start api
   ```

5. Comprueba `/health` y que en el dashboard ves los logs esperados.

### Practica la restauración

Una copia que nunca se ha restaurado no es una copia. De vez en cuando, restaura la última en un entorno aparte (otro servidor, o tu equipo con `docker compose up -d db` en `Back_MCLog`) y comprueba que tiene datos:

```bash
pg_restore -U postgres -d mclog --clean --if-exists --no-owner mclog_2026-09-19_030000.dump
```

## Parte 4 — Actualizar MCLog

Antes de cualquier actualización:

1. **Haz una copia** (parte 2), sobre todo si la versión trae migraciones de base de datos.
2. Lee los cambios de la versión en el repositorio.

### En un VPS

```bash
cd mclog
git pull
cd deploy
docker compose -f docker-compose.prod.yml up -d --build
```

Las migraciones pendientes se aplican solas al arrancar la API. Comprueba después `/health` y `docker compose -f docker-compose.prod.yml ps`.

### En CapRover + Railway

- **API**: `cd Back_MCLog && caprover deploy`. Las migraciones se aplican solas al arrancar.
- **Dashboard**: Railway redespliega con cada push a la rama conectada, o manualmente con **Redeploy**.

Actualiza primero la API y después el dashboard.

## Parte 5 — Revisiones periódicas

| Cada | Revisa |
|---|---|
| Semana | Que hay copias recientes fuera del servidor. El espacio en disco |
| Mes | **Espacio → API keys**: revoca las que llevan tiempo sin **Último uso** o ya no se necesitan. **Usuarios**: da de baja a quien ya no deba entrar, y comprueba que los admins tienen la etiqueta **2FA** |
| Trimestre | Restaura una copia en otro entorno. Actualiza a la última versión |

## Si algo falla

| Síntoma | Solución |
|---|---|
| `backups/` está vacío | Mira `docker compose -f docker-compose.prod.yml logs backup`. Un volcado vacío se descarta y conserva las copias anteriores |
| El disco se llena | Baja `RETENTION_DAYS` y `BACKUP_RETENTION_DAYS`; comprueba que no esté a `0` |
| Tras actualizar, la API no arranca | Mira sus logs. Si falla una migración, restaura la copia previa y abre un issue con el error |
| La restauración a mano falla con "role does not exist" | El usuario de la base del destino es distinto; añade `--no-owner` a `pg_restore` (el script `restore.sh` ya lo hace) |

## Siguiente paso

- [Administrar espacios, usuarios y claves](administrar-usuarios-y-claves.md).
- Referencia completa de despliegue: [DEPLOYMENT.md](../DEPLOYMENT.md).
