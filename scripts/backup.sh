#!/usr/bin/env bash
# Daily backup of the data and runtime folders. Keeps the newest 14 archives.
# Usage: scripts/backup.sh [project dir] [backup dir]
# Reads DATA_DIR and DATA_RUNTIME_DIR from .env when it exists. Copy the archives off the VM too.
set -euo pipefail

APP_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKUP_DIR="${2:-/var/backups/cheapcart}"
KEEP="${BACKUP_KEEP:-14}"

if [ -f "$APP_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$APP_DIR/.env"
  set +a
fi

DATA="${DATA_DIR:-data/sample}"
RUNTIME="${DATA_RUNTIME_DIR:-data/runtime}"
case "$DATA" in /*) ;; *) DATA="$APP_DIR/$DATA" ;; esac
case "$RUNTIME" in /*) ;; *) RUNTIME="$APP_DIR/$RUNTIME" ;; esac

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/cheapcart-$STAMP.tar.gz"

# Stage the folders under fixed names (data, runtime, config) so an archive
# can be restored on any machine, whatever the original paths were.
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
found=0
for pair in "data:$DATA" "runtime:$RUNTIME" "config:$APP_DIR/config"; do
  name="${pair%%:*}"
  src="${pair#*:}"
  if [ -e "$src" ]; then
    cp -R "$src" "$STAGE/$name"
    found=1
  fi
done
if [ "$found" -eq 0 ]; then
  echo "Nothing to back up." >&2
  exit 1
fi

tar -czf "$OUT" -C "$STAGE" .
echo "Backup written: $OUT"

# Drop the oldest archives beyond KEEP.
ls -1t "$BACKUP_DIR"/cheapcart-*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f "$old"
done
