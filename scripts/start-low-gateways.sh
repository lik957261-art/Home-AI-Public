#!/usr/bin/env bash
set -euo pipefail

worker_user="${HERMES_LOW_GATEWAY_USER:-hermes}"
worker_home="/home/$worker_user"
worker_home_dir="$worker_home/.hermes"
gateway_worker_root="${HERMES_GATEWAY_WORKER_ROOT:-/mnt/c/ProgramData/HermesMobile/gateway-worker}"
configure_low_gateway_script="${HERMES_LOW_GATEWAY_CONFIGURE_SCRIPT:-$gateway_worker_root/configure-low-gateways.sh}"
runtime_root="${HERMES_GATEWAY_RUNTIME_ROOT:-/opt/hermes-gateway-runtime}"
runtime_python="${HERMES_GATEWAY_RUNTIME_PYTHON:-$runtime_root/venv/bin/python}"
runtime_source="${HERMES_GATEWAY_RUNTIME_SOURCE:-$runtime_root/official-clean}"
runtime_bin="${HERMES_GATEWAY_RUNTIME_BIN:-$runtime_root/bin}"
low_gateway_count="${HERMES_LOW_GATEWAY_COUNT:-10}"

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

install -d -m 700 -o "$worker_user" -g "$worker_user" "$worker_home_dir/logs"

for idx in $(seq 1 "$low_gateway_count"); do
  profile="lowgw${idx}"
  port=$((18750 + idx))
  log="$worker_home_dir/logs/${profile}-gateway-${port}.log"
  pidfile="$worker_home_dir/${profile}-gateway-${port}.pid"
  api_key="$(tr -d '\r\n' < "$api_key_file")"
  rm -f "$pidfile"
  runuser -u "$worker_user" -- setsid -f env \
    HOME="$worker_home" \
    HERMES_HOME="$worker_home_dir" \
    PYTHONPATH="$runtime_source" \
    HERMES_PROFILE="$profile" \
    HERMES_GOOGLE_PROFILE_HOME="$worker_home_dir/profiles/$profile" \
    PATH="$low_gateway_path" \
    HERMES_ACCEPT_HOOKS=1 \
    API_SERVER_KEY="$api_key" \
    "$runtime_hermes" -p "$profile" gateway run --replace --accept-hooks > "$log" 2>&1 < /dev/null
  sleep 0.2
  pgrep -u "$worker_user" -f "${profile} gateway run" | head -1 > "$pidfile" || true
done

for port in $(seq 18751 $((18750 + low_gateway_count))); do
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
    tail -80 "$worker_home_dir/logs/lowgw$((port - 18750))-gateway-${port}.log" >&2 || true
    exit 1
  fi
done

echo LOW_GATEWAYS_STARTED
