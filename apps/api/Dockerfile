# API GMAO — image de production (build context = racine du monorepo)
FROM node:20-slim AS base
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# manifestes workspace pour un cache d'install efficace
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN npm install --workspaces --include-workspace-root --no-audit --no-fund

# code
COPY packages/shared packages/shared
COPY apps/api apps/api

WORKDIR /app/apps/api
# client Prisma (schéma PostgreSQL par défaut)
RUN npx prisma generate

ENV NODE_ENV=production
EXPOSE 4000

# `web` = API REST + WebSocket ; `worker` = ingestion CouchDB → PostgreSQL
# Render/Railway : surcharger la commande par `npm run start:ingest` pour le worker.
CMD ["npm", "run", "start"]
