#!/usr/bin/env bash
set -euo pipefail

# Bound preparation and every Git child in one cgroup. If limits cannot be
# installed, fail before touching the active release instead of running unbounded.
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec systemd-run --scope --quiet \
    --property=MemoryHigh=384M --property=MemoryMax=512M \
    --property=MemorySwapMax=128M --property=CPUQuota=100% \
    --property=TasksMax=64 \
    timeout --kill-after=10s 300s nice -n 10 \
    python3 "$script_dir/safe-release.py" prepare "$@"
