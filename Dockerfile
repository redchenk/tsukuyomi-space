FROM node:20.20.2-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:web && npm prune --omit=dev

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
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend ./backend
COPY --from=build /app/assets ./assets
COPY --from=build /app/dist ./dist
COPY --from=build /app/lib ./lib
COPY --from=build /app/models ./models
COPY --from=build /app/favicon.ico /app/live2d-core.js /app/site.webmanifest ./

RUN mkdir -p /data && chown -R node:node /app /data

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/server.js"]
