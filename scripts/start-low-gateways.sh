#!/usr/bin/env bash
set -euo pipefail

worker_user="${HERMES_LOW_GATEWAY_USER:-hermes}"
worker_home="/home/$worker_user"
worker_home_dir="$worker_home/.hermes"
gateway_worker_root="${HERMES_GATEWAY_WORKER_ROOT:-/mnt/c/ProgramData/HermesMobile/gateway-worker}"
gateway_pool_manifest_path="${HERMES_GATEWAY_POOL_MANIFEST_PATH:-/mnt/c/ProgramData/HermesMobile/data/gateway-pool-manifest.json}"
configure_low_gateway_script="${HERMES_LOW_GATEWAY_CONFIGURE_SCRIPT:-$gateway_worker_root/configure-low-gateways.sh}"
runtime_root="${HERMES_GATEWAY_RUNTIME_ROOT:-/opt/hermes-gateway-runtime}"
runtime_python="${HERMES_GATEWAY_RUNTIME_PYTHON:-$runtime_root/venv/bin/python}"
runtime_source="${HERMES_GATEWAY_RUNTIME_SOURCE:-$runtime_root/official-clean}"
runtime_bin="${HERMES_GATEWAY_RUNTIME_BIN:-$runtime_root/bin}"
manifest_low_gateway_count() {
  python3 - "$gateway_pool_manifest_path" <<'PY' 2>/dev/null || echo 10
import json, re, sys
try:
    data = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    print(10)
    raise SystemExit(0)
count = 0
for worker in data.get("workers") or []:
    text = str(worker.get("profile") or worker.get("name") or "")
    match = re.match(r"^lowgw(\d+)$", text, re.I)
    if match:
        count = max(count, int(match.group(1)))
print(count or 10)
PY
}
low_gateway_count="${HERMES_LOW_GATEWAY_COUNT:-$(manifest_low_gateway_count)}"
grok_gateway_count="${HERMES_GROK_GATEWAY_COUNT:-1}"
low_gateway_base_port="${HERMES_LOW_GATEWAY_BASE_PORT:-18750}"
grok_gateway_base_port="${HERMES_GROK_GATEWAY_BASE_PORT:-$((low_gateway_base_port + low_gateway_count))}"

detect_windows_host_gateway() {
  ip route 2>/dev/null | awk '/^default[[:space:]]/ { print $3; exit }'
}

default_mobile_bridge_host_url="http://127.0.0.1:8798"
windows_host_gateway="$(detect_windows_host_gateway || true)"
if [ -n "$windows_host_gateway" ]; then
  default_mobile_bridge_host_url="http://${windows_host_gateway}:8798"
fi
mobile_bridge_host_url="${HERMES_MOBILE_BRIDGE_HOST_URL:-${HERMES_WEB_BRIDGE_HOST_URL:-$default_mobile_bridge_host_url}}"
mobile_bridge_key_path="${HERMES_MOBILE_BRIDGE_HOST_KEY_PATH:-${HERMES_WEB_BRIDGE_HOST_KEY_PATH:-/mnt/c/ProgramData/HermesMobile/data/secrets/bridge-host.secret}}"
x_search_proxy_url="${HERMES_MOBILE_X_SEARCH_PROXY_URL:-http://127.0.0.1:$((grok_gateway_base_port + 1))}"

if ! id -u "$worker_user" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$worker_user"
fi

if [ ! -f "$configure_low_gateway_script" ]; then
  echo "missing low gateway configure script: $configure_low_gateway_script" >&2
  exit 1
fi
if [ ! -x "$runtime_python" ]; then
  echo "missing official Hermes runtime python: $runtime_python" >&2
  exit 1
fi
if [ ! -d "$runtime_source" ]; then
  echo "missing official Hermes runtime source: $runtime_source" >&2
  exit 1
fi

bash "$configure_low_gateway_script"

install -d -m 755 "$runtime_bin"
cat > "$runtime_bin/hermes" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export PYTHONPATH="$runtime_source\${PYTHONPATH:+:\$PYTHONPATH}"
exec "$runtime_python" -m hermes_cli.main "\$@"
EOF
chmod 755 "$runtime_bin/hermes"

low_gateway_path="$runtime_bin:$runtime_root/venv/bin:/usr/local/bin:/usr/bin:/bin"
runtime_hermes="$runtime_bin/hermes"
api_key_file="$worker_home_dir/api-server-key.secret"
if [ ! -s "$api_key_file" ]; then
  echo "missing low gateway API key file: $api_key_file" >&2
  exit 1
fi

repair_gateway_profile_link() {
  local profile="$1"
  local profile_link="$worker_home_dir/profiles/$profile"
  local expected_target="$gateway_worker_root/telemetry/profiles/$profile"
  if [ -L "$profile_link" ]; then
    return 0
  fi
  if [ -e "$profile_link" ]; then
    local stamp
    local backup_root
    local backup_path
    stamp="$(date +%Y%m%d-%H%M%S)"
    backup_root="$worker_home_dir/profile-directory-backups"
    backup_path="${backup_root}/${profile}-start-repair-${stamp}"
    install -d -m 700 -o "$worker_user" -g "$worker_user" "$backup_root"
    echo "WARNING: moving real low Gateway profile directory for ${profile} to ${backup_path}" >&2
    mv "$profile_link" "$backup_path"
  fi
  ln -sfn "$expected_target" "$profile_link"
  chown -h "$worker_user:$worker_user" "$profile_link" || true
}

verify_gateway_profile() {
  local profile="$1"
  local profile_link="$worker_home_dir/profiles/$profile"
  local expected_target="$gateway_worker_root/telemetry/profiles/$profile"
  local resolved_profile=""
  local resolved_expected=""

  repair_gateway_profile_link "$profile"
  if [ ! -L "$profile_link" ]; then
    echo "low gateway profile is not a symlink: $profile_link" >&2
    exit 1
  fi
  if [ ! -d "$expected_target" ]; then
    echo "missing low gateway telemetry profile: $expected_target" >&2
    exit 1
  fi
  resolved_profile="$(readlink -f "$profile_link" || true)"
  resolved_expected="$(readlink -f "$expected_target" || true)"
  if [ -z "$resolved_profile" ] || [ -z "$resolved_expected" ] || [ "$resolved_profile" != "$resolved_expected" ]; then
    echo "low gateway profile target mismatch: $profile_link -> $resolved_profile, expected $resolved_expected" >&2
    exit 1
  fi
  if [ ! -s "$profile_link/config.yaml" ]; then
    echo "missing low gateway profile config: $profile_link/config.yaml" >&2
    exit 1
  fi
  if [ ! -L "$profile_link/auth.json" ] || [ ! -s "$profile_link/auth.json" ]; then
    echo "missing shared auth link for low gateway profile: $profile_link/auth.json" >&2
    exit 1
  fi
  if [ ! -L "$profile_link/auth.lock" ]; then
    echo "missing shared auth lock link for low gateway profile: $profile_link/auth.lock" >&2
    exit 1
  fi
}

install -d -m 700 -o "$worker_user" -g "$worker_user" "$worker_home_dir/logs"

stop_gateway_port() {
  local port="$1"
  local pids=""
  pids="$(ss -ltnp "sport = :${port}" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u | tr '\n' ' ' | xargs || true)"
  if [ -z "$pids" ]; then
    return 0
  fi
  echo "Stopping existing low Gateway listener on port ${port}: ${pids}" >&2
  kill $pids 2>/dev/null || true
  for _ in $(seq 1 20); do
    if ! ss -ltn "sport = :${port}" 2>/dev/null | grep -q ":${port}"; then
      return 0
    fi
    sleep 0.25
  done
  kill -9 $pids 2>/dev/null || true
}

start_gateway_profile() {
  local profile="$1"
  local port="$2"
  local disable_x_search_proxy_tool="0"
  if [[ "$profile" == grokgw* ]]; then
    disable_x_search_proxy_tool="1"
  fi
  log="$worker_home_dir/logs/${profile}-gateway-${port}.log"
  pidfile="$worker_home_dir/${profile}-gateway-${port}.pid"
  api_key="$(tr -d '\r\n' < "$api_key_file")"
  stop_gateway_port "$port"
  rm -f "$pidfile"
  runuser -u "$worker_user" -- setsid -f env \
    HOME="$worker_home" \
    HERMES_HOME="$worker_home_dir/profiles/$profile" \
    PYTHONPATH="$runtime_source" \
    HERMES_PROFILE="$profile" \
    HERMES_GOOGLE_PROFILE_HOME="$worker_home_dir/profiles/$profile" \
    PATH="$low_gateway_path" \
    HERMES_ACCEPT_HOOKS=1 \
    HERMES_MOBILE_BRIDGE_HOST_URL="$mobile_bridge_host_url" \
    HERMES_WEB_BRIDGE_HOST_URL="$mobile_bridge_host_url" \
    HERMES_MOBILE_BRIDGE_HOST_KEY_PATH="$mobile_bridge_key_path" \
    HERMES_WEB_BRIDGE_HOST_KEY_PATH="$mobile_bridge_key_path" \
    HERMES_MOBILE_X_SEARCH_PROXY_URL="$x_search_proxy_url" \
    HERMES_MOBILE_DISABLE_X_SEARCH_PROXY_TOOL="$disable_x_search_proxy_tool" \
    HERMES_KANBAN_DISPATCH_IN_GATEWAY=0 \
    API_SERVER_KEY="$api_key" \
    "$runtime_hermes" gateway run --replace --accept-hooks > "$log" 2>&1 < /dev/null
  sleep 0.2
  pgrep -u "$worker_user" -f "hermes_cli.main .*gateway run --replace --accept-hooks" | tail -1 > "$pidfile" || true
}

for idx in $(seq 1 "$low_gateway_count"); do
  verify_gateway_profile "lowgw${idx}"
  start_gateway_profile "lowgw${idx}" $((low_gateway_base_port + idx))
done

if [ "$grok_gateway_count" -gt 0 ]; then
  for idx in $(seq 1 "$grok_gateway_count"); do
    verify_gateway_profile "grokgw${idx}"
    start_gateway_profile "grokgw${idx}" $((grok_gateway_base_port + idx))
  done
fi

wait_gateway_port() {
  local port="$1"
  ok=0
  for _ in $(seq 1 80); do
    if "$runtime_python" - <<PY >/dev/null 2>&1
import urllib.request
urllib.request.urlopen("http://127.0.0.1:${port}/health", timeout=1).read()
PY
    then
      ok=1
      break
    fi
    sleep 0.5
  done
  if [ "$ok" != "1" ]; then
    echo "low gateway port ${port} did not become healthy" >&2
    tail -80 "$worker_home_dir/logs/"*"-gateway-${port}.log" >&2 || true
    exit 1
  fi
}

for port in $(seq $((low_gateway_base_port + 1)) $((low_gateway_base_port + low_gateway_count))); do
  wait_gateway_port "$port"
done
if [ "$grok_gateway_count" -gt 0 ]; then
  for port in $(seq $((grok_gateway_base_port + 1)) $((grok_gateway_base_port + grok_gateway_count))); do
    wait_gateway_port "$port"
  done
fi

echo LOW_GATEWAYS_STARTED
