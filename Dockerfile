FROM node:20.20.2-bookworm-slim AS deps

WORKDIR /app

# Native SQLite must also build when a prebuilt binary is unavailable.
# These tools stay in the dependency stage; the runtime uses the slim base.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV npm_config_jobs=1

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM deps AS prod-deps

RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:20.20.2-bookworm-slim AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json vite.config.js vite.frontend.config.js ./
COPY backend ./backend
COPY shared ./shared
COPY scripts ./scripts
COPY src ./src
COPY assets ./assets
COPY lib ./lib
COPY live2d-studio ./live2d-studio
COPY favicon.ico live2d-core.js site.webmanifest ./

RUN npm run build:web && npm run build:live2d-studio

FROM node:20.20.2-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    TRUST_PROXY=true \
    ENABLE_FRONTEND_DIST=true \
    DATA_DIR=/data \
    DB_PATH=/data/tsukuyomi.db

WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/backend ./backend
COPY --from=build /app/shared ./shared
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/assets ./assets
COPY --from=build /app/dist ./dist
COPY --from=build /app/lib ./lib
COPY --from=build /app/favicon.ico /app/live2d-core.js /app/site.webmanifest ./

RUN mkdir -p /data /app/assets/uploads /app/assets/music /app/assets/video /app/assets/audio /app/models \
    && chown -R root:root /app \
    && chown -R node:node /data /app/assets/uploads \
    && chmod 750 /data /app/assets/uploads \
    && find /app -path /app/assets/uploads -prune -o -type d -exec chmod 755 {} + \
    && find /app -path /app/assets/uploads -prune -o -type f -exec chmod a+r,go-w {} +

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/server.js"]
