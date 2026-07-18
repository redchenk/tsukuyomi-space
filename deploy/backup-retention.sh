#!/usr/bin/env bash

prune_sqlite_backups() {
    local backup_dir="$1"
    local retention="${2:-10}"
    local entry backup_name index
    local removed=0
    local -a backups=()

    if ! [[ "$retention" =~ ^[1-9][0-9]*$ ]]; then
        echo "Backup retention must be a positive integer; got: $retention" >&2
        return 1
    fi
    [ -d "$backup_dir" ] || return 0

    while IFS= read -r -d '' entry; do
        backups+=("${entry#*|}")
    done < <(
        find "$backup_dir" -maxdepth 1 -type f -name 'tsukuyomi-*.db' \
            -printf '%T@|%f\0' | sort -z -t '|' -k1,1nr
    )

    for ((index = retention; index < ${#backups[@]}; index++)); do
        backup_name="${backups[$index]}"
        rm -f -- \
            "$backup_dir/$backup_name" \
            "$backup_dir/$backup_name-wal" \
            "$backup_dir/$backup_name-shm"
        ((removed += 1))
    done

    if ((removed > 0)); then
        echo "Pruned $removed SQLite backups from $backup_dir; retained the newest $retention."
    fi
}
