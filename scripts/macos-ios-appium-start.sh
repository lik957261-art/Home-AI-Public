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
LABEL="com.hermesmobile.appium-${PORT}"
LAUNCH_AGENT_DIR="${HOME}/Library/LaunchAgents"
PLIST_FILE="${LAUNCH_AGENT_DIR}/${LABEL}.plist"
LAUNCH_DOMAIN="gui/$(id -u)"

export PATH="${NODE_BIN}:${APPIUM_BIN}:${PATH}"

mkdir -p "${LOG_DIR}"

if curl -fsS "http://${ADDRESS}:${PORT}/status" >/dev/null 2>&1; then
  printf '{"ok":true,"alreadyRunning":true,"url":"http://%s:%s"}\n' "${ADDRESS}" "${PORT}"
  exit 0
fi

if [ -f "${PID_FILE}" ]; then
  kill "$(cat "${PID_FILE}")" 2>/dev/null || true
fi

xml_escape() {
  printf '%s' "$1" \
    | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g'
}

mkdir -p "${LAUNCH_AGENT_DIR}"
launchctl bootout "${LAUNCH_DOMAIN}/${LABEL}" >/dev/null 2>&1 || true
cat > "${PLIST_FILE}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$(xml_escape "${LABEL}")</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(xml_escape "${APPIUM_BIN}/appium")</string>
    <string>server</string>
    <string>--address</string>
    <string>$(xml_escape "${ADDRESS}")</string>
    <string>--port</string>
    <string>$(xml_escape "${PORT}")</string>
    <string>--log-level</string>
    <string>warn</string>
    <string>--session-override</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>$(xml_escape "${HOME}")</string>
    <key>PATH</key>
    <string>$(xml_escape "${PATH}")</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$(xml_escape "${LOG_FILE}")</string>
  <key>StandardErrorPath</key>
  <string>$(xml_escape "${LOG_FILE}")</string>
</dict>
</plist>
PLIST

launchctl bootstrap "${LAUNCH_DOMAIN}" "${PLIST_FILE}" >/dev/null
launchctl kickstart -k "${LAUNCH_DOMAIN}/${LABEL}" >/dev/null 2>&1 || true

appium_pid_alive() {
  launchctl print "${LAUNCH_DOMAIN}/${LABEL}" >/dev/null 2>&1
}

for _ in $(seq 1 30); do
  if ! appium_pid_alive; then
    printf '{"ok":false,"error":"appium_process_exited","log":"%s"}\n' "${LOG_FILE}" >&2
    exit 1
  fi
  if curl -fsS "http://${ADDRESS}:${PORT}/status" >/dev/null 2>&1; then
    sleep 1
    if ! appium_pid_alive; then
      printf '{"ok":false,"error":"appium_process_exited_after_status","log":"%s"}\n' "${LOG_FILE}" >&2
      exit 1
    fi
    if ! curl -fsS "http://${ADDRESS}:${PORT}/status" >/dev/null 2>&1; then
      printf '{"ok":false,"error":"appium_status_unstable","log":"%s"}\n' "${LOG_FILE}" >&2
      exit 1
    fi
    pid="$(lsof -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
    [ -n "${pid}" ] && printf '%s\n' "${pid}" > "${PID_FILE}"
    printf '{"ok":true,"pid":%s,"label":"%s","url":"http://%s:%s","log":"%s"}\n' "${pid:-0}" "${LABEL}" "${ADDRESS}" "${PORT}" "${LOG_FILE}"
    exit 0
  fi
  sleep 1
done

printf '{"ok":false,"error":"appium_status_timeout","log":"%s"}\n' "${LOG_FILE}" >&2
exit 1
