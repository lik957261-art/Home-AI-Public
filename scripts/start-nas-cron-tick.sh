#!/bin/sh
set -eu

RUNTIME_DIR="${HERMES_MOBILE_RUNTIME_DIR:-/volume1/docker/hermes-mobile/runtime}"
APP_DIR="${HERMES_MOBILE_APP_DIR:-/volume1/docker/hermes-mobile/app}"
HERMES_AGENT_ROOT="${HERMES_AGENT_ROOT:-/volume1/docker/hermes-agent/current}"
PID_FILE="$RUNTIME_DIR/hermes-cron-tick.pid"
LOG_FILE="$RUNTIME_DIR/hermes-cron-tick.log"
INTERVAL_SECONDS="${HERMES_MOBILE_CRON_TICK_INTERVAL_SECONDS:-60}"
DISPATCH_TIMEOUT_SECONDS="${HERMES_MOBILE_CRON_DISPATCH_TIMEOUT_SECONDS:-90}"

mkdir -p "$RUNTIME_DIR" "$HOME/.hermes/cron"

if [ -f "$PID_FILE" ]; then
  old_pid=$(cat "$PID_FILE" 2>/dev/null || true)
  if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
    echo "Hermes cron tick already running: $old_pid"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

(
  trap 'exit 0' INT TERM
  cd "$APP_DIR"
  export HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
  export PYTHONPATH="$HERMES_AGENT_ROOT${PYTHONPATH:+:$PYTHONPATH}"
  export HERMES_MOBILE_CRON_TICK_SIDE="nas"
  while true; do
    printf '%s dispatch start\n' "$(date -Is)" >> "$LOG_FILE"
    if command -v timeout >/dev/null 2>&1; then
      timeout "$DISPATCH_TIMEOUT_SECONDS" "$HERMES_AGENT_ROOT/venv/bin/python" scripts/hermes-mobile-cron-dispatcher.py --dispatch >> "$LOG_FILE" 2>&1 || true
    else
      "$HERMES_AGENT_ROOT/venv/bin/python" scripts/hermes-mobile-cron-dispatcher.py --dispatch >> "$LOG_FILE" 2>&1 || true
    fi
    printf '%s dispatch end\n' "$(date -Is)" >> "$LOG_FILE"
    sleep "$INTERVAL_SECONDS"
  done
) >/dev/null 2>&1 &

bg_pid=$!
echo "$bg_pid" > "$PID_FILE"
echo "Hermes cron tick started: $bg_pid"
