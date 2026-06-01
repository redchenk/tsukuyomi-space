#!/usr/bin/env bash
set -euo pipefail

SERVICE="${TSUKUYOMI_SERVICE:-tsukuyomi-space}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DB_PATH="${DB_PATH:-/data/tsukuyomi.db}"

mkdir -p "$BACKUP_DIR"

backup_path="$(
docker compose exec -T "$SERVICE" node - "$DB_PATH" <<'NODE'
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.argv[2] || '/data/tsukuyomi.db';
const backupDir = '/data/backups';
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const target = path.join(backupDir, `tsukuyomi-${stamp}.db`);
const db = new Database(dbPath);
db.backup(target)
  .then(() => {
    db.close();
    console.log(target);
  })
  .catch((error) => {
    db.close();
    console.error(error);
    process.exit(1);
  });
NODE
)"

backup_path="$(printf '%s\n' "$backup_path" | tail -n 1 | tr -d '\r')"
docker compose cp "$SERVICE:$backup_path" "$BACKUP_DIR/"

echo "Backup copied to ${BACKUP_DIR}/$(basename "$backup_path")"
