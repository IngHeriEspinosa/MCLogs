#!/bin/sh
set -eu

# CapRover no permite sobreescribir el comando de arranque, asi que las
# migraciones se aplican aqui: un contenedor nuevo nunca arranca contra un
# esquema desactualizado.
npx prisma migrate deploy

exec node dist/index.js
