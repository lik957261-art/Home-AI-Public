#!/usr/bin/env bash
set -euo pipefail

worker_user="${HERMES_LOW_GATEWAY_USER:-hermes}"
worker_home="/home/$worker_user"
worker_home_dir="$worker_home/.hermes"
gateway_worker_root="${HERMES_GATEWAY_WORKER_ROOT:-/mnt/c/ProgramData/HermesMobile/gateway-worker}"
gateway_pool_manifest_path="${HERMES_GATEWAY_POOL_MANIFEST_PATH:-/mnt/c/ProgramData/HermesMobile/data/gateway-pool-manifest.json}"
configure_low_gateway_script="${HERMES_LOW_GATEWAY_CONFIGURE_SCRIPT:-$gateway_worker_root/configure-low-gateways.sh}"
configure_state_root="${HERMES_LOW_GATEWAY_CONFIGURE_STATE_ROOT:-$gateway_worker_root/configure-state}"
configure_signature_file="$configure_state_root/low-gateway-config.sha256"
runtime_root="${HERMES_GATEWAY_RUNTIME_ROOT:-/opt/hermes-gateway-runtime}"
runtime_python="${HERMES_GATEWAY_RUNTIME_PYTHON:-$runtime_root/venv/bin/python}"
runtime_source="${HERMES_GATEWAY_RUNTIME_SOURCE:-$runtime_root/official-clean}"
runtime_overrides="${HERMES_GATEWAY_RUNTIME_OVERRIDES:-$runtime_root/runtime-overrides}"
runtime_overrides_source="${HERMES_GATEWAY_RUNTIME_OVERRIDES_SOURCE:-$gateway_worker_root/runtime-overrides}"
runtime_bin="${HERMES_GATEWAY_RUNTIME_BIN:-$runtime_root/bin}"
log_step() {
  printf '%s %s\n' "$(date -Is)" "$*"
}
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
deepseek_gateway_count="${HERMES_DEEPSEEK_GATEWAY_COUNT:-0}"
low_gateway_base_port="${HERMES_LOW_GATEWAY_BASE_PORT:-18750}"
gateway_start_profiles="${HERMES_GATEWAY_START_PROFILES:-}"
gateway_stop_only="${HERMES_GATEWAY_STOP_ONLY:-0}"
gateway_skip_configure_if_ready="${HERMES_GATEWAY_SKIP_CONFIGURE_IF_READY:-0}"
gateway_force_configure="${HERMES_GATEWAY_FORCE_CONFIGURE:-0}"

profile_selected() {
  local profile="$1"
  local selected="$gateway_start_profiles"
  if [ -z "$selected" ]; then
    return 0
  fi
  local item
  IFS=',' read -ra items <<< "$selected"
  for item in "${items[@]}"; do
    item="$(printf '%s' "$item" | xargs)"
    if [ "$item" = "$profile" ]; then
      return 0
    fi
  done
  return 1
}

manifest_gateway_specs() {
  python3 - "$gateway_pool_manifest_path" <<'PY' 2>/dev/null || true
import json, re, sys
try:
    data = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    raise SystemExit(0)
for worker in data.get("workers") or []:
    if worker.get("enabled") is False:
        continue
    profile = str(worker.get("profile") or worker.get("name") or "").strip()
    if not re.match(r"^(lowgw|grokgw|deepseekgw)\d+$", profile, re.I):
        continue
    try:
        port = int(worker.get("port") or 0)
    except Exception:
        port = 0
    if port <= 0:
        continue
    print(f"{profile}\t{port}")
PY
}

manifest_worker_api_key() {
  local profile="$1"
  python3 - "$gateway_pool_manifest_path" "$profile" <<'PY' 2>/dev/null || true
import json, sys
try:
    data = json.load(open(sys.argv[1], encoding="utf-8-sig"))
except Exception:
    raise SystemExit(0)
profile = str(sys.argv[2]).strip()
for worker in data.get("workers") or []:
    candidate = str(worker.get("profile") or worker.get("name") or "").strip()
    if candidate != profile:
        continue
    key = str(worker.get("api_key") or worker.get("apiKey") or "").strip()
    if key:
        print(key)
    break
PY
}

legacy_gateway_specs() {
  for idx in $(seq 1 "$low_gateway_count"); do
    printf 'lowgw%s\t%s\n' "$idx" "$((low_gateway_base_port + idx))"
  done
  if [ "$grok_gateway_count" -gt 0 ]; then
    local grok_gateway_base_port="${HERMES_GROK_GATEWAY_BASE_PORT:-$((low_gateway_base_port + low_gateway_count))}"
    for idx in $(seq 1 "$grok_gateway_count"); do
      printf 'grokgw%s\t%s\n' "$idx" "$((grok_gateway_base_port + idx))"
    done
  fi
  if [ "$deepseek_gateway_count" -gt 0 ]; then
    local deepseek_gateway_base_port="${HERMES_DEEPSEEK_GATEWAY_BASE_PORT:-$((low_gateway_base_port + low_gateway_count + grok_gateway_count))}"
    for idx in $(seq 1 "$deepseek_gateway_count"); do
      printf 'deepseekgw%s\t%s\n' "$idx" "$((deepseek_gateway_base_port + idx))"
    done
  fi
}

gateway_specs="$(manifest_gateway_specs)"
if [ -z "$gateway_specs" ]; then
  gateway_specs="$(legacy_gateway_specs)"
fi
filtered_gateway_specs=""
while IFS=$'\t' read -r profile port; do
  if [ -z "$profile" ] || [ -z "$port" ]; then
    continue
  fi
  if profile_selected "$profile"; then
    filtered_gateway_specs="${filtered_gateway_specs}${profile}"$'\t'"${port}"$'\n'
  fi
done <<< "$gateway_specs"
gateway_specs="$(printf '%s' "$filtered_gateway_specs" | sed '/^[[:space:]]*$/d')"
if [ -z "$gateway_specs" ]; then
  echo "no selected Gateway profiles matched manifest: ${gateway_start_profiles:-all}" >&2
  exit 1
fi
grok_gateway_port="$(printf '%s\n' "$gateway_specs" | awk '$1 ~ /^grokgw[0-9]+$/ { print $2; exit }')"

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
x_search_proxy_url="${HERMES_MOBILE_X_SEARCH_PROXY_URL:-http://127.0.0.1:${grok_gateway_port:-18761}}"
deepseek_api_key_path="${HERMES_MOBILE_DEEPSEEK_API_KEY_PATH:-${HERMES_WEB_DEEPSEEK_API_KEY_PATH:-/mnt/c/ProgramData/HermesMobile/data/secrets/deepseek-api-key.secret}}"
shared_auth_mode="${HERMES_LOW_GATEWAY_SHARED_AUTH_MODE:-shared-root}"
shared_auth_default_root="${HERMES_LOW_GATEWAY_SHARED_AUTH_ROOT:-$gateway_worker_root/telemetry/profiles/shared-auth}"
shared_auth_path="${HERMES_LOW_GATEWAY_SHARED_AUTH_PATH:-$shared_auth_default_root/auth.json}"
shared_auth_lock_path="${HERMES_LOW_GATEWAY_SHARED_AUTH_LOCK_PATH:-$shared_auth_default_root/auth.lock}"
grok_auth_default_root="${HERMES_GROK_GATEWAY_AUTH_ROOT:-$gateway_worker_root/telemetry/profiles/shared-auth-grok}"
grok_auth_path="${HERMES_GROK_GATEWAY_AUTH_PATH:-$grok_auth_default_root/auth.json}"
grok_auth_lock_path="${HERMES_GROK_GATEWAY_AUTH_LOCK_PATH:-$grok_auth_default_root/auth.lock}"
mobile_app_root="${HERMES_MOBILE_APP_ROOT:-/mnt/c/ProgramData/HermesMobile/app}"
weather_plugin_source="${HERMES_MOBILE_WEATHER_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-weather}"
web_plugin_source="${HERMES_MOBILE_WEB_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-web}"
http_plugin_source="${HERMES_MOBILE_HTTP_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-http}"
docx_plugin_source="${HERMES_MOBILE_DOCX_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-docx}"
audio_plugin_source="${HERMES_MOBILE_AUDIO_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-audio}"
image_plugin_source="${HERMES_MOBILE_IMAGE_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-image}"
video_plugin_source="${HERMES_MOBILE_VIDEO_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-video}"
cronjob_plugin_source="${HERMES_MOBILE_CRONJOB_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-cronjob}"
owner_connector_profiles="${HERMES_MOBILE_OWNER_CONNECTOR_PROFILES:-lowgw1 lowgw2 lowgw3 lowgw4 lowgw10 deepseekgw1 deepseekgw2 deepseekgw99}"
outlook_graph_mcp_path="${HERMES_MOBILE_OUTLOOK_GRAPH_MCP_PATH:-$worker_home_dir/scripts/outlook_graph_mcp.py}"
owner_skill_store="${HERMES_MOBILE_OWNER_SKILL_STORE:-/mnt/c/ProgramData/HermesMobile/data/skill-profiles/owner-full/skills}"
skill_profiles_root="${HERMES_MOBILE_SKILL_PROFILES_ROOT:-$(dirname "$(dirname "$owner_skill_store")")}"
wardrobe_mcp_path="${HERMES_MOBILE_WARDROBE_MCP_PATH:-$gateway_worker_root/wardrobe-mcp/scripts/wardrobe-mcp.py}"
wardrobe_user_drive_root="${HERMES_MOBILE_WARDROBE_USER_DRIVE_ROOT:-/mnt/c/ProgramData/HermesMobile/data/drive/users}"
owner_wardrobe_workspace_override="${HERMES_MOBILE_OWNER_WARDROBE_WORKSPACE:-}"
wuping_wardrobe_workspace_override="${HERMES_MOBILE_WUPING_WARDROBE_WORKSPACE:-}"

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
sync_runtime_overrides() {
  install -d -m 755 "$runtime_overrides"
  if [ -d "$runtime_overrides_source" ]; then
    find "$runtime_overrides" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    cp -a "$runtime_overrides_source/." "$runtime_overrides/"
    find "$runtime_overrides" -type d -name '__pycache__' -prune -exec rm -rf {} +
    find "$runtime_overrides" -type f \( -name '*.pyc' -o -name '*.pyo' \) -delete
    chmod -R a+rX "$runtime_overrides"
    return
  fi
  if [ -f "$runtime_overrides/sitecustomize.py" ]; then
    log_step "runtime-overrides-source-missing-using-existing source=${runtime_overrides_source} target=${runtime_overrides}"
    return
  fi
  echo "missing Gateway runtime overrides source: $runtime_overrides_source" >&2
  exit 1
}

log_step "runtime-overrides-sync-start source=${runtime_overrides_source} target=${runtime_overrides}"
sync_runtime_overrides
log_step "runtime-overrides-sync-done"

is_gateway_stop_only() {
  [[ "$gateway_stop_only" =~ ^(1|true|yes|on)$ ]]
}

is_skip_configure_if_ready() {
  [[ "$gateway_skip_configure_if_ready" =~ ^(1|true|yes|on)$ ]]
}

is_force_configure() {
  [[ "$gateway_force_configure" =~ ^(1|true|yes|on)$ ]]
}

compute_configure_signature() {
  python3 - \
    --value "worker_user=$worker_user" \
    --value "worker_home_dir=$worker_home_dir" \
    --value "gateway_worker_root=$gateway_worker_root" \
    --value "telemetry_profiles_root=$gateway_worker_root/telemetry/profiles" \
    --value "profile_auth_seed_root=$gateway_worker_root/profile-auth" \
    --value "low_gateway_count=$low_gateway_count" \
    --value "grok_gateway_count=$grok_gateway_count" \
    --value "deepseek_gateway_count=$deepseek_gateway_count" \
    --value "low_gateway_base_port=$low_gateway_base_port" \
    --value "shared_auth_mode=$shared_auth_mode" \
    --value "shared_auth_path=$shared_auth_path" \
    --value "shared_auth_lock_path=$shared_auth_lock_path" \
    --value "grok_auth_path=$grok_auth_path" \
    --value "grok_auth_lock_path=$grok_auth_lock_path" \
    --value "mobile_app_root=$mobile_app_root" \
    --value "owner_connector_profiles=$owner_connector_profiles" \
    --value "owner_skill_store=$owner_skill_store" \
    --value "skill_profiles_root=$skill_profiles_root" \
    --value "wardrobe_user_drive_root=$wardrobe_user_drive_root" \
    --value "owner_wardrobe_workspace_override=$owner_wardrobe_workspace_override" \
    --value "wuping_wardrobe_workspace_override=$wuping_wardrobe_workspace_override" \
    --path "$configure_low_gateway_script" \
    --path "$gateway_pool_manifest_path" \
    --path "$runtime_overrides_source" \
    --path "$weather_plugin_source" \
    --path "$web_plugin_source" \
    --path "$http_plugin_source" \
    --path "$docx_plugin_source" \
    --path "$audio_plugin_source" \
    --path "$image_plugin_source" \
    --path "$video_plugin_source" \
    --path "$cronjob_plugin_source" \
    --path "$wardrobe_mcp_path" \
    --path "$outlook_graph_mcp_path" <<'PY'
import hashlib
import os
import sys

hash_state = hashlib.sha256()

def add(label, value):
    hash_state.update(str(label).encode("utf-8", "surrogatepass"))
    hash_state.update(b"\0")
    hash_state.update(str(value).encode("utf-8", "surrogatepass"))
    hash_state.update(b"\0")

def add_file(path, relpath):
    try:
        st = os.lstat(path)
    except OSError:
        add("missing-file", relpath)
        return
    if os.path.islink(path):
        try:
            target = os.readlink(path)
        except OSError:
            target = ""
        add("symlink", f"{relpath}->{target}")
        return
    add("file-meta", f"{relpath}:{st.st_size}:{getattr(st, 'st_mtime_ns', int(st.st_mtime * 1000000000))}")
    try:
        with open(path, "rb") as handle:
            while True:
                chunk = handle.read(1024 * 1024)
                if not chunk:
                    break
                hash_state.update(chunk)
    except OSError:
        add("unreadable-file", relpath)

def add_path(path):
    path = str(path or "").strip()
    if not path:
        add("empty-path", "")
        return
    if not os.path.exists(path) and not os.path.islink(path):
        add("missing-path", path)
        return
    if os.path.isdir(path) and not os.path.islink(path):
        add("dir", path)
        for root, dirs, files in os.walk(path):
            dirs[:] = sorted(name for name in dirs if name not in {".git", "node_modules", "__pycache__"})
            for name in sorted(files):
                if name.endswith((".pyc", ".pyo")):
                    continue
                full = os.path.join(root, name)
                rel = os.path.relpath(full, path)
                add_file(full, f"{path}/{rel}")
        return
    add_file(path, path)

args = sys.argv[1:]
index = 0
while index < len(args):
    mode = args[index]
    value = args[index + 1] if index + 1 < len(args) else ""
    if mode == "--value":
        add("value", value)
    elif mode == "--path":
        add_path(value)
    index += 2

print(hash_state.hexdigest())
PY
}

configure_cache_current() {
  if [ ! -s "$configure_signature_file" ]; then
    return 1
  fi
  local expected
  local current
  expected="$(tr -d '\r\n' < "$configure_signature_file" || true)"
  current="$(compute_configure_signature || true)"
  if [ -z "$expected" ] || [ -z "$current" ]; then
    return 1
  fi
  [ "$expected" = "$current" ]
}

write_configure_signature() {
  local tmp
  install -d -m 700 "$configure_state_root"
  tmp="${configure_signature_file}.$$"
  compute_configure_signature > "$tmp"
  mv "$tmp" "$configure_signature_file"
  chmod 600 "$configure_signature_file" || true
}

profile_environment_ready() {
  local profile="$1"
  local profile_link="$worker_home_dir/profiles/$profile"
  local expected_target="$gateway_worker_root/telemetry/profiles/$profile"
  local resolved_profile=""
  local resolved_expected=""

  if [ ! -d "$expected_target" ]; then
    return 1
  fi
  if [ -e "$profile_link" ] && [ ! -L "$profile_link" ]; then
    return 1
  fi
  if [ -L "$profile_link" ]; then
    resolved_profile="$(readlink -f "$profile_link" || true)"
    resolved_expected="$(readlink -f "$expected_target" || true)"
    if [ -z "$resolved_profile" ] || [ -z "$resolved_expected" ] || [ "$resolved_profile" != "$resolved_expected" ]; then
      return 1
    fi
  fi
  if [ ! -s "$expected_target/config.yaml" ]; then
    return 1
  fi
  if [ ! -d "$expected_target/plugins" ]; then
    return 1
  fi
  if [ ! -L "$expected_target/skills" ] || [ ! -d "$expected_target/skills" ]; then
    return 1
  fi
  if [ ! -L "$expected_target/auth.json" ] || [ ! -s "$expected_target/auth.json" ]; then
    return 1
  fi
  if [ ! -L "$expected_target/auth.lock" ]; then
    return 1
  fi
  return 0
}

selected_gateway_profiles_ready() {
  local profile=""
  local port=""
  while IFS=$'\t' read -r profile port; do
    if [ -z "$profile" ] || [ -z "$port" ]; then
      continue
    fi
    if ! profile_environment_ready "$profile"; then
      return 1
    fi
  done <<< "$gateway_specs"
  return 0
}

if is_gateway_stop_only; then
  log_step "lowgw-configure-skipped reason=stop-only profiles=${gateway_start_profiles:-all}"
elif ! is_force_configure && selected_gateway_profiles_ready && configure_cache_current; then
  log_step "lowgw-configure-skipped reason=config-current profiles=${gateway_start_profiles:-all}"
elif is_skip_configure_if_ready && [ -n "$gateway_start_profiles" ]; then
  log_step "lowgw-configure-cache-miss profiles=${gateway_start_profiles}"
  log_step "lowgw-configure-start"
  bash "$configure_low_gateway_script"
  if ! write_configure_signature; then
    log_step "lowgw-configure-signature-write-failed"
  fi
  log_step "lowgw-configure-done"
else
  log_step "lowgw-configure-start"
  bash "$configure_low_gateway_script"
  if ! write_configure_signature; then
    log_step "lowgw-configure-signature-write-failed"
  fi
  log_step "lowgw-configure-done"
fi

install -d -m 755 "$runtime_bin"
cat > "$runtime_bin/hermes" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export PYTHONPATH="$runtime_overrides:$runtime_source\${PYTHONPATH:+:\$PYTHONPATH}"
exec "$runtime_python" -m hermes_cli.main "\$@"
EOF
chmod 755 "$runtime_bin/hermes"

low_gateway_path="$runtime_bin:$runtime_root/venv/bin:/usr/local/bin:/usr/bin:/bin"
runtime_hermes="$runtime_bin/hermes"
api_key_file="$worker_home_dir/api-server-key.secret"
if ! is_gateway_stop_only && [ ! -s "$api_key_file" ]; then
  echo "missing low gateway API key file: $api_key_file" >&2
  exit 1
fi
deepseek_api_key=""
if [ -s "$deepseek_api_key_path" ]; then
  deepseek_api_key="$(tr -d '\r\n' < "$deepseek_api_key_path")"
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
  echo "Stopping existing low Gateway listener on port ${port}: ${pids}"
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
  api_key="$(manifest_worker_api_key "$profile")"
  if [ -z "$api_key" ]; then
    api_key="$(tr -d '\r\n' < "$api_key_file")"
  fi
  if [[ "$profile" == deepseekgw* ]] && [ -z "$deepseek_api_key" ]; then
    echo "missing DeepSeek API key for ${profile}: ${deepseek_api_key_path}" >&2
    exit 1
  fi
  log_step "lowgw-start-profile-start profile=${profile} port=${port}"
  stop_gateway_port "$port"
  rm -f "$pidfile"
  runuser -u "$worker_user" -- setsid -f env \
    HOME="$worker_home" \
    HERMES_HOME="$worker_home_dir/profiles/$profile" \
    PYTHONPATH="$runtime_overrides:$runtime_source" \
    HERMES_PROFILE="$profile" \
    HERMES_MOBILE_MCP_INVENTORY_LOG="$worker_home_dir/logs/${profile}-mcp-inventory.log" \
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
    DEEPSEEK_API_KEY="$deepseek_api_key" \
    API_SERVER_KEY="$api_key" \
    "$runtime_hermes" gateway run --replace --accept-hooks > "$log" 2>&1 < /dev/null
  sleep 0.2
  pgrep -u "$worker_user" -f "hermes_cli.main .*gateway run --replace --accept-hooks" | tail -1 > "$pidfile" || true
  log_step "lowgw-start-profile-done profile=${profile} port=${port}"
}

while IFS=$'\t' read -r profile port; do
  if [ -z "$profile" ] || [ -z "$port" ]; then
    continue
  fi
  if is_gateway_stop_only; then
    log_step "lowgw-stop-profile-start profile=${profile} port=${port}"
    stop_gateway_port "$port"
    log_step "lowgw-stop-profile-done profile=${profile} port=${port}"
    continue
  fi
  verify_gateway_profile "$profile"
  start_gateway_profile "$profile" "$port"
done <<< "$gateway_specs"

if is_gateway_stop_only; then
  echo LOW_GATEWAYS_STOPPED
  exit 0
fi

wait_gateway_port() {
  local port="$1"
  ok=0
  log_step "lowgw-wait-health-start port=${port}"
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
  log_step "lowgw-wait-health-done port=${port}"
}

while IFS=$'\t' read -r _profile port; do
  if [ -z "$port" ]; then
    continue
  fi
  wait_gateway_port "$port"
done <<< "$gateway_specs"

echo LOW_GATEWAYS_STARTED
