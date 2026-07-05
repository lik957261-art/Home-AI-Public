#!/bin/sh
set -eu

ROOT="${HERMES_MOBILE_ROOT:-/Users/example/path}"
APP_DIR="${HERMES_MOBILE_APP_DIR:-$ROOT/app}"
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
