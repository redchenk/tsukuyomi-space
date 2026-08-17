#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/tsukuyomi-space}"
DATA_DIR="${DATA_DIR:-/var/lib/tsukuyomi-space}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/tsukuyomi-space/deploy}"
DATABASE_BACKUP_DIR="${DATABASE_BACKUP_DIR:-$DATA_DIR/backups}"
BACKUP_RETENTION="${BACKUP_RETENTION:-10}"
DISK_WARNING_PERCENT="${DISK_WARNING_PERCENT:-80}"
DISK_CRITICAL_PERCENT="${DISK_CRITICAL_PERCENT:-90}"

exec 9>/run/lock/tsukuyomi-maintenance.lock
flock -n 9 || exit 0

# shellcheck disable=SC1091
. "$APP_DIR/deploy/backup-retention.sh"

prune_archives() {
    local directory="$1"
    local retention="${2:-10}"
    local index
    local -a files=()

    [ -d "$directory" ] || return 0
    while IFS= read -r -d '' entry; do
        files+=("${entry#*|}")
    done < <(
        find "$directory" -maxdepth 1 -type f \
            \( -name '*.tar.gz' -o -name '*.tgz' -o -name '*.bundle' \) \
            -printf '%T@|%p\0' | sort -z -t '|' -k1,1nr
    )

    for ((index = retention; index < ${#files[@]}; index++)); do
        rm -f -- "${files[$index]}"
    done
}

prune_sqlite_backups "$BACKUP_DIR" "$BACKUP_RETENTION"
if [ "$DATABASE_BACKUP_DIR" != "$BACKUP_DIR" ]; then
    prune_sqlite_backups "$DATABASE_BACKUP_DIR" "$BACKUP_RETENTION"
fi
prune_archives /var/backups/tsukuyomi-space/frontend "$BACKUP_RETENTION"
prune_archives /var/backups/tsukuyomi-space/releases "$BACKUP_RETENTION"
prune_archives /var/backups/agent-os "$BACKUP_RETENTION"

find /tmp -maxdepth 1 -type f -name 'tsukuyomi-deployment-*.bundle' -mtime +2 -delete
find /tmp -maxdepth 1 -type d -name 'tsukuyomi-prebuilt-*' -mtime +2 -exec rm -rf -- {} +

if command -v logrotate >/dev/null 2>&1; then
    logrotate /etc/logrotate.d/tsukuyomi-docker-json
    logrotate /etc/logrotate.d/tsukuyomi-app
fi

if command -v journalctl >/dev/null 2>&1; then
    journalctl --vacuum-size=128M --vacuum-time=7d >/dev/null
fi

used_percent="$(df -P / | awk 'NR == 2 { gsub(/%/, "", $5); print $5 }')"
available_kb="$(df -Pk / | awk 'NR == 2 { print $4 }')"
if [ "$used_percent" -ge "$DISK_CRITICAL_PERCENT" ]; then
    logger -p daemon.crit -t tsukuyomi-maintenance \
        "Root disk critical: ${used_percent}% used, ${available_kb} KiB available"
    exit 1
fi
if [ "$used_percent" -ge "$DISK_WARNING_PERCENT" ]; then
    logger -p daemon.warning -t tsukuyomi-maintenance \
        "Root disk warning: ${used_percent}% used, ${available_kb} KiB available"
fi
