#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
check_only=0
detached=0
for arg in "$@"; do
  case "$arg" in
    -CheckOnly|--check-only) check_only=1 ;;
    -Detached|--detached) detached=1 ;;
  esac
done

if command -v wslpath >/dev/null 2>&1 && command -v powershell.exe >/dev/null 2>&1; then
  ps_script="$(wslpath -w "$script_dir/start-hermes-web.ps1")"
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$ps_script" "$@"
  exit $?
fi

node_bin="${NODE:-node}"
if ! command -v "$node_bin" >/dev/null 2>&1; then
  echo "Node.js was not found. Set NODE or install node." >&2
  exit 1
fi

server_js="$script_dir/server.js"
if [[ ! -f "$server_js" ]]; then
  echo "server.js was not found at $server_js" >&2
  exit 1
fi

if [[ "$check_only" == "1" ]]; then
  echo "Hermes Mobile startup check OK"
  echo "Repo root: $script_dir"
  echo "Server: $server_js"
  echo "Node: $(command -v "$node_bin")"
  echo "Bind: ${HERMES_WEB_HOST:-0.0.0.0}:${HERMES_WEB_PORT:-8797}"
  echo "Hermes API: ${HERMES_WEB_HERMES_API_BASE:-${HERMES_API_BASE:-http://127.0.0.1:8642}}"
  exit 0
fi

if [[ "$detached" == "1" ]]; then
  echo "-Detached is only supported by the Windows PowerShell launcher." >&2
  exit 2
fi

exec "$node_bin" "$server_js"
