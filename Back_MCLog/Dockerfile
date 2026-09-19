# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

RUN npm ci
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

# Runtime stage
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist

# El logger escribe en logs/app.log: el directorio debe pertenecer al usuario
# sin privilegios con el que corre el proceso.
RUN mkdir -p logs && chown -R node:node /app

# Nunca como root: una ejecucion remota de codigo queda acotada a este usuario.
USER node

EXPOSE 3000

# /health comprueba tambien la base de datos, asi que un contenedor que no la
# alcanza se marca unhealthy y el orquestador puede sacarlo de rotacion.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/health || exit 1

CMD ["node", "dist/index.js"]
