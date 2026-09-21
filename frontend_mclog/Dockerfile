# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Sin NEXT_PUBLIC_API_URL, la base de la API queda vacia y el dashboard llama
# a su mismo origen. Es lo correcto detras de Caddy, que sirve el frontend y la
# API bajo el mismo dominio. Para un despliegue con dominios separados, pasar
# --build-arg NEXT_PUBLIC_API_URL=https://api.ejemplo.com
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Runtime stage
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0

# output: "standalone" deja en .next/standalone un servidor autonomo con solo
# las dependencias que realmente usa.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider "http://127.0.0.1:${PORT:-3001}/" || exit 1

# PORT se resuelve al arrancar, no al construir: Railway lo inyecta y compose no,
# donde cae al 3001 que espera Caddy.
CMD ["sh", "-c", "PORT=${PORT:-3001} node server.js"]
