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

safe_template_metadata_value() {
  local value="${1:-}"
  if [[ "$value" =~ ^[-A-Za-z0-9_.\|:+]{1,160}$ ]]; then
    printf '%s' "$value"
  fi
}

gateway_request_pool_key="$(safe_template_metadata_value "${HERMES_GATEWAY_REQUEST_POOL_KEY:-}")"
gateway_request_profile_template_key="$(safe_template_metadata_value "${HERMES_GATEWAY_REQUEST_PROFILE_TEMPLATE_KEY:-}")"
gateway_request_template_key="$(safe_template_metadata_value "${HERMES_GATEWAY_REQUEST_TEMPLATE_KEY:-}")"
gateway_request_replica_id="$(safe_template_metadata_value "${HERMES_GATEWAY_REQUEST_REPLICA_ID:-}")"
gateway_request_workspace_id="$(safe_template_metadata_value "${HERMES_GATEWAY_REQUEST_WORKSPACE_ID:-}")"
if [ -z "$gateway_request_template_key" ]; then
  gateway_request_template_key="$gateway_request_profile_template_key"
fi
if [ -n "$gateway_request_pool_key" ] || [ -n "$gateway_request_template_key" ] || [ -n "$gateway_request_replica_id" ] || [ -n "$gateway_request_workspace_id" ]; then
  log_step "lowgw-template-request profiles=${gateway_start_profiles:-all} pool=${gateway_request_pool_key} template=${gateway_request_template_key} replica=${gateway_request_replica_id} workspace=${gateway_request_workspace_id}"
fi

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
    if not re.match(r"^(?:(lowgw|grokgw|deepseekgw)\d+|hm-[a-z0-9-]+-(openai|deepseek)-\d+)$", profile, re.I):
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

manifest_skill_store_for_profile() {
  local profile="$1"
  python3 - "$gateway_pool_manifest_path" "$profile" "$owner_skill_store" "$skill_profiles_root" "$gateway_request_workspace_id" <<'PY' 2>/dev/null || true
import json
import re
import sys

manifest_path, profile, owner_skill_store, skill_profiles_root, request_workspace = sys.argv[1:6]

def clean_profile(value):
    text = str(value or "").strip().lower()
    if text.startswith("workspace:"):
        text = text.split(":", 1)[1]
    text = re.sub(r"[^a-z0-9_-]+", "-", text).strip("-")
    return text[:80]

request_workspace = clean_profile(request_workspace)
if request_workspace and request_workspace not in ("owner", "*"):
    print(f"{skill_profiles_root.rstrip('/')}/{request_workspace}/skills")
    raise SystemExit(0)
if request_workspace == "owner":
    print(owner_skill_store)
    raise SystemExit(0)

def profile_from_worker(worker):
    candidates = []
    for key in ("skillWorkspaceIds", "skill_workspace_ids", "allowedWorkspaceIds", "allowed_workspace_ids"):
        raw = worker.get(key) or []
        if isinstance(raw, str):
            raw = [item.strip() for item in raw.split(",") if item.strip()]
        candidates.extend(clean_profile(item) for item in raw)
    private_ids = []
    for item in candidates:
        if item and item not in ("owner", "owner-full", "*") and item not in private_ids:
            private_ids.append(item)
    if len(private_ids) == 1:
        return private_ids[0]
    skill_profile = str(worker.get("skillProfile") or worker.get("skill_profile") or "").strip()
    if skill_profile.lower().startswith("workspace:"):
        value = clean_profile(skill_profile)
        if value:
            return value
    return "owner-full"

try:
    data = json.load(open(manifest_path, encoding="utf-8-sig"))
except Exception:
    print(owner_skill_store)
    raise SystemExit(0)

for worker in data.get("workers") or []:
    candidate = str(worker.get("profile") or worker.get("name") or "").strip()
    if candidate != profile:
        continue
    skill_profile = profile_from_worker(worker)
    if skill_profile == "owner-full":
        print(owner_skill_store)
    else:
        print(f"{skill_profiles_root.rstrip('/')}/{skill_profile}/skills")
    break
PY
}

manifest_memory_store_for_profile() {
  local profile="$1"
  python3 - "$gateway_pool_manifest_path" "$profile" "$owner_skill_store" "$skill_profiles_root" "$gateway_request_workspace_id" <<'PY' 2>/dev/null || true
import json
import re
import sys

manifest_path, profile, owner_skill_store, skill_profiles_root, request_workspace = sys.argv[1:6]
owner_memory_store = f"{owner_skill_store.rstrip('/').rsplit('/', 1)[0]}/memories"

def clean_profile(value):
    text = str(value or "").strip().lower()
    if text.startswith("workspace:"):
        text = text.split(":", 1)[1]
    text = re.sub(r"[^a-z0-9_-]+", "-", text).strip("-")
    return text[:80]

request_workspace = clean_profile(request_workspace)
if request_workspace and request_workspace not in ("owner", "*"):
    print(f"{skill_profiles_root.rstrip('/')}/{request_workspace}/memories")
    raise SystemExit(0)
if request_workspace == "owner":
    print(owner_memory_store)
    raise SystemExit(0)

def profile_from_worker(worker):
    candidates = []
    for key in ("skillWorkspaceIds", "skill_workspace_ids", "allowedWorkspaceIds", "allowed_workspace_ids"):
        raw = worker.get(key) or []
        if isinstance(raw, str):
            raw = [item.strip() for item in raw.split(",") if item.strip()]
        candidates.extend(clean_profile(item) for item in raw)
    private_ids = []
    for item in candidates:
        if item and item not in ("owner", "owner-full", "*") and item not in private_ids:
            private_ids.append(item)
    if len(private_ids) == 1:
        return private_ids[0]
    skill_profile = str(worker.get("skillProfile") or worker.get("skill_profile") or "").strip()
    if skill_profile.lower().startswith("workspace:"):
        value = clean_profile(skill_profile)
        if value:
            return value
    return "owner-full"

try:
    data = json.load(open(manifest_path, encoding="utf-8-sig"))
except Exception:
    print(owner_memory_store)
    raise SystemExit(0)

for worker in data.get("workers") or []:
    candidate = str(worker.get("profile") or worker.get("name") or "").strip()
    if candidate != profile:
        continue
    memory_profile = profile_from_worker(worker)
    if memory_profile == "owner-full":
        print(owner_memory_store)
    else:
        print(f"{skill_profiles_root.rstrip('/')}/{memory_profile}/memories")
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
grok_auth_default_root="${HERMES_GROK_GATEWAY_AUTH_ROOT:-$shared_auth_default_root}"
grok_auth_path="${HERMES_GROK_GATEWAY_AUTH_PATH:-$grok_auth_default_root/auth.json}"
grok_auth_lock_path="${HERMES_GROK_GATEWAY_AUTH_LOCK_PATH:-$grok_auth_default_root/auth.lock}"
mobile_app_root="${HERMES_MOBILE_APP_ROOT:-/mnt/c/ProgramData/HermesMobile/app}"
gateway_profile_template_builder_script="${HERMES_GATEWAY_PROFILE_TEMPLATE_BUILDER_SCRIPT:-$mobile_app_root/scripts/build-gateway-profile-template.js}"
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
finance_mcp_python="${HERMES_MOBILE_FINANCE_MCP_PYTHON:-/opt/hermes-gateway-runtime/venv/bin/python}"
finance_mcp_path="${HERMES_MOBILE_FINANCE_MCP_PATH:-$gateway_worker_root/finance-mcp/scripts/finance_mcp_stdio.py}"
note_mcp_python="${HERMES_MOBILE_NOTE_MCP_PYTHON:-/opt/hermes-gateway-runtime/venv/bin/python}"
note_mcp_path="${HERMES_MOBILE_NOTE_MCP_PATH:-$gateway_worker_root/note-mcp/scripts/note_mcp_stdio.py}"
health_mcp_command="${HERMES_MOBILE_HEALTH_MCP_COMMAND:-node}"
health_mcp_path="${HERMES_MOBILE_HEALTH_MCP_PATH:-$gateway_worker_root/health-mcp/scripts/mcp-health-wrapper.js}"
growth_mcp_command="${HERMES_MOBILE_GROWTH_MCP_COMMAND:-node}"
growth_mcp_path="${HERMES_MOBILE_GROWTH_MCP_PATH:-$gateway_worker_root/growth-mcp/scripts/growth-mcp-wrapper.js}"
moira_mcp_command="${HERMES_MOBILE_MOIRA_MCP_COMMAND:-node}"
moira_mcp_path="${HERMES_MOBILE_MOIRA_MCP_PATH:-$gateway_worker_root/moira-mcp/scripts/moira-mcp-stdio.mjs}"
email_mcp_python="${HERMES_MOBILE_EMAIL_MCP_PYTHON:-/opt/hermes-gateway-runtime/venv/bin/python}"
email_mcp_path="${HERMES_MOBILE_EMAIL_MCP_PATH:-$gateway_worker_root/email-mcp/scripts/email-mcp-wrapper.py}"
music_mcp_command="${HERMES_MOBILE_MUSIC_MCP_COMMAND:-node}"
if [[ "$gateway_worker_root" == /mnt/* ]]; then
  default_music_mcp_path="$gateway_worker_root/music-mcp/src/mcp-stdio.js"
  default_music_sqlite_path="$gateway_worker_root/music-mcp/runtime/music.sqlite"
else
  gateway_runtime_root="$(dirname "$gateway_worker_root")"
  default_music_mcp_path="$gateway_runtime_root/plugins/music/src/mcp-stdio.js"
  default_music_sqlite_path="$gateway_runtime_root/plugins/music/runtime/music.sqlite"
fi
music_mcp_path="${HERMES_MOBILE_MUSIC_MCP_PATH:-$default_music_mcp_path}"
music_sqlite_path="${HERMES_MOBILE_MUSIC_SQLITE_PATH:-$default_music_sqlite_path}"
default_finance_mcp_api_base_url="http://127.0.0.1:8791"
default_note_mcp_api_base_url="http://127.0.0.1:4181"
default_health_mcp_api_base_url="http://127.0.0.1:4877"
default_growth_mcp_api_base_url="http://127.0.0.1:4881"
default_moira_mcp_api_base_url="http://127.0.0.1:4174"
default_email_mcp_api_base_url="http://127.0.0.1:5175"
if [[ "$gateway_worker_root" == /mnt/* ]] && [ -n "${windows_host_gateway:-}" ]; then
  default_finance_mcp_api_base_url="http://${windows_host_gateway}:8791"
  default_note_mcp_api_base_url="http://${windows_host_gateway}:4181"
  default_health_mcp_api_base_url="http://${windows_host_gateway}:4877"
  default_growth_mcp_api_base_url="http://${windows_host_gateway}:4881"
  default_moira_mcp_api_base_url="http://${windows_host_gateway}:4174"
  default_email_mcp_api_base_url="http://${windows_host_gateway}:5175"
fi
finance_mcp_api_base_url="${HERMES_MOBILE_FINANCE_MCP_API_BASE_URL:-$default_finance_mcp_api_base_url}"
note_mcp_api_base_url="${HERMES_MOBILE_NOTE_MCP_API_BASE_URL:-$default_note_mcp_api_base_url}"
health_mcp_api_base_url="${HERMES_MOBILE_HEALTH_MCP_API_BASE_URL:-$default_health_mcp_api_base_url}"
growth_mcp_api_base_url="${HERMES_MOBILE_GROWTH_MCP_API_BASE_URL:-$default_growth_mcp_api_base_url}"
moira_mcp_api_base_url="${HERMES_MOBILE_MOIRA_MCP_API_BASE_URL:-$default_moira_mcp_api_base_url}"
email_mcp_api_base_url="${HERMES_MOBILE_EMAIL_MCP_API_BASE_URL:-$default_email_mcp_api_base_url}"
finance_user_drive_root="${HERMES_MOBILE_FINANCE_USER_DRIVE_ROOT:-/mnt/c/ProgramData/HermesMobile/data/drive/users}"
owner_finance_workspace_override="${HERMES_MOBILE_OWNER_FINANCE_WORKSPACE:-}"
wuping_finance_workspace_override="${HERMES_MOBILE_WUPING_FINANCE_WORKSPACE:-}"
note_user_drive_root="${HERMES_MOBILE_NOTE_USER_DRIVE_ROOT:-/mnt/c/ProgramData/HermesMobile/data/drive/users}"
owner_note_workspace_override="${HERMES_MOBILE_OWNER_NOTE_WORKSPACE:-}"
wuping_note_workspace_override="${HERMES_MOBILE_WUPING_NOTE_WORKSPACE:-}"
health_user_drive_root="${HERMES_MOBILE_HEALTH_USER_DRIVE_ROOT:-/mnt/c/ProgramData/HermesMobile/data/drive/users}"
owner_health_workspace_override="${HERMES_MOBILE_OWNER_HEALTH_WORKSPACE:-}"
wuping_health_workspace_override="${HERMES_MOBILE_WUPING_HEALTH_WORKSPACE:-}"
growth_user_drive_root="${HERMES_MOBILE_GROWTH_USER_DRIVE_ROOT:-/mnt/c/ProgramData/HermesMobile/data/drive/users}"
owner_growth_workspace_override="${HERMES_MOBILE_OWNER_GROWTH_WORKSPACE:-}"
wuping_growth_workspace_override="${HERMES_MOBILE_WUPING_GROWTH_WORKSPACE:-}"
moira_user_drive_root="${HERMES_MOBILE_MOIRA_USER_DRIVE_ROOT:-/mnt/c/ProgramData/HermesMobile/data/drive/users}"
music_user_drive_root="${HERMES_MOBILE_MUSIC_USER_DRIVE_ROOT:-/mnt/c/ProgramData/HermesMobile/data/drive/users}"
email_user_drive_root="${HERMES_MOBILE_EMAIL_USER_DRIVE_ROOT:-/mnt/c/ProgramData/HermesMobile/data/drive/users}"
owner_email_workspace_override="${HERMES_MOBILE_OWNER_EMAIL_WORKSPACE:-}"
wuping_email_workspace_override="${HERMES_MOBILE_WUPING_EMAIL_WORKSPACE:-}"

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
    --value "finance_mcp_python=$finance_mcp_python" \
    --value "finance_mcp_api_base_url=$finance_mcp_api_base_url" \
    --value "finance_user_drive_root=$finance_user_drive_root" \
    --value "owner_finance_workspace_override=$owner_finance_workspace_override" \
    --value "wuping_finance_workspace_override=$wuping_finance_workspace_override" \
    --value "note_mcp_python=$note_mcp_python" \
    --value "note_mcp_api_base_url=$note_mcp_api_base_url" \
    --value "note_user_drive_root=$note_user_drive_root" \
    --value "owner_note_workspace_override=$owner_note_workspace_override" \
    --value "wuping_note_workspace_override=$wuping_note_workspace_override" \
    --value "health_mcp_command=$health_mcp_command" \
    --value "health_mcp_api_base_url=$health_mcp_api_base_url" \
    --value "health_user_drive_root=$health_user_drive_root" \
    --value "owner_health_workspace_override=$owner_health_workspace_override" \
    --value "wuping_health_workspace_override=$wuping_health_workspace_override" \
    --value "growth_mcp_command=$growth_mcp_command" \
    --value "growth_mcp_api_base_url=$growth_mcp_api_base_url" \
    --value "growth_user_drive_root=$growth_user_drive_root" \
    --value "owner_growth_workspace_override=$owner_growth_workspace_override" \
    --value "wuping_growth_workspace_override=$wuping_growth_workspace_override" \
    --value "moira_mcp_command=$moira_mcp_command" \
    --value "moira_mcp_api_base_url=$moira_mcp_api_base_url" \
    --value "moira_user_drive_root=$moira_user_drive_root" \
    --value "music_mcp_command=$music_mcp_command" \
    --value "music_sqlite_path=$music_sqlite_path" \
    --value "music_user_drive_root=$music_user_drive_root" \
    --value "email_mcp_python=$email_mcp_python" \
    --value "email_mcp_api_base_url=$email_mcp_api_base_url" \
    --value "email_user_drive_root=$email_user_drive_root" \
    --value "owner_email_workspace_override=$owner_email_workspace_override" \
    --value "wuping_email_workspace_override=$wuping_email_workspace_override" \
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
    --path "$finance_mcp_path" \
    --path "$note_mcp_path" \
    --path "$health_mcp_path" \
    --path "$growth_mcp_path" \
    --path "$moira_mcp_path" \
    --path "$music_mcp_path" \
    --path "$email_mcp_path" \
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

profile_template_sync_current() {
  python3 - "$gateway_pool_manifest_path" "$gateway_worker_root/telemetry/profiles" <<'PY'
import hashlib
import json
import os
import re
import sys

manifest_path, profiles_root = sys.argv[1:3]

def clean(value):
    return str(value or "").strip()

def clean_list(value):
    if isinstance(value, list):
        return [clean(item) for item in value if clean(item)]
    if isinstance(value, str):
        return [item for item in re.split(r"[,;\s]+", value.strip()) if item]
    return []

def dedupe_sorted(values):
    return sorted(set(clean_list(values)))

def workspace_id(worker):
    candidates = []
    for key in ("skillWorkspaceIds", "skill_workspace_ids", "allowedWorkspaceIds", "allowed_workspace_ids"):
        candidates.extend(clean_list(worker.get(key)))
    normalized = []
    for item in candidates:
        text = clean(item).lower()
        if text in ("", "*", "all"):
            continue
        if text.startswith("workspace:"):
            text = text.split(":", 1)[1]
        text = re.sub(r"[^a-z0-9_-]+", "-", text).strip("-")[:80]
        if text and text not in normalized:
            normalized.append(text)
    if len(normalized) == 1:
        return normalized[0]
    if "owner" in normalized:
        return "owner"
    return "+".join(sorted(normalized)) or "owner"

def security_level(worker):
    text = clean(worker.get("securityLevel") or worker.get("security_level")).lower().replace("_", "-")
    if text in ("owner", "owner-maintenance", "maintenance", "admin", "high", "high-privilege"):
        return "owner-maintenance"
    return "user"

def section(lines, name):
    out = []
    active = False
    for line in lines:
        if re.match(rf"^{re.escape(name)}:\s*$", line):
            active = True
            continue
        if not active:
            continue
        if re.match(r"^\S.*:\s*$", line):
            break
        out.append(line)
    return out

def top_list(lines, name):
    out = []
    for line in section(lines, name):
        match = re.match(r"^\s*-\s*([A-Za-z0-9_.:-]+)\s*$", line)
        if match:
            out.append(match.group(1))
    return dedupe_sorted(out)

def model_provider(lines):
    for line in section(lines, "model"):
        match = re.match(r"^\s{2}provider:\s*(.+?)\s*$", line)
        if match:
            return clean(match.group(1)) or "openai-codex"
    return "openai-codex"

def model_default(lines):
    for line in section(lines, "model"):
        match = re.match(r"^\s{2}default:\s*(.+?)\s*$", line)
        if match:
            return clean(match.group(1))
    return ""

def api_toolsets(lines):
    out = []
    in_platform = False
    in_api = False
    for line in lines:
        if re.match(r"^platform_toolsets:\s*$", line):
            in_platform = True
            in_api = False
            continue
        if not in_platform:
            continue
        if re.match(r"^\S.*:\s*$", line):
            break
        if re.match(r"^\s{2}api_server:\s*$", line):
            in_api = True
            continue
        if not in_api:
            continue
        if re.match(r"^\s{2}\S.*:\s*$", line):
            break
        match = re.match(r"^\s{4}-\s*([A-Za-z0-9_.:-]+)\s*$", line)
        if match:
            out.append(match.group(1))
    return dedupe_sorted(out)

def mcp_servers(lines):
    out = []
    active = False
    for line in lines:
        if re.match(r"^mcp_servers:\s*$", line):
            active = True
            continue
        if not active:
            continue
        if re.match(r"^\S.*:\s*$", line):
            break
        match = re.match(r"^\s{2}([A-Za-z0-9_.:-]+):\s*$", line)
        if match:
            out.append(match.group(1))
    return dedupe_sorted(out)

def plugins(lines):
    out = []
    in_plugins = False
    in_enabled = False
    for line in lines:
        if re.match(r"^plugins:\s*$", line):
            in_plugins = True
            in_enabled = False
            continue
        if not in_plugins:
            continue
        if re.match(r"^\S.*:\s*$", line):
            break
        if re.match(r"^\s{2}enabled:\s*$", line):
            in_enabled = True
            continue
        if re.match(r"^\s{2}enabled:\s*\[\]\s*$", line):
            break
        if not in_enabled:
            continue
        match = re.match(r"^\s{4}-\s*([A-Za-z0-9_.:-]+)\s*$", line)
        if match:
            out.append(match.group(1))
    return dedupe_sorted(out)

def capabilities(config_path):
    with open(config_path, encoding="utf-8") as handle:
        lines = handle.read().splitlines()
    return {
        "modelDefault": model_default(lines),
        "modelProvider": model_provider(lines),
        "toolsets": top_list(lines, "toolsets"),
        "apiServerToolsets": api_toolsets(lines),
        "mcpServers": mcp_servers(lines),
        "plugins": plugins(lines),
    }

try:
    manifest = json.load(open(manifest_path, encoding="utf-8-sig"))
except Exception:
    raise SystemExit(1)

groups = {}
for worker in manifest.get("workers") or []:
    if worker.get("enabled") is False:
        continue
    profile = clean(worker.get("profile") or worker.get("name"))
    if not profile:
        continue
    config_path = os.path.join(profiles_root, profile, "config.yaml")
    if not os.path.exists(config_path):
        continue
    caps = capabilities(config_path)
    provider = clean(worker.get("provider")) or caps["modelProvider"] or "openai-codex"
    template_key = "|".join([workspace_id(worker), security_level(worker), provider])
    public_shape = json.dumps(caps, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(public_shape.encode("utf-8")).hexdigest()[:16]
    groups.setdefault(template_key, {}).setdefault(digest, []).append(profile)

for template_key, hashes in groups.items():
    if len(hashes) > 1:
        print(f"profile_template_drift:{template_key}:" + ",".join(sorted(sum(hashes.values(), []))), file=sys.stderr)
        raise SystemExit(1)
raise SystemExit(0)
PY
}

find_gateway_template_node() {
  if [ -n "${HERMES_GATEWAY_PROFILE_TEMPLATE_BUILDER_NODE:-}" ] && [ -x "$HERMES_GATEWAY_PROFILE_TEMPLATE_BUILDER_NODE" ]; then
    printf '%s\n' "$HERMES_GATEWAY_PROFILE_TEMPLATE_BUILDER_NODE"
    return 0
  fi
  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi
  if [ -x "/mnt/c/Program Files/nodejs/node.exe" ]; then
    printf '%s\n' "/mnt/c/Program Files/nodejs/node.exe"
    return 0
  fi
  return 1
}

gateway_template_node="$(find_gateway_template_node || true)"

gateway_template_builder_script_arg() {
  if [ -z "$gateway_template_node" ] || [ ! -f "$gateway_profile_template_builder_script" ]; then
    return 1
  fi
  if [[ "$gateway_template_node" == *.exe ]] && command -v wslpath >/dev/null 2>&1; then
    wslpath -w "$gateway_profile_template_builder_script"
    return 0
  fi
  printf '%s\n' "$gateway_profile_template_builder_script"
}

gateway_template_manifest_arg() {
  if [[ "$gateway_template_node" == *.exe ]] && command -v wslpath >/dev/null 2>&1; then
    wslpath -w "$gateway_pool_manifest_path"
    return 0
  fi
  printf '%s\n' "$gateway_pool_manifest_path"
}

template_peer_profiles_for_selection() {
  local selected_profiles="${1:-}"
  if [ -z "$selected_profiles" ]; then
    return 0
  fi
  if [ -n "$gateway_template_node" ] && [ -f "$gateway_profile_template_builder_script" ]; then
    local script_arg
    local manifest_arg
    local builder_output
    script_arg="$(gateway_template_builder_script_arg)" || script_arg=""
    manifest_arg="$(gateway_template_manifest_arg)" || manifest_arg=""
    if [ -n "$script_arg" ] && [ -n "$manifest_arg" ] && builder_output="$("$gateway_template_node" "$script_arg" --manifest "$manifest_arg" --profiles "$selected_profiles" --print-configure-profiles 2>/dev/null)" && [ -n "$builder_output" ]; then
      printf '%s\n' "$builder_output"
      return 0
    fi
  fi
  python3 - "$gateway_pool_manifest_path" "$selected_profiles" <<'PY' 2>/dev/null || printf '%s\n' "$selected_profiles"
import json
import re
import sys

manifest_path, selected = sys.argv[1:3]
selected_profiles = [item.strip() for item in selected.split(",") if item.strip()]
selected_set = set(selected_profiles)

def clean(value):
    return str(value or "").strip()

def clean_list(value):
    if isinstance(value, list):
        return [clean(item) for item in value if clean(item)]
    if isinstance(value, str):
        return [item for item in re.split(r"[,;\s]+", value.strip()) if item]
    return []

def workspace_id(worker):
    candidates = []
    for key in ("skillWorkspaceIds", "skill_workspace_ids", "allowedWorkspaceIds", "allowed_workspace_ids"):
        candidates.extend(clean_list(worker.get(key)))
    normalized = []
    for item in candidates:
        text = clean(item).lower()
        if text in ("", "*", "all"):
            continue
        if text.startswith("workspace:"):
            text = text.split(":", 1)[1]
        text = re.sub(r"[^a-z0-9_-]+", "-", text).strip("-")[:80]
        if text and text not in normalized:
            normalized.append(text)
    if len(normalized) == 1:
        return normalized[0]
    if "owner" in normalized:
        return "owner"
    return "+".join(sorted(normalized)) or "owner"

def security_level(worker):
    text = clean(worker.get("securityLevel") or worker.get("security_level")).lower().replace("_", "-")
    if text in ("owner", "owner-maintenance", "maintenance", "admin", "high", "high-privilege"):
        return "owner-maintenance"
    return "user"

def provider(worker):
    return clean(worker.get("provider") or worker.get("provider_id")) or "openai-codex"

def template_key(worker):
    return "|".join([workspace_id(worker), security_level(worker), provider(worker)])

try:
    manifest = json.load(open(manifest_path, encoding="utf-8-sig"))
except Exception:
    print(",".join(selected_profiles))
    raise SystemExit(0)

workers = []
selected_keys = set()
for worker in manifest.get("workers") or []:
    if worker.get("enabled") is False:
        continue
    profile = clean(worker.get("profile") or worker.get("name"))
    if not re.match(r"^(lowgw|grokgw|deepseekgw)\d+$", profile, re.I):
        continue
    key = template_key(worker)
    workers.append((profile, key))
    if profile in selected_set:
        selected_keys.add(key)

if not selected_keys:
    print(",".join(selected_profiles))
    raise SystemExit(0)

peers = []
seen = set()
for profile, key in workers:
    if key not in selected_keys or profile in seen:
        continue
    seen.add(profile)
    peers.append(profile)

print(",".join(peers or selected_profiles))
PY
}

gateway_configure_profiles="${gateway_start_profiles}"
if [ -n "$gateway_start_profiles" ]; then
  expanded_configure_profiles="$(template_peer_profiles_for_selection "$gateway_start_profiles" || true)"
  if [ -n "$expanded_configure_profiles" ]; then
    gateway_configure_profiles="$expanded_configure_profiles"
  fi
fi

run_configure_low_gateways() {
  if [ -n "$gateway_configure_profiles" ]; then
    if [ "$gateway_configure_profiles" != "$gateway_start_profiles" ]; then
      log_step "lowgw-configure-template-peers requested=${gateway_start_profiles} configure=${gateway_configure_profiles}"
    fi
    HERMES_GATEWAY_REQUEST_WORKSPACE_ID="$gateway_request_workspace_id" HERMES_GATEWAY_START_PROFILES="$gateway_configure_profiles" bash "$configure_low_gateway_script"
    return
  fi
  HERMES_GATEWAY_REQUEST_WORKSPACE_ID="$gateway_request_workspace_id" bash "$configure_low_gateway_script"
}

if is_gateway_stop_only; then
  log_step "lowgw-configure-skipped reason=stop-only profiles=${gateway_start_profiles:-all}"
elif ! is_force_configure && selected_gateway_profiles_ready && configure_cache_current && profile_template_sync_current; then
  log_step "lowgw-configure-skipped reason=config-current profiles=${gateway_start_profiles:-all}"
elif is_skip_configure_if_ready && [ -n "$gateway_start_profiles" ]; then
  log_step "lowgw-configure-cache-miss profiles=${gateway_start_profiles}"
  log_step "lowgw-configure-start"
  run_configure_low_gateways
  if ! write_configure_signature; then
    log_step "lowgw-configure-signature-write-failed"
  fi
  log_step "lowgw-configure-done"
else
  log_step "lowgw-configure-start"
  run_configure_low_gateways
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
    echo "WARNING: moving real low Gateway profile directory for ${profile} to ${backup_path}"
    mv "$profile_link" "$backup_path"
  fi
  ln -sfn "$expected_target" "$profile_link"
  chown -h "$worker_user:$worker_user" "$profile_link" || true
}

verify_gateway_profile() {
  local profile="$1"
  local profile_link="$worker_home_dir/profiles/$profile"
  local expected_target="$gateway_worker_root/telemetry/profiles/$profile"
  local expected_skill_store=""
  local expected_memory_store=""
  local skill_dir=""
  local memory_dir=""
  local resolved_profile=""
  local resolved_expected=""
  local resolved_skills=""
  local resolved_skill_store=""
  local resolved_memories=""
  local resolved_memory_store=""

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
  expected_skill_store="$(manifest_skill_store_for_profile "$profile")"
  if [ -z "$expected_skill_store" ]; then
    echo "missing Skill Store mapping for low gateway profile: $profile" >&2
    exit 1
  fi
  install -d -m 700 -o "$worker_user" -g "$worker_user" "$expected_skill_store"
  skill_dir="$expected_target/skills"
  resolved_skill_store="$(readlink -f "$expected_skill_store" || true)"
  resolved_skills="$(readlink -f "$skill_dir" 2>/dev/null || true)"
  if [ -z "$resolved_skills" ] || [ "$resolved_skills" != "$resolved_skill_store" ]; then
    local stamp
    local backup_root
    stamp="$(date +%Y%m%d-%H%M%S)"
    backup_root="$expected_target/skill-store-backups"
    install -d -m 700 -o "$worker_user" -g "$worker_user" "$backup_root"
    if [ -e "$skill_dir" ] || [ -L "$skill_dir" ]; then
      mv "$skill_dir" "$backup_root/skills-before-workspace-link-${stamp}"
    fi
    ln -sfn "$expected_skill_store" "$skill_dir"
    chown -h "$worker_user:$worker_user" "$skill_dir" || true
  fi
  expected_memory_store="$(manifest_memory_store_for_profile "$profile")"
  if [ -z "$expected_memory_store" ]; then
    echo "missing memory store mapping for low gateway profile: $profile" >&2
    exit 1
  fi
  install -d -m 700 -o "$worker_user" -g "$worker_user" "$expected_memory_store"
  memory_dir="$expected_target/memories"
  resolved_memory_store="$(readlink -f "$expected_memory_store" || true)"
  resolved_memories="$(readlink -f "$memory_dir" 2>/dev/null || true)"
  if [ -z "$resolved_memories" ] || [ "$resolved_memories" != "$resolved_memory_store" ]; then
    local stamp
    local backup_root
    stamp="$(date +%Y%m%d-%H%M%S)"
    backup_root="$expected_target/memory-store-backups"
    install -d -m 700 -o "$worker_user" -g "$worker_user" "$backup_root"
    if [ -e "$memory_dir" ] || [ -L "$memory_dir" ]; then
      mv "$memory_dir" "$backup_root/memories-before-workspace-link-${stamp}"
    fi
    ln -sfn "$expected_memory_store" "$memory_dir"
    chown -h "$worker_user:$worker_user" "$memory_dir" || true
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
