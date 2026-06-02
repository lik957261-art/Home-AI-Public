#!/bin/sh
set -eu

RUNTIME_DIR="${HERMES_MOBILE_RUNTIME_DIR:-/volume1/docker/hermes-mobile/runtime}"
APP_DIR="${HERMES_MOBILE_APP_DIR:-/volume1/docker/hermes-mobile/app}"
DATA_DIR="${HERMES_WEB_DATA_DIR:-${HERMES_MOBILE_DATA_DIR:-/volume1/docker/hermes-mobile/data}}"
RUNTIME_CONFIG_PATH="${HERMES_MOBILE_RUNTIME_CONFIG_PATH:-${HERMES_WEB_RUNTIME_CONFIG_PATH:-$DATA_DIR/runtime-config.json}}"
HERMES_AGENT_ROOT="${HERMES_AGENT_ROOT:-/volume1/docker/hermes-agent/current}"
PID_FILE="$RUNTIME_DIR/hermes-cron-tick.pid"
LOG_FILE="$RUNTIME_DIR/hermes-cron-tick.log"
INTERVAL_SECONDS="${HERMES_MOBILE_CRON_TICK_INTERVAL_SECONDS:-60}"
DISPATCH_TIMEOUT_SECONDS="${HERMES_MOBILE_CRON_DISPATCH_TIMEOUT_SECONDS:-90}"
DEFAULT_OPENAI_CODEX_MODEL="${HERMES_MOBILE_DEFAULT_OPENAI_CODEX_MODEL:-${HERMES_WEB_DEFAULT_OPENAI_CODEX_MODEL:-gpt-5.5}}"
DEFAULT_REASONING_EFFORT="${HERMES_MOBILE_DEFAULT_REASONING_EFFORT:-${HERMES_WEB_DEFAULT_REASONING_EFFORT:-medium}}"
TOKEN_USAGE_REPORT_ROOT_DEFAULT="$DATA_DIR/drive/users/owner/Hermes-徐欣/交付/Token消耗日报"

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
  export API_SERVER_MODEL_NAME="${API_SERVER_MODEL_NAME:-$DEFAULT_OPENAI_CODEX_MODEL}"
  export HERMES_GATEWAY_POOL_MANIFEST_PATH="${HERMES_GATEWAY_POOL_MANIFEST_PATH:-$DATA_DIR/gateway-pool-manifest.json}"
  export HERMES_GATEWAY_TELEMETRY_ROOT="${HERMES_GATEWAY_TELEMETRY_ROOT:-/volume1/docker/hermes-mobile/gateway-worker/profiles}"
  export HERMES_TOKEN_USAGE_REPORT_ROOT="${HERMES_TOKEN_USAGE_REPORT_ROOT:-$TOKEN_USAGE_REPORT_ROOT_DEFAULT}"
  mkdir -p "$HERMES_HOME/scripts"
  if [ -f "$APP_DIR/scripts/gateway-token-usage-daily-report.py" ]; then
    cp "$APP_DIR/scripts/gateway-token-usage-daily-report.py" "$HERMES_HOME/scripts/hermes-mobile-token-usage-daily.py"
    chmod +x "$HERMES_HOME/scripts/hermes-mobile-token-usage-daily.py" 2>/dev/null || true
  fi
  "$HERMES_AGENT_ROOT/venv/bin/python" - "$HERMES_HOME/config.yaml" "$RUNTIME_CONFIG_PATH" "$DEFAULT_OPENAI_CODEX_MODEL" "$DEFAULT_REASONING_EFFORT" >> "$LOG_FILE" 2>&1 <<'PY' || true
import json
import re
import sys
from pathlib import Path

config_path = Path(sys.argv[1]).expanduser()
runtime_path = Path(sys.argv[2])
default_model = sys.argv[3] or "gpt-5.5"
default_effort = sys.argv[4] or "medium"
try:
    runtime = json.loads(runtime_path.read_text(encoding="utf-8")) if runtime_path.exists() else {}
    model = str(runtime.get("defaultModel") or default_model).strip() or default_model
    effort = str(runtime.get("defaultReasoningEffort") or default_effort).strip().lower() or default_effort
    text = config_path.read_text(encoding="utf-8")
    text = re.sub(r"(?m)^(\s*default:\s*).*$", rf"\1{model}", text, count=1)
    if re.search(r"(?m)^\s*reasoning_effort:\s*", text):
        text = re.sub(r"(?m)^(\s*reasoning_effort:\s*).*$", rf"\1{effort}", text, count=1)
    elif re.search(r"(?m)^agent:\s*$", text):
        text = re.sub(r"(?m)^agent:\s*$", f"agent:\n  reasoning_effort: {effort}", text, count=1)
    else:
        text = text.rstrip() + f"\n\nagent:\n  reasoning_effort: {effort}\n"
    config_path.write_text(text if text.endswith("\n") else text + "\n", encoding="utf-8")
    print(f"mobile cron tick: synced runtime model default {model} / {effort}")
except Exception as exc:
    print(f"mobile cron tick: model default sync skipped: {exc}")
PY
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
