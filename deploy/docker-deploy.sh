#!/usr/bin/env bash
set -euo pipefail

SERVICE="${TSUKUYOMI_SERVICE:-tsukuyomi-space}"
COMPOSE_FILES=(-f docker-compose.yml)

if [[ -f docker-compose.resources.yml ]]; then
  COMPOSE_FILES+=(-f docker-compose.resources.yml)
fi

if [[ ! -f .env.docker ]]; then
  echo ".env.docker is missing. Copy .env.docker.example and fill production secrets first." >&2
  exit 1
fi

if docker compose "${COMPOSE_FILES[@]}" ps --status running --services | grep -qx "$SERVICE"; then
  echo "Creating SQLite backup before deploy..."
  bash deploy/docker-backup.sh
fi

BUILD_ARGS=()
if [[ "${PULL_BASE_IMAGES:-false}" == "true" ]]; then
  BUILD_ARGS+=(--pull)
fi

docker compose "${COMPOSE_FILES[@]}" build "${BUILD_ARGS[@]}"
docker compose "${COMPOSE_FILES[@]}" up -d --remove-orphans
docker compose "${COMPOSE_FILES[@]}" ps "$SERVICE"

echo "Waiting for health check..."
for _ in $(seq 1 30); do
  status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$SERVICE" 2>/dev/null || true)"
  if [[ "$status" == "healthy" ]]; then
    echo "Deploy complete: $SERVICE is healthy."
    exit 0
  fi
  sleep 2
done

docker compose "${COMPOSE_FILES[@]}" logs --tail=80 "$SERVICE"
echo "Deploy finished, but health check did not become healthy in time." >&2
exit 1
