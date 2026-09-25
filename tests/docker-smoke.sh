#!/usr/bin/env bash
set -euo pipefail

image="${1:?Pass the Docker image to test}"
name="tsukuyomi-smoke-$(date +%s)-$$"
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
# No production mounts or published ports. All mutable state is temporary.
docker run -d --name "$name" --read-only --cap-drop ALL \
    --security-opt no-new-privileges:true \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m \
    --tmpfs /data:rw,uid=1000,gid=1000,mode=750,size=64m \
    --tmpfs /app/assets/uploads:rw,uid=1000,gid=1000,mode=750,size=64m \
    -e JWT_SECRET=isolated-docker-smoke-secret-at-least-32-characters \
    -e ADMIN_PASSWORD=isolated-docker-smoke-admin \
    -e ROOM_WEATHER_OFFLINE=true "$image" >/dev/null
for _ in $(seq 1 30); do
    if [ "$(docker inspect --format '{{.State.Running}}' "$name")" != true ]; then
        docker logs --tail 60 "$name"
        exit 1
    fi
    if docker exec "$name" node -e '
        Promise.all(["/api/health", "/api/articles", "/"].map(async path => {
            const r = await fetch("http://127.0.0.1:3000" + path);
            if (!r.ok) throw new Error(path + ": " + r.status);
        })).then(() => process.exit(0)).catch(() => process.exit(1));
    '; then
        echo "Docker runtime smoke test passed."
        exit 0
    fi
    sleep 2
done
docker logs --tail 60 "$name"
exit 1
