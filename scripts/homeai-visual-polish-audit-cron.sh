#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
APP_DIR="${HERMES_MOBILE_APP_DIR:-$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)}"
ROOT="${HERMES_MOBILE_ROOT:-$(CDPATH= cd -- "${APP_DIR}/.." && pwd)}"
NODE="${HERMES_MOBILE_NODE_EXE:-$ROOT/runtime/node-current/bin/node}"
SCRIPT_NAME="$(basename "$0")"
JOB_KEY="${HOMEAI_VISUAL_AUDIT_JOB_KEY:-}"

if [ -z "$JOB_KEY" ]; then
  case "$SCRIPT_NAME" in
    *host*) JOB_KEY="host" ;;
    *music*) JOB_KEY="music" ;;
    *finance*) JOB_KEY="finance" ;;
    *wardrobe*) JOB_KEY="wardrobe" ;;
    *global*) JOB_KEY="global-interactions" ;;
    *core*) JOB_KEY="core-plugins" ;;
    *) JOB_KEY="host" ;;
  esac
fi

CONFIG_FILE="${HOMEAI_VISUAL_AUDIT_CONFIG_FILE:-$ROOT/data/visual-polish-task-cards.json}"

cd "$APP_DIR"
exec "$NODE" "$APP_DIR/scripts/visual-polish-audit-runner.js" --config-file "$CONFIG_FILE" --job-key "$JOB_KEY" "$@"
