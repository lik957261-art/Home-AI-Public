#!/usr/bin/env bash
set -euo pipefail

QA_ROOT="${HOME}/.homeai-qa"
NODE_BIN="${QA_ROOT}/node-current/bin"
APPIUM_BIN="${QA_ROOT}/appium-global/bin"
PORT="${APPIUM_PORT:-4723}"
ADDRESS="${APPIUM_ADDRESS:-127.0.0.1}"
LOG_DIR="${QA_ROOT}/logs"
PID_FILE="${QA_ROOT}/appium-${PORT}.pid"
LOG_FILE="${LOG_DIR}/appium-${PORT}.log"

export PATH="${NODE_BIN}:${APPIUM_BIN}:${PATH}"

mkdir -p "${LOG_DIR}"

if curl -fsS "http://${ADDRESS}:${PORT}/status" >/dev/null 2>&1; then
  printf '{"ok":true,"alreadyRunning":true,"url":"http://%s:%s"}\n' "${ADDRESS}" "${PORT}"
  exit 0
fi

if [ -f "${PID_FILE}" ]; then
  kill "$(cat "${PID_FILE}")" 2>/dev/null || true
fi

nohup bash -c 'trap "" INT; exec appium server "$@"' _ \
  --address "${ADDRESS}" \
  --port "${PORT}" \
  --log-level warn \
  > "${LOG_FILE}" 2>&1 &

printf '%s\n' "$!" > "${PID_FILE}"

for _ in $(seq 1 30); do
  if curl -fsS "http://${ADDRESS}:${PORT}/status" >/dev/null 2>&1; then
    printf '{"ok":true,"pid":%s,"url":"http://%s:%s","log":"%s"}\n' "$(cat "${PID_FILE}")" "${ADDRESS}" "${PORT}" "${LOG_FILE}"
    exit 0
  fi
  sleep 1
done

printf '{"ok":false,"error":"appium_status_timeout","log":"%s"}\n' "${LOG_FILE}" >&2
exit 1
