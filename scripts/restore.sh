#!/usr/bin/env bash
# Restore a backup made by scripts/backup.sh.
# Usage: scripts/restore.sh <archive> [project dir]
# Stop the app first. The current data and runtime folders are kept next to
# the originals with a .before-restore-<time> suffix, nothing is deleted.
# Config is not touched, it lives in git.
set -euo pipefail

ARCHIVE="${1:-}"
APP_DIR="${2:-$(cd "$(dirname "$0")/.." && pwd)}"
if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "Usage: scripts/restore.sh <archive> [project dir]" >&2
  exit 1
fi

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

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
tar -xzf "$ARCHIVE" -C "$STAGE"

STAMP="$(date +%Y%m%d-%H%M%S)"
for pair in "data:$DATA" "runtime:$RUNTIME"; do
  name="${pair%%:*}"
  dest="${pair#*:}"
  [ -d "$STAGE/$name" ] || continue
  if [ -e "$dest" ]; then
    mv "$dest" "$dest.before-restore-$STAMP"
  fi
  mkdir -p "$(dirname "$dest")"
  cp -R "$STAGE/$name" "$dest"
  echo "Restored $name into $dest"
done
echo "Done. Start the app again and check /api/health."
