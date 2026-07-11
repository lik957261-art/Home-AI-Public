#!/usr/bin/env bash
set -euo pipefail

ROOT="${HERMES_MOBILE_ROOT:-/Users/example/HermesMobile}"
APP_DIR="${HERMES_MOBILE_APP_DIR:-${ROOT%/}/app}"
NODE="${HERMES_MOBILE_NODE_EXE:-${ROOT%/}/runtime/node-current/bin/node}"
STATE_FILE="${HOMEAI_PLUGIN_DAILY_ROLLUP_STATE_FILE:-${ROOT%/}/data/hermes-home/plugin-daily-progress-rollup/state.json}"

if [[ ! -x "$NODE" ]]; then
  echo '{"ok":false,"error":"plugin_daily_rollup_node_missing"}'
  exit 1
fi

if [[ ! -f "${APP_DIR}/scripts/plugin-daily-progress-rollup.js" ]]; then
  echo '{"ok":false,"error":"plugin_daily_rollup_script_missing"}'
  exit 1
fi

cd "$APP_DIR"
exec "$NODE" "${APP_DIR}/scripts/plugin-daily-progress-rollup.js" \
  --trigger \
  --trigger-source scheduled \
  --state-file "$STATE_FILE" \
  --json
