#!/bin/sh
set -eu

RUNTIME_DIR="${HERMES_MOBILE_RUNTIME_DIR:-/volume1/docker/hermes-mobile/runtime}"
PID_FILE="$RUNTIME_DIR/hermes-cron-tick.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "Hermes cron tick is not running"
  exit 0
fi

pid=$(cat "$PID_FILE" 2>/dev/null || true)
if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
  kill "$pid" || true
  for _ in 1 2 3 4 5; do
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" || true
  fi
fi

rm -f "$PID_FILE"
echo "Hermes cron tick stopped"
