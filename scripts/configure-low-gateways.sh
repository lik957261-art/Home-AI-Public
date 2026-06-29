#!/usr/bin/env bash
set -euo pipefail

worker_user="${HERMES_LOW_GATEWAY_USER:-hermes}"
worker_home="/home/$worker_user"
worker_home_dir="$worker_home/.hermes"
gateway_worker_root="${HERMES_GATEWAY_WORKER_ROOT:-/mnt/c/ProgramData/HermesMobile/gateway-worker}"
gateway_pool_manifest_path="${HERMES_GATEWAY_POOL_MANIFEST_PATH:-/mnt/c/ProgramData/HermesMobile/data/gateway-pool-manifest.json}"
telemetry_profiles_root="${HERMES_LOW_GATEWAY_TELEMETRY_PROFILES_ROOT:-$gateway_worker_root/telemetry/profiles}"
profile_auth_seed_root="${HERMES_LOW_GATEWAY_PROFILE_AUTH_ROOT:-$gateway_worker_root/profile-auth}"
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
shared_auth_mode="${HERMES_LOW_GATEWAY_SHARED_AUTH_MODE:-shared-root}"
shared_auth_default_root="${HERMES_LOW_GATEWAY_SHARED_AUTH_ROOT:-$telemetry_profiles_root/shared-auth}"
shared_auth_path="${HERMES_LOW_GATEWAY_SHARED_AUTH_PATH:-$shared_auth_default_root/auth.json}"
shared_auth_lock_path="${HERMES_LOW_GATEWAY_SHARED_AUTH_LOCK_PATH:-$shared_auth_default_root/auth.lock}"
grok_auth_default_root="${HERMES_GROK_GATEWAY_AUTH_ROOT:-$shared_auth_default_root}"
grok_auth_path="${HERMES_GROK_GATEWAY_AUTH_PATH:-$grok_auth_default_root/auth.json}"
grok_auth_lock_path="${HERMES_GROK_GATEWAY_AUTH_LOCK_PATH:-$grok_auth_default_root/auth.lock}"
legacy_shared_auth_path="$worker_home_dir/auth.json"
legacy_shared_auth_lock_path="$worker_home_dir/auth.lock"
shared_auth_source_profile="${HERMES_LOW_GATEWAY_SHARED_AUTH_SOURCE_PROFILE:-}"
shared_auth_seed_path="${HERMES_LOW_GATEWAY_SHARED_AUTH_SEED_PATH:-$profile_auth_seed_root/shared/auth.json}"
mobile_app_root="${HERMES_MOBILE_APP_ROOT:-/mnt/c/ProgramData/HermesMobile/app}"
gateway_profile_template_builder_script="${HERMES_GATEWAY_PROFILE_TEMPLATE_BUILDER_SCRIPT:-$mobile_app_root/scripts/build-gateway-profile-template.js}"
weather_plugin_source="${HERMES_MOBILE_WEATHER_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-weather}"
weather_plugin_target="$worker_home_dir/plugins/hermes-mobile-weather"
web_plugin_source="${HERMES_MOBILE_WEB_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-web}"
web_plugin_target="$worker_home_dir/plugins/hermes-mobile-web"
http_plugin_source="${HERMES_MOBILE_HTTP_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-http}"
http_plugin_target="$worker_home_dir/plugins/hermes-mobile-http"
current_environment_plugin_source="${HERMES_MOBILE_CURRENT_ENVIRONMENT_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-current-environment}"
current_environment_plugin_target="$worker_home_dir/plugins/hermes-mobile-current-environment"
docx_plugin_source="${HERMES_MOBILE_DOCX_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-docx}"
docx_plugin_target="$worker_home_dir/plugins/hermes-mobile-docx"
pptx_plugin_source="${HERMES_MOBILE_PPTX_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-pptx}"
pptx_plugin_target="$worker_home_dir/plugins/hermes-mobile-pptx"
pdf_plugin_source="${HERMES_MOBILE_PDF_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-pdf}"
pdf_plugin_target="$worker_home_dir/plugins/hermes-mobile-pdf"
audio_plugin_source="${HERMES_MOBILE_AUDIO_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-audio}"
audio_plugin_target="$worker_home_dir/plugins/hermes-mobile-audio"
archive_plugin_source="${HERMES_MOBILE_ARCHIVE_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-archive}"
archive_plugin_target="$worker_home_dir/plugins/hermes-mobile-archive"
image_plugin_source="${HERMES_MOBILE_IMAGE_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-image}"
image_plugin_target="$worker_home_dir/plugins/hermes-mobile-image"
video_plugin_source="${HERMES_MOBILE_VIDEO_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-video}"
video_plugin_target="$worker_home_dir/plugins/hermes-mobile-video"
cronjob_plugin_source="${HERMES_MOBILE_CRONJOB_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-cronjob}"
cronjob_plugin_target="$worker_home_dir/plugins/hermes-mobile-cronjob"
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
detect_windows_host_gateway() {
  ip route 2>/dev/null | awk '/^default[[:space:]]/ { print $3; exit }'
}
windows_host_gateway="$(detect_windows_host_gateway || true)"
default_finance_mcp_api_base_url="http://127.0.0.1:8791"
default_note_mcp_api_base_url="http://127.0.0.1:4181"
default_health_mcp_api_base_url="http://127.0.0.1:4877"
default_growth_mcp_api_base_url="http://127.0.0.1:4881"
default_moira_mcp_api_base_url="http://127.0.0.1:4174"
default_email_mcp_api_base_url="http://127.0.0.1:5175"
if [[ "$gateway_worker_root" == /mnt/* ]] && [ -n "$windows_host_gateway" ]; then
  default_finance_mcp_api_base_url="http://${windows_host_gateway}:8791"
  default_note_mcp_api_base_url="http://${windows_host_gateway}:4181"
  default_health_mcp_api_base_url="http://${windows_host_gateway}:4877"
  default_growth_mcp_api_base_url="http://${windows_host_gateway}:4881"
  default_moira_mcp_api_base_url="http://${windows_host_gateway}:4174"
  default_email_mcp_api_base_url="http://${windows_host_gateway}:5175"
fi
finance_mcp_api_base_url="${HERMES_MOBILE_FINANCE_MCP_API_BASE_URL:-$default_finance_mcp_api_base_url}"
finance_mcp_schema_probe_timeout_seconds="${HERMES_MOBILE_FINANCE_MCP_SCHEMA_PROBE_TIMEOUT_SECONDS:-3}"
note_mcp_api_base_url="${HERMES_MOBILE_NOTE_MCP_API_BASE_URL:-$default_note_mcp_api_base_url}"
health_mcp_api_base_url="${HERMES_MOBILE_HEALTH_MCP_API_BASE_URL:-$default_health_mcp_api_base_url}"
growth_mcp_api_base_url="${HERMES_MOBILE_GROWTH_MCP_API_BASE_URL:-$default_growth_mcp_api_base_url}"
moira_mcp_api_base_url="${HERMES_MOBILE_MOIRA_MCP_API_BASE_URL:-$default_moira_mcp_api_base_url}"
moira_mcp_schema_probe_timeout_seconds="${HERMES_MOBILE_MOIRA_MCP_SCHEMA_PROBE_TIMEOUT_SECONDS:-3}"
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
gateway_start_profiles="${HERMES_GATEWAY_START_PROFILES:-}"

safe_request_workspace_id() {
  local value="${1:-}"
  value="${value#workspace:}"
  if [[ "$value" =~ ^[A-Za-z0-9_-]{1,80}$ ]]; then
    printf '%s' "${value,,}"
  fi
}

gateway_request_workspace_id="$(safe_request_workspace_id "${HERMES_GATEWAY_REQUEST_WORKSPACE_ID:-}")"

write_materialized_identity() {
  local identity_dir="$1"
  local profile="$2"
  local workspace_id="$3"
  local permission_tier="$4"
  local provider="$5"
  python3 - "$identity_dir" "$profile" "$workspace_id" "$permission_tier" "$provider" <<'PY' 2>/dev/null || true
import json
import re
import sys
from pathlib import Path

identity_dir, profile, workspace_id, permission_tier, provider = sys.argv[1:6]

def safe_text(value, pattern, fallback=""):
    text = str(value or "").strip()
    if not text:
        return fallback
    if not re.match(pattern, text):
        return fallback
    return text

profile = safe_text(profile, r"^[A-Za-z0-9_-]{1,80}$")
workspace_id = safe_text(workspace_id, r"^[A-Za-z0-9_-]{1,80}$", "owner").lower()
permission_tier = safe_text(permission_tier, r"^[A-Za-z0-9_.:-]{1,80}$", "user")
provider = safe_text(provider, r"^[A-Za-z0-9_.:-]{1,80}$", "openai-codex")
if not profile:
    raise SystemExit(0)

path = Path(identity_dir) / "materialized-identity.json"
payload = {
    "profile": profile,
    "workspaceId": workspace_id,
    "skillWorkspaceId": workspace_id,
    "memoryWorkspaceId": workspace_id,
    "permissionTier": permission_tier,
    "provider": provider,
}
path.write_text(json.dumps(payload, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
PY
  chmod 600 "$identity_dir/materialized-identity.json" 2>/dev/null || true
}

profile_selected_for_configure() {
  local profile="$1"
  if [ -z "$gateway_start_profiles" ]; then
    return 0
  fi
  case ",$gateway_start_profiles," in
    *,"$profile",*) return 0 ;;
    *) return 1 ;;
  esac
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
low_gateway_profiles="$(printf '%s\n' "$gateway_specs" | awk '$1 ~ /^lowgw[0-9]+$/ { print $1 }')"

shared_auth_enabled=0
case "${shared_auth_mode,,}" in
  1|true|yes|on|shared|shared-root|root)
    shared_auth_enabled=1
    ;;
esac

if ! id -u "$worker_user" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$worker_user"
fi

install -d -m 700 -o "$worker_user" -g "$worker_user" "$worker_home_dir"
install -d -m 700 -o "$worker_user" -g "$worker_user" "$worker_home_dir/logs"
install -d -m 700 -o "$worker_user" -g "$worker_user" "$worker_home_dir/profiles"
install -d -m 700 -o "$worker_user" -g "$worker_user" "$worker_home_dir/skills"
install -d -m 700 -o "$worker_user" -g "$worker_user" "$worker_home_dir/plugins"
mkdir -p "$telemetry_profiles_root"

sqlite_integrity_ok() {
  local db_path="$1"
  if [ ! -e "$db_path" ]; then
    return 0
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo "WARNING: python3 not found; skipping low Gateway sqlite integrity check for $db_path" >&2
    return 0
  fi
  python3 - "$db_path" <<'PY'
import sqlite3
import sys

path = sys.argv[1]
try:
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=5)
    rows = conn.execute("PRAGMA integrity_check").fetchall()
    conn.close()
except Exception as exc:
    print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
    sys.exit(1)

if len(rows) == 1 and rows[0][0] == "ok":
    sys.exit(0)

first = rows[0][0] if rows else "no integrity_check result"
print(first, file=sys.stderr)
sys.exit(1)
PY
}

file_size_or_zero() {
  local file_path="$1"
  if [ ! -e "$file_path" ]; then
    echo 0
    return 0
  fi
  stat -c %s "$file_path" 2>/dev/null || echo 0
}

is_owner_connector_profile() {
  local candidate="$1"
  if [ -n "$gateway_request_workspace_id" ] && [ "$gateway_request_workspace_id" != "owner" ]; then
    return 1
  fi
  local profile
  for profile in $owner_connector_profiles; do
    if [ "$profile" = "$candidate" ]; then
      return 0
    fi
  done
  return 1
}

find_first_wardrobe_workspace_root() {
  local workspace_id="${1:-}"
  local drive_root="${2:-$wardrobe_user_drive_root}"
  python3 - "$workspace_id" "$drive_root" <<'PY' 2>/dev/null || true
from pathlib import Path
import sys

workspace_id = sys.argv[1]
drive_root = Path(sys.argv[2])
user_root = drive_root / workspace_id
if not user_root.exists():
    raise SystemExit(0)
matches = sorted(user_root.rglob(".hermes-wardrobe/config.json"))
if not matches:
    raise SystemExit(0)
print(matches[0].parent.parent.as_posix())
PY
}

find_first_finance_workspace_root() {
  local workspace_id="${1:-}"
  local drive_root="${2:-$finance_user_drive_root}"
  python3 - "$workspace_id" "$drive_root" <<'PY' 2>/dev/null || true
from pathlib import Path
import sys

workspace_id = sys.argv[1]
drive_root = Path(sys.argv[2])
user_root = drive_root / workspace_id
if not user_root.exists():
    raise SystemExit(0)
config = user_root / ".hermes-finance" / "config.json"
key_dir = config.parent
if config.exists() and ((key_dir / "access-key.txt").exists() or (key_dir / "workspace-key.txt").exists()):
    print(user_root.as_posix())
PY
}

finance_mcp_schema_ready() {
  local workspace_root="${1:-}"
  local api_base_url="${2:-$finance_mcp_api_base_url}"
  local timeout_seconds="${3:-$finance_mcp_schema_probe_timeout_seconds}"
  python3 - "$workspace_root" "$api_base_url" "$timeout_seconds" <<'PY' 2>/dev/null
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

workspace_root = Path(sys.argv[1])
api_base_url = str(sys.argv[2] or "").rstrip("/")
try:
    timeout_seconds = max(1.0, min(15.0, float(sys.argv[3] or "3")))
except Exception:
    timeout_seconds = 3.0

config_dir = workspace_root / ".hermes-finance"
config_path = config_dir / "config.json"
try:
    config = json.loads(config_path.read_text(encoding="utf-8"))
except Exception:
    raise SystemExit(1)
if not isinstance(config, dict):
    raise SystemExit(1)
key_file = str(config.get("access_key_file") or config.get("accessKeyFile") or "access-key.txt").strip()
if not key_file:
    raise SystemExit(1)
key_path = Path(key_file)
if key_path.is_absolute():
    raise SystemExit(1)
resolved_key = (config_dir / key_path).resolve()
try:
    resolved_key.relative_to(config_dir.resolve())
except Exception:
    raise SystemExit(1)
try:
    workspace_key = resolved_key.read_text(encoding="utf-8").strip()
except Exception:
    raise SystemExit(1)
workspace_id = str(
    config.get("workspace_id")
    or config.get("workspaceId")
    or config.get("hermes_workspace_id")
    or config.get("hermesWorkspaceId")
    or workspace_root.name
).strip()
if not api_base_url or not workspace_id or not workspace_key:
    raise SystemExit(1)
request = urllib.request.Request(
    f"{api_base_url}/api/finance/mcp/schemas",
    headers={
        "Content-Type": "application/json",
        "X-Finance-MCP-Workspace-Id": workspace_id,
        "X-Finance-MCP-Workspace-Key": workspace_key,
    },
    method="GET",
)
try:
    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        parsed = json.loads((response.read(2 * 1024 * 1024) or b"{}").decode("utf-8"))
except urllib.error.HTTPError:
    raise SystemExit(1)
except Exception:
    raise SystemExit(1)
schemas = parsed.get("schemas") if isinstance(parsed, dict) else None
if not isinstance(schemas, list) or not schemas:
    raise SystemExit(1)
if not any(isinstance(item, dict) and str(item.get("name") or "").startswith("finance.") for item in schemas):
    raise SystemExit(1)
PY
}

find_first_note_workspace_root() {
  local workspace_id="${1:-}"
  local drive_root="${2:-$note_user_drive_root}"
  python3 - "$workspace_id" "$drive_root" <<'PY' 2>/dev/null || true
from pathlib import Path
import sys
workspace_id = (sys.argv[1] or "").strip()
drive_root = Path(sys.argv[2])
if not workspace_id:
    raise SystemExit(0)
user_root = drive_root / workspace_id
if not user_root.exists():
    raise SystemExit(0)
config = user_root / ".hermes-note" / "config.json"
key = user_root / ".hermes-note" / "access-key.txt"
if config.exists() and key.exists():
    print(str(user_root))
PY
}

find_first_health_workspace_root() {
  local workspace_id="${1:-}"
  local drive_root="${2:-$health_user_drive_root}"
  python3 - "$workspace_id" "$drive_root" <<'PY' 2>/dev/null || true
from pathlib import Path
import sys
workspace_id = (sys.argv[1] or "").strip()
drive_root = Path(sys.argv[2])
if not workspace_id:
    raise SystemExit(0)
user_root = drive_root / workspace_id
if not user_root.exists():
    raise SystemExit(0)
config = user_root / ".hermes-health" / "config.json"
key = user_root / ".hermes-health" / "access-key.txt"
if config.exists() and key.exists():
    print(str(user_root))
PY
}

find_first_growth_workspace_root() {
  local workspace_id="${1:-}"
  local drive_root="${2:-$growth_user_drive_root}"
  python3 - "$workspace_id" "$drive_root" <<'PY' 2>/dev/null || true
from pathlib import Path
import sys
workspace_id = (sys.argv[1] or "").strip()
drive_root = Path(sys.argv[2])
if not workspace_id:
    raise SystemExit(0)
user_root = drive_root / workspace_id
if not user_root.exists():
    raise SystemExit(0)
config = user_root / ".hermes-growth" / "config.json"
key = user_root / ".hermes-growth" / "access-key.txt"
if config.exists() and key.exists():
    print(str(user_root))
PY
}

find_first_moira_workspace_root() {
  local workspace_id="${1:-}"
  local drive_root="${2:-$moira_user_drive_root}"
  python3 - "$workspace_id" "$drive_root" <<'PY' 2>/dev/null || true
from pathlib import Path
import json
import sys
workspace_id = (sys.argv[1] or "").strip()
drive_root = Path(sys.argv[2])
if not workspace_id:
    raise SystemExit(0)
user_root = drive_root / workspace_id
if not user_root.exists():
    raise SystemExit(0)
for config in sorted(user_root.rglob(".hermes-moira/config.json")):
    config_dir = config.parent
    try:
        parsed = json.loads(config.read_text(encoding="utf-8"))
    except Exception:
        parsed = {}
    key_name = str(parsed.get("access_key_file") or parsed.get("accessKeyFile") or "access-key.txt").strip()
    if not key_name or Path(key_name).name != key_name:
        continue
    if (config_dir / key_name).exists():
        print(config_dir.parent.as_posix())
        break
PY
}

moira_mcp_schema_ready() {
  local workspace_root="${1:-}"
  local api_base_url="${2:-$moira_mcp_api_base_url}"
  local timeout_seconds="${3:-$moira_mcp_schema_probe_timeout_seconds}"
  python3 - "$workspace_root" "$api_base_url" "$timeout_seconds" <<'PY' 2>/dev/null
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

workspace_root = Path(sys.argv[1])
api_base_url = str(sys.argv[2] or "").rstrip("/")
try:
    timeout_seconds = max(1.0, min(15.0, float(sys.argv[3] or "3")))
except Exception:
    timeout_seconds = 3.0

config_dir = workspace_root / ".hermes-moira"
config_path = config_dir / "config.json"
try:
    config = json.loads(config_path.read_text(encoding="utf-8"))
except Exception:
    raise SystemExit(1)
if not isinstance(config, dict):
    raise SystemExit(1)
key_file = str(config.get("access_key_file") or config.get("accessKeyFile") or "access-key.txt").strip()
if not key_file:
    raise SystemExit(1)
key_path = Path(key_file)
if key_path.is_absolute():
    raise SystemExit(1)
resolved_key = (config_dir / key_path).resolve()
try:
    resolved_key.relative_to(config_dir.resolve())
except Exception:
    raise SystemExit(1)
try:
    workspace_key = resolved_key.read_text(encoding="utf-8").strip()
except Exception:
    raise SystemExit(1)
workspace_id = str(
    config.get("workspace_id")
    or config.get("workspaceId")
    or config.get("hermes_workspace_id")
    or config.get("hermesWorkspaceId")
    or workspace_root.name
).strip()
if not api_base_url or not workspace_id or not workspace_key:
    raise SystemExit(1)
request = urllib.request.Request(
    f"{api_base_url}/api/moira/mcp/schemas",
    headers={
        "Content-Type": "application/json",
        "X-Moira-MCP-Workspace-Id": workspace_id,
        "X-Moira-MCP-Workspace-Key": workspace_key,
    },
    method="GET",
)
try:
    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        parsed = json.loads((response.read(2 * 1024 * 1024) or b"{}").decode("utf-8"))
except urllib.error.HTTPError:
    raise SystemExit(1)
except Exception:
    raise SystemExit(1)
schemas = parsed.get("schemas") if isinstance(parsed, dict) else None
if not isinstance(schemas, list) or not schemas:
    raise SystemExit(1)
if not any(isinstance(item, dict) and str(item.get("name") or "").startswith("moira.") for item in schemas):
    raise SystemExit(1)
PY
}

find_first_music_workspace_root() {
  local workspace_id="${1:-}"
  local drive_root="${2:-$music_user_drive_root}"
  python3 - "$workspace_id" "$drive_root" <<'PY' 2>/dev/null || true
from pathlib import Path
import sys
workspace_id = (sys.argv[1] or "").strip()
drive_root = Path(sys.argv[2])
if not workspace_id:
    raise SystemExit(0)
user_root = drive_root / workspace_id
if not user_root.exists():
    raise SystemExit(0)
config = user_root / ".hermes-music" / "config.json"
key = user_root / ".hermes-music" / "access-key.txt"
if config.exists() and key.exists():
    print(str(user_root))
PY
}

find_first_email_workspace_root() {
  local workspace_id="${1:-}"
  local drive_root="${2:-$email_user_drive_root}"
  python3 - "$workspace_id" "$drive_root" <<'PY' 2>/dev/null || true
from pathlib import Path
import sys
workspace_id = (sys.argv[1] or "").strip()
drive_root = Path(sys.argv[2])
if not workspace_id:
    raise SystemExit(0)
user_root = drive_root / workspace_id
if not user_root.exists():
    raise SystemExit(0)
config = user_root / ".hermes-email" / "config.json"
key = user_root / ".hermes-email" / "access-key.txt"
if config.exists() and key.exists():
    print(str(user_root))
PY
}

owner_wardrobe_workspace="${owner_wardrobe_workspace_override:-$(find_first_wardrobe_workspace_root owner)}"
wuping_wardrobe_workspace="${wuping_wardrobe_workspace_override:-$(find_first_wardrobe_workspace_root weixin_wuping)}"
owner_finance_workspace="${owner_finance_workspace_override:-$(find_first_finance_workspace_root owner)}"
wuping_finance_workspace="${wuping_finance_workspace_override:-$(find_first_finance_workspace_root weixin_wuping)}"
owner_note_workspace="${owner_note_workspace_override:-$(find_first_note_workspace_root owner)}"
wuping_note_workspace="${wuping_note_workspace_override:-$(find_first_note_workspace_root weixin_wuping)}"
owner_health_workspace="${owner_health_workspace_override:-$(find_first_health_workspace_root owner)}"
wuping_health_workspace="${wuping_health_workspace_override:-$(find_first_health_workspace_root weixin_wuping)}"
owner_growth_workspace="${owner_growth_workspace_override:-$(find_first_growth_workspace_root owner)}"
wuping_growth_workspace="${wuping_growth_workspace_override:-$(find_first_growth_workspace_root weixin_wuping)}"
owner_moira_workspace="$(find_first_moira_workspace_root owner)"
owner_music_workspace="$(find_first_music_workspace_root owner)"
if [ -z "$owner_music_workspace" ] && [ -d "$music_user_drive_root/owner" ]; then
  owner_music_workspace="$music_user_drive_root/owner"
fi
owner_email_workspace="${owner_email_workspace_override:-$(find_first_email_workspace_root owner)}"
wuping_email_workspace="${wuping_email_workspace_override:-$(find_first_email_workspace_root weixin_wuping)}"

skill_store_for_gateway_profile() {
  local profile="$1"
  python3 - "$gateway_pool_manifest_path" "$profile" "$owner_skill_store" "$skill_profiles_root" "$gateway_request_workspace_id" <<'PY' 2>/dev/null || printf '%s\n' "$owner_skill_store"
import json
import re
import sys

manifest_path, profile, owner_skill_store, skill_profiles_root, request_workspace = sys.argv[1:6]

def clean_workspace_id(value):
    text = str(value or "").strip().lower()
    if text.startswith("workspace:"):
        text = text.split(":", 1)[1]
    text = re.sub(r"[^a-z0-9_-]+", "-", text).strip("-")
    return text[:80]

request_workspace = clean_workspace_id(request_workspace)
if request_workspace and request_workspace not in ("owner", "*"):
    print(f"{skill_profiles_root.rstrip('/')}/{request_workspace}/skills")
    raise SystemExit(0)
if request_workspace == "owner":
    print(owner_skill_store)
    raise SystemExit(0)

try:
    data = json.load(open(manifest_path, encoding="utf-8"))
except Exception:
    print(owner_skill_store)
    raise SystemExit(0)

target = ""
for worker in data.get("workers") or []:
    worker_profile = str(worker.get("profile") or worker.get("name") or "").strip()
    if worker_profile != profile:
        continue
    skill_workspace_ids = worker.get("skillWorkspaceIds") or worker.get("skill_workspace_ids") or []
    if isinstance(skill_workspace_ids, str):
        skill_workspace_ids = [item.strip() for item in skill_workspace_ids.split(",") if item.strip()]
    private_ids = [clean_workspace_id(item) for item in skill_workspace_ids if clean_workspace_id(item) not in ("", "owner", "*")]
    if len(private_ids) == 1:
        target = private_ids[0]
        break
    skill_profile = str(worker.get("skillProfile") or worker.get("skill_profile") or "").strip()
    if skill_profile.lower().startswith("workspace:"):
        target = clean_workspace_id(skill_profile)
        break
    break

if target:
    print(f"{skill_profiles_root.rstrip('/')}/{target}/skills")
else:
    print(owner_skill_store)
PY
}

memory_store_for_gateway_profile() {
  local profile="$1"
  python3 - "$gateway_pool_manifest_path" "$profile" "$owner_skill_store" "$skill_profiles_root" "$gateway_request_workspace_id" <<'PY' 2>/dev/null || printf '%s\n' "$(dirname "$owner_skill_store")/memories"
import json
import re
import sys

manifest_path, profile, owner_skill_store, skill_profiles_root, request_workspace = sys.argv[1:6]

def clean_workspace_id(value):
    text = str(value or "").strip().lower()
    if text.startswith("workspace:"):
        text = text.split(":", 1)[1]
    text = re.sub(r"[^a-z0-9_-]+", "-", text).strip("-")
    return text[:80]

owner_memory_store = f"{owner_skill_store.rstrip('/').rsplit('/', 1)[0]}/memories"
request_workspace = clean_workspace_id(request_workspace)
if request_workspace and request_workspace not in ("owner", "*"):
    print(f"{skill_profiles_root.rstrip('/')}/{request_workspace}/memories")
    raise SystemExit(0)
if request_workspace == "owner":
    print(owner_memory_store)
    raise SystemExit(0)

try:
    data = json.load(open(manifest_path, encoding="utf-8"))
except Exception:
    print(owner_memory_store)
    raise SystemExit(0)

target = ""
for worker in data.get("workers") or []:
    worker_profile = str(worker.get("profile") or worker.get("name") or "").strip()
    if worker_profile != profile:
        continue
    skill_workspace_ids = worker.get("skillWorkspaceIds") or worker.get("skill_workspace_ids") or []
    if isinstance(skill_workspace_ids, str):
        skill_workspace_ids = [item.strip() for item in skill_workspace_ids.split(",") if item.strip()]
    private_ids = [clean_workspace_id(item) for item in skill_workspace_ids if clean_workspace_id(item) not in ("", "owner", "*")]
    if len(private_ids) == 1:
        target = private_ids[0]
        break
    skill_profile = str(worker.get("skillProfile") or worker.get("skill_profile") or "").strip()
    if skill_profile.lower().startswith("workspace:"):
        target = clean_workspace_id(skill_profile)
        break
    break

if target:
    print(f"{skill_profiles_root.rstrip('/')}/{target}/memories")
else:
    print(owner_memory_store)
PY
}

workspace_id_for_gateway_profile() {
  local profile="$1"
  python3 - "$gateway_pool_manifest_path" "$profile" "$gateway_request_workspace_id" <<'PY' 2>/dev/null || true
import json
import re
import sys

manifest_path, profile, request_workspace = sys.argv[1:4]

def clean_workspace_id(value):
    text = str(value or "").strip().lower()
    if text.startswith("workspace:"):
        text = text.split(":", 1)[1]
    text = re.sub(r"[^a-z0-9_-]+", "-", text).strip("-")
    return text[:80]

request_workspace = clean_workspace_id(request_workspace)
if request_workspace and request_workspace not in ("*",):
    print(request_workspace)
    raise SystemExit(0)

try:
    data = json.load(open(manifest_path, encoding="utf-8"))
except Exception:
    raise SystemExit(0)

for worker in data.get("workers") or []:
    worker_profile = str(worker.get("profile") or worker.get("name") or "").strip()
    if worker_profile != profile:
        continue
    candidates = []
    for key in ("skillWorkspaceIds", "skill_workspace_ids", "allowedWorkspaceIds", "allowed_workspace_ids"):
        raw = worker.get(key) or []
        if isinstance(raw, str):
            raw = [item.strip() for item in raw.split(",") if item.strip()]
        candidates.extend(clean_workspace_id(item) for item in raw)
    skill_profile = str(worker.get("skillProfile") or worker.get("skill_profile") or "").strip()
    if skill_profile.lower().startswith("workspace:"):
        candidates.insert(0, clean_workspace_id(skill_profile))
    private_ids = [item for item in candidates if item not in ("", "owner", "*")]
    unique = []
    for item in private_ids:
        if item not in unique:
            unique.append(item)
    if len(unique) == 1:
        print(unique[0])
    break
PY
}

ensure_low_gateway_skill_link() {
  local profile="$1"
  local skill_dir="$2"
  local target_skill_store
  target_skill_store="$(skill_store_for_gateway_profile "$profile")"
  local parent
  parent="$(dirname "$skill_dir")"
  install -d -m 700 "$target_skill_store"
  if [ -L "$skill_dir" ] && [ "$(readlink -f "$skill_dir")" = "$(readlink -f "$target_skill_store")" ]; then
    return 0
  fi
  if [ -e "$skill_dir" ] || [ -L "$skill_dir" ]; then
    local stamp
    local backup_root
    stamp="$(date +%Y%m%d-%H%M%S)"
    backup_root="$parent/skill-store-backups"
    install -d -m 700 "$backup_root"
    mv "$skill_dir" "$backup_root/skills-before-profile-link-${stamp}"
  fi
  ln -s "$target_skill_store" "$skill_dir"
}

ensure_low_gateway_memory_link() {
  local profile="$1"
  local memory_dir="$2"
  link_low_gateway_profile_subdir "$memory_dir" "$(memory_store_for_gateway_profile "$profile")" "memories"
}

link_low_gateway_profile_subdir() {
  local source_dir="$1"
  local target_dir="$2"
  local label="$3"
  local parent
  parent="$(dirname "$source_dir")"
  install -d -m 700 "$target_dir"
  if [ -L "$source_dir" ] && [ "$(readlink -f "$source_dir")" = "$(readlink -f "$target_dir")" ]; then
    return 0
  fi
  if [ -e "$source_dir" ] || [ -L "$source_dir" ]; then
    local stamp
    local backup_root
    stamp="$(date +%Y%m%d-%H%M%S)"
    backup_root="$parent/profile-link-backups"
    install -d -m 700 "$backup_root"
    mv "$source_dir" "$backup_root/${label}-before-profile-link-${stamp}"
  fi
  ln -sfn "$target_dir" "$source_dir"
}

deepseek_companion_low_profile() {
  local profile="$1"
  if [[ "$profile" =~ ^deepseekgw([0-9]+)$ ]]; then
    if is_owner_connector_profile "$profile"; then
      printf '%s\n' "lowgw1"
    else
      printf 'lowgw%s\n' "${BASH_REMATCH[1]}"
    fi
  fi
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

render_gateway_template_yaml() {
  local output_path="$1"
  shift
  local script_arg
  script_arg="$(gateway_template_builder_script_arg)" || return 1
  local temp_path="${output_path}.template.$$"
  if "$gateway_template_node" "$script_arg" --render-config-yaml "$@" > "$temp_path" < /dev/null; then
    mv "$temp_path" "$output_path"
    echo "gateway-template-rendered output=${output_path}"
    return 0
  fi
  rm -f "$temp_path"
  return 1
}

quarantine_sqlite_files() {
  local db_path="$1"
  local backup_dir="$2"
  local include_db="$3"
  mkdir -p "$backup_dir"
  if [ "$include_db" = "1" ] && [ -e "$db_path" ]; then
    mv "$db_path" "$backup_dir/"
  fi
  for suffix in "-wal" "-shm"; do
    local sidecar="${db_path}${suffix}"
    if [ -e "$sidecar" ]; then
      mv "$sidecar" "$backup_dir/"
    fi
  done
  chown -R "$worker_user:$worker_user" "$backup_dir" 2>/dev/null || true
}

repair_low_gateway_sqlite() {
  local profile="$1"
  local profile_dir="$2"
  local db_name="$3"
  local db_path="${profile_dir}/${db_name}"
  if [ ! -e "$db_path" ]; then
    return 0
  fi

  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"

  if ! sqlite_integrity_ok "$db_path"; then
    local backup_dir="${profile_dir}/sqlite-quarantine-${stamp}"
    echo "WARNING: quarantining malformed low Gateway sqlite DB for ${profile}: ${db_name}" >&2
    quarantine_sqlite_files "$db_path" "$backup_dir" 1
    return 0
  fi

  local wal_path="${db_path}-wal"
  local shm_path="${db_path}-shm"
  local wal_size
  local shm_size
  wal_size="$(file_size_or_zero "$wal_path")"
  shm_size="$(file_size_or_zero "$shm_path")"
  if [ -e "$shm_path" ] && [ "$shm_size" -gt 0 ] && [ "$shm_size" -lt 32768 ] && [ "$wal_size" -eq 0 ]; then
    local backup_dir="${profile_dir}/sqlite-sidecar-quarantine-${stamp}"
    echo "WARNING: quarantining invalid low Gateway sqlite sidecars for ${profile}: ${db_name}" >&2
    quarantine_sqlite_files "$db_path" "$backup_dir" 0
  fi
}

prepare_low_gateway_profile_link() {
  local profile="$1"
  local profile_link="$2"
  if [ -L "$profile_link" ]; then
    rm -f "$profile_link"
    return 0
  fi
  if [ -e "$profile_link" ]; then
    local stamp
    local backup_root
    local backup_path
    stamp="$(date +%Y%m%d-%H%M%S)"
    backup_root="$worker_home_dir/profile-directory-backups"
    backup_path="${backup_root}/${profile}-${stamp}"
    install -d -m 700 -o "$worker_user" -g "$worker_user" "$backup_root"
    echo "WARNING: moving real low Gateway profile directory for ${profile} to ${backup_path}"
    mv "$profile_link" "$backup_path"
  fi
}

install -d -m 700 -o "$worker_user" -g "$worker_user" "$(dirname "$shared_auth_path")"
install -d -m 700 -o "$worker_user" -g "$worker_user" "$(dirname "$grok_auth_path")"

if [ "$shared_auth_path" != "$legacy_shared_auth_path" ] && [ ! -s "$shared_auth_path" ] && [ -s "$legacy_shared_auth_path" ]; then
  install -m 600 -o "$worker_user" -g "$worker_user" "$legacy_shared_auth_path" "$shared_auth_path"
fi
if [ "$shared_auth_lock_path" != "$legacy_shared_auth_lock_path" ] && [ ! -e "$shared_auth_lock_path" ] && [ -e "$legacy_shared_auth_lock_path" ]; then
  install -m 600 -o "$worker_user" -g "$worker_user" "$legacy_shared_auth_lock_path" "$shared_auth_lock_path" || true
fi

if [ ! -s "$shared_auth_path" ] && [ -s "$gateway_worker_root/secrets/auth.json" ]; then
  install -m 600 -o "$worker_user" -g "$worker_user" "$gateway_worker_root/secrets/auth.json" "$shared_auth_path"
fi
install -m 600 -o "$worker_user" -g "$worker_user" "$gateway_worker_root/secrets/low-gateway-api-key.secret" "$worker_home_dir/api-server-key.secret"

newest_profile_auth=""
newest_profile_auth_mtime=0
while IFS= read -r profile; do
  if [ -z "$profile" ]; then
    continue
  fi
  candidate_auth="${telemetry_profiles_root}/${profile}/auth.json"
  if [ -s "$candidate_auth" ]; then
    candidate_mtime="$(stat -c %Y "$candidate_auth" 2>/dev/null || echo 0)"
    if [ "$candidate_mtime" -gt "$newest_profile_auth_mtime" ]; then
      newest_profile_auth="$candidate_auth"
      newest_profile_auth_mtime="$candidate_mtime"
    fi
  fi
done <<< "$low_gateway_profiles"

if [ "$shared_auth_enabled" = "1" ] && [ -n "$shared_auth_source_profile" ]; then
  profile_shared_auth="${telemetry_profiles_root}/${shared_auth_source_profile}/auth.json"
  seed_shared_auth="${profile_auth_seed_root}/${shared_auth_source_profile}/auth.json"
  if [ -s "$profile_shared_auth" ]; then
    install -m 600 -o "$worker_user" -g "$worker_user" "$profile_shared_auth" "$shared_auth_path"
  elif [ -s "$seed_shared_auth" ]; then
    install -m 600 -o "$worker_user" -g "$worker_user" "$seed_shared_auth" "$shared_auth_path"
  else
    echo "Shared low Gateway auth source profile not found: $shared_auth_source_profile" >&2
    exit 2
  fi
fi

if [ "$shared_auth_enabled" = "1" ] && [ -n "$newest_profile_auth" ]; then
  shared_auth_mtime="$(stat -c %Y "$shared_auth_path" 2>/dev/null || echo 0)"
  newest_profile_auth_real="$(readlink -f "$newest_profile_auth" 2>/dev/null || echo "$newest_profile_auth")"
  shared_auth_real="$(readlink -f "$shared_auth_path" 2>/dev/null || echo "$shared_auth_path")"
  if [ "$newest_profile_auth_real" != "$shared_auth_real" ] && [ "$newest_profile_auth_mtime" -gt "$shared_auth_mtime" ]; then
    install -m 600 -o "$worker_user" -g "$worker_user" "$newest_profile_auth" "$shared_auth_path"
  fi
fi

if [ "$shared_auth_enabled" = "1" ] && [ ! -s "$shared_auth_path" ] && [ -s "$shared_auth_seed_path" ]; then
  install -m 600 -o "$worker_user" -g "$worker_user" "$shared_auth_seed_path" "$shared_auth_path"
fi

if [ "$grok_gateway_count" -gt 0 ] && [ ! -s "$grok_auth_path" ] && [ -s "$shared_auth_path" ]; then
  install -m 600 -o "$worker_user" -g "$worker_user" "$shared_auth_path" "$grok_auth_path"
fi
if [ "$grok_gateway_count" -gt 0 ] && [ ! -e "$grok_auth_lock_path" ]; then
  install -m 600 -o "$worker_user" -g "$worker_user" /dev/null "$grok_auth_lock_path" || touch "$grok_auth_lock_path"
  chown "$worker_user:$worker_user" "$grok_auth_lock_path" 2>/dev/null || true
  chmod 600 "$grok_auth_lock_path" 2>/dev/null || true
fi
if [ "$shared_auth_enabled" = "1" ]; then
  shared_auth_real="$(readlink -f "$shared_auth_path" 2>/dev/null || echo "$shared_auth_path")"
  legacy_auth_real="$(readlink -f "$legacy_shared_auth_path" 2>/dev/null || echo "$legacy_shared_auth_path")"
  if [ "$legacy_auth_real" != "$shared_auth_real" ]; then
    if [ -s "$legacy_shared_auth_path" ] && [ ! -L "$legacy_shared_auth_path" ]; then
      legacy_backup="${legacy_shared_auth_path}.profile-local-backup-$(date +%Y%m%d-%H%M%S)"
      cp -p "$legacy_shared_auth_path" "$legacy_backup" || true
      chown "$worker_user:$worker_user" "$legacy_backup" 2>/dev/null || true
      chmod 600 "$legacy_backup" 2>/dev/null || true
    fi
    rm -f "$legacy_shared_auth_path"
    ln -s "$shared_auth_path" "$legacy_shared_auth_path"
  fi
  shared_lock_real="$(readlink -f "$shared_auth_lock_path" 2>/dev/null || echo "$shared_auth_lock_path")"
  legacy_lock_real="$(readlink -f "$legacy_shared_auth_lock_path" 2>/dev/null || echo "$legacy_shared_auth_lock_path")"
  if [ "$legacy_lock_real" != "$shared_lock_real" ]; then
    if [ -e "$legacy_shared_auth_lock_path" ] && [ ! -L "$legacy_shared_auth_lock_path" ]; then
      legacy_lock_backup="${legacy_shared_auth_lock_path}.profile-local-backup-$(date +%Y%m%d-%H%M%S)"
      cp -p "$legacy_shared_auth_lock_path" "$legacy_lock_backup" || true
      chown "$worker_user:$worker_user" "$legacy_lock_backup" 2>/dev/null || true
      chmod 600 "$legacy_lock_backup" 2>/dev/null || true
    fi
    rm -f "$legacy_shared_auth_lock_path"
    ln -s "$shared_auth_lock_path" "$legacy_shared_auth_lock_path"
  fi
fi

missing_auth_profiles=()
weather_plugin_enabled=0
web_plugin_enabled=0
http_plugin_enabled=0
current_environment_plugin_enabled=0
docx_plugin_enabled=0
pptx_plugin_enabled=0
pdf_plugin_enabled=0
audio_plugin_enabled=0
archive_plugin_enabled=0
image_plugin_enabled=0
video_plugin_enabled=0
cronjob_plugin_enabled=0

if [ -f "$weather_plugin_source/plugin.yaml" ] && [ -f "$weather_plugin_source/__init__.py" ]; then
  rm -rf "$weather_plugin_target"
  cp -a "$weather_plugin_source" "$weather_plugin_target"
  chown -R "$worker_user:$worker_user" "$weather_plugin_target"
  weather_plugin_enabled=1
else
  echo "Weather plugin source not found: $weather_plugin_source" >&2
fi

if [ -f "$web_plugin_source/plugin.yaml" ] && [ -f "$web_plugin_source/__init__.py" ]; then
  rm -rf "$web_plugin_target"
  cp -a "$web_plugin_source" "$web_plugin_target"
  chown -R "$worker_user:$worker_user" "$web_plugin_target"
  web_plugin_enabled=1
else
  echo "Web plugin source not found: $web_plugin_source" >&2
fi

if [ -f "$http_plugin_source/plugin.yaml" ] && [ -f "$http_plugin_source/__init__.py" ]; then
  rm -rf "$http_plugin_target"
  cp -a "$http_plugin_source" "$http_plugin_target"
  chown -R "$worker_user:$worker_user" "$http_plugin_target"
  http_plugin_enabled=1
else
  echo "HTTP plugin source not found: $http_plugin_source" >&2
fi

if [ -f "$current_environment_plugin_source/plugin.yaml" ] && [ -f "$current_environment_plugin_source/__init__.py" ]; then
  rm -rf "$current_environment_plugin_target"
  cp -a "$current_environment_plugin_source" "$current_environment_plugin_target"
  chown -R "$worker_user:$worker_user" "$current_environment_plugin_target"
  current_environment_plugin_enabled=1
else
  echo "Current environment plugin source not found: $current_environment_plugin_source" >&2
fi

if [ -f "$docx_plugin_source/plugin.yaml" ] && [ -f "$docx_plugin_source/__init__.py" ]; then
  rm -rf "$docx_plugin_target"
  cp -a "$docx_plugin_source" "$docx_plugin_target"
  chown -R "$worker_user:$worker_user" "$docx_plugin_target"
  docx_plugin_enabled=1
else
  echo "DOCX plugin source not found: $docx_plugin_source" >&2
fi

if [ -f "$pptx_plugin_source/plugin.yaml" ] && [ -f "$pptx_plugin_source/__init__.py" ]; then
  rm -rf "$pptx_plugin_target"
  cp -a "$pptx_plugin_source" "$pptx_plugin_target"
  chown -R "$worker_user:$worker_user" "$pptx_plugin_target"
  pptx_plugin_enabled=1
else
  echo "PPTX plugin source not found: $pptx_plugin_source" >&2
fi

if [ -f "$pdf_plugin_source/plugin.yaml" ] && [ -f "$pdf_plugin_source/__init__.py" ]; then
  rm -rf "$pdf_plugin_target"
  cp -a "$pdf_plugin_source" "$pdf_plugin_target"
  chown -R "$worker_user:$worker_user" "$pdf_plugin_target"
  pdf_plugin_enabled=1
else
  echo "PDF plugin source not found: $pdf_plugin_source" >&2
fi

if [ -f "$audio_plugin_source/plugin.yaml" ] && [ -f "$audio_plugin_source/__init__.py" ]; then
  rm -rf "$audio_plugin_target"
  cp -a "$audio_plugin_source" "$audio_plugin_target"
  chown -R "$worker_user:$worker_user" "$audio_plugin_target"
  audio_plugin_enabled=1
else
  echo "Audio plugin source not found: $audio_plugin_source" >&2
fi

if [ -f "$archive_plugin_source/plugin.yaml" ] && [ -f "$archive_plugin_source/__init__.py" ]; then
  rm -rf "$archive_plugin_target"
  cp -a "$archive_plugin_source" "$archive_plugin_target"
  chown -R "$worker_user:$worker_user" "$archive_plugin_target"
  archive_plugin_enabled=1
else
  echo "Archive plugin source not found: $archive_plugin_source" >&2
fi

if [ -f "$image_plugin_source/plugin.yaml" ] && [ -f "$image_plugin_source/__init__.py" ]; then
  rm -rf "$image_plugin_target"
  cp -a "$image_plugin_source" "$image_plugin_target"
  chown -R "$worker_user:$worker_user" "$image_plugin_target"
  image_plugin_enabled=1
else
  echo "Image plugin source not found: $image_plugin_source" >&2
fi

if [ -f "$video_plugin_source/plugin.yaml" ] && [ -f "$video_plugin_source/__init__.py" ]; then
  rm -rf "$video_plugin_target"
  cp -a "$video_plugin_source" "$video_plugin_target"
  chown -R "$worker_user:$worker_user" "$video_plugin_target"
  video_plugin_enabled=1
else
  echo "Video plugin source not found: $video_plugin_source" >&2
fi
if [ -f "$cronjob_plugin_source/plugin.yaml" ] && [ -f "$cronjob_plugin_source/__init__.py" ]; then
  rm -rf "$cronjob_plugin_target"
  cp -a "$cronjob_plugin_source" "$cronjob_plugin_target"
  chown -R "$worker_user:$worker_user" "$cronjob_plugin_target"
  cronjob_plugin_enabled=1
else
  echo "Mobile cronjob plugin source not found: $cronjob_plugin_source" >&2
fi

if [ "$shared_auth_enabled" = "1" ] && [ ! -s "$shared_auth_path" ]; then
  echo "Missing shared low Gateway Codex auth at $shared_auth_path" >&2
  echo "Run hermes auth once for a low Gateway profile, then rerun with HERMES_LOW_GATEWAY_SHARED_AUTH_SOURCE_PROFILE=<profile>, or place a seed at $shared_auth_seed_path." >&2
  exit 2
fi

weather_toolset_block=""
weather_api_toolset_block=""
http_toolset_block=""
http_api_toolset_block=""
current_environment_toolset_block=""
current_environment_api_toolset_block=""
cronjob_mobile_toolset_block=""
cronjob_mobile_api_toolset_block=""
plugin_enabled_lines=""
if [ "$weather_plugin_enabled" = "1" ]; then
  weather_toolset_block="  - weather"
  weather_api_toolset_block="    - weather"
  plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-weather"$'\n'
fi
if [ "$web_plugin_enabled" = "1" ]; then
  plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-web"$'\n'
fi
if [ "$http_plugin_enabled" = "1" ]; then
  http_toolset_block="  - http"
  http_api_toolset_block="    - http"
  plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-http"$'\n'
fi
if [ "$current_environment_plugin_enabled" = "1" ]; then
  current_environment_toolset_block="  - current_environment"
  current_environment_api_toolset_block="    - current_environment"
  plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-current-environment"$'\n'
fi
if [ "$docx_plugin_enabled" = "1" ]; then
  plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-docx"$'\n'
fi
if [ "$pptx_plugin_enabled" = "1" ]; then
  plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-pptx"$'\n'
fi
if [ "$pdf_plugin_enabled" = "1" ]; then
  plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-pdf"$'\n'
fi
if [ "$audio_plugin_enabled" = "1" ]; then
  plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-audio"$'\n'
fi
if [ "$archive_plugin_enabled" = "1" ]; then
  plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-archive"$'\n'
fi
if [ "$image_plugin_enabled" = "1" ]; then
  plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-image"$'\n'
fi
if [ "$cronjob_plugin_enabled" = "1" ]; then
  cronjob_mobile_toolset_block="  - cronjob_mobile"
  cronjob_mobile_api_toolset_block="    - cronjob_mobile"
  plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-cronjob"$'\n'
fi
plugin_block="  enabled: []"
if [ -n "$plugin_enabled_lines" ]; then
  plugin_block="  enabled:
${plugin_enabled_lines%$'\n'}"
fi

if ! render_gateway_template_yaml "$worker_home_dir/config.yaml" \
  --config-kind base \
  --value "weather_plugin_enabled=$weather_plugin_enabled" \
  --value "web_plugin_enabled=$web_plugin_enabled" \
  --value "http_plugin_enabled=$http_plugin_enabled" \
  --value "current_environment_plugin_enabled=$current_environment_plugin_enabled" \
  --value "docx_plugin_enabled=$docx_plugin_enabled" \
  --value "pptx_plugin_enabled=$pptx_plugin_enabled" \
  --value "pdf_plugin_enabled=$pdf_plugin_enabled" \
  --value "audio_plugin_enabled=$audio_plugin_enabled" \
  --value "archive_plugin_enabled=$archive_plugin_enabled" \
  --value "image_plugin_enabled=$image_plugin_enabled" \
  --value "cronjob_plugin_enabled=$cronjob_plugin_enabled"; then
cat > "$worker_home_dir/config.yaml" <<YAML
model:
  default: gpt-5.5
  provider: openai-codex
  base_url: https://chatgpt.com/backend-api/codex
toolsets:
  - web
  - search
  - x_search
  - browser
  - file
  - vision
  - video
  - image_gen
  - messaging
  - tts
  - skills
  - todo
  - kanban
  - cronjob
  - memory
  - session_search
  - clarify
${weather_toolset_block}
${http_toolset_block}
${current_environment_toolset_block}
${cronjob_mobile_toolset_block}
platform_toolsets:
  api_server:
    - web
    - search
    - x_search
    - browser
    - file
    - vision
    - video
    - image_gen
    - messaging
    - tts
    - skills
    - todo
    - kanban
    - cronjob
    - memory
    - session_search
    - clarify
${weather_api_toolset_block}
${http_api_toolset_block}
${current_environment_api_toolset_block}
${cronjob_mobile_api_toolset_block}
agent:
  max_turns: 60
  reasoning_effort: medium
plugins:
${plugin_block}
YAML
fi
chmod 600 "$worker_home_dir/config.yaml" || true
chown "$worker_user:$worker_user" "$worker_home_dir/config.yaml" 2>/dev/null || true

while IFS=$'\t' read -r profile port; do
  if [[ ! "$profile" =~ ^((lowgw|deepseekgw)[0-9]+|hm-[a-z0-9-]+-(openai|deepseek)-[0-9]+)$ ]]; then
    continue
  fi
  if ! profile_selected_for_configure "$profile"; then
    continue
  fi
  profile_link="$worker_home_dir/profiles/${profile}"
  profile_dir="${telemetry_profiles_root}/${profile}"
  profile_seed="$profile_auth_seed_root/${profile}/auth.json"
  prepare_low_gateway_profile_link "$profile" "$profile_link"
  mkdir -p "$profile_dir"
  chmod 700 "$profile_dir" || true
  repair_low_gateway_sqlite "$profile" "$profile_dir" "state.db"
  repair_low_gateway_sqlite "$profile" "$profile_dir" "response_store.db"
  ln -s "$profile_dir" "$profile_link"
  companion_low_profile="$(deepseek_companion_low_profile "$profile")"
  ensure_low_gateway_memory_link "$profile" "$profile_dir/memories"
  if [ -n "$companion_low_profile" ]; then
    if is_owner_connector_profile "$profile"; then
      link_low_gateway_profile_subdir "$profile_dir/skills" "$owner_skill_store" "skills"
    else
      link_low_gateway_profile_subdir "$profile_dir/skills" "$(skill_store_for_gateway_profile "$profile")" "skills"
    fi
  else
    ensure_low_gateway_skill_link "$profile" "$profile_dir/skills"
  fi
  if [ "$weather_plugin_enabled" = "1" ]; then
    install -d -m 700 -o "$worker_user" -g "$worker_user" "$profile_dir/plugins"
    rm -rf "$profile_dir/plugins/hermes-mobile-weather"
    cp -a "$weather_plugin_target" "$profile_dir/plugins/hermes-mobile-weather"
    chown -R "$worker_user:$worker_user" "$profile_dir/plugins/hermes-mobile-weather"
  fi
  if [ "$web_plugin_enabled" = "1" ]; then
    install -d -m 700 -o "$worker_user" -g "$worker_user" "$profile_dir/plugins"
    rm -rf "$profile_dir/plugins/hermes-mobile-web"
    cp -a "$web_plugin_target" "$profile_dir/plugins/hermes-mobile-web"
    chown -R "$worker_user:$worker_user" "$profile_dir/plugins/hermes-mobile-web"
  fi
  if [ "$http_plugin_enabled" = "1" ]; then
    install -d -m 700 -o "$worker_user" -g "$worker_user" "$profile_dir/plugins"
    rm -rf "$profile_dir/plugins/hermes-mobile-http"
    cp -a "$http_plugin_target" "$profile_dir/plugins/hermes-mobile-http"
    chown -R "$worker_user:$worker_user" "$profile_dir/plugins/hermes-mobile-http"
  fi
  if [ "$current_environment_plugin_enabled" = "1" ]; then
    install -d -m 700 -o "$worker_user" -g "$worker_user" "$profile_dir/plugins"
    rm -rf "$profile_dir/plugins/hermes-mobile-current-environment"
    cp -a "$current_environment_plugin_target" "$profile_dir/plugins/hermes-mobile-current-environment"
    chown -R "$worker_user:$worker_user" "$profile_dir/plugins/hermes-mobile-current-environment"
  fi
  if [ "$docx_plugin_enabled" = "1" ]; then
    install -d -m 700 -o "$worker_user" -g "$worker_user" "$profile_dir/plugins"
    rm -rf "$profile_dir/plugins/hermes-mobile-docx"
    cp -a "$docx_plugin_target" "$profile_dir/plugins/hermes-mobile-docx"
    chown -R "$worker_user:$worker_user" "$profile_dir/plugins/hermes-mobile-docx"
  fi
  if [ "$pptx_plugin_enabled" = "1" ]; then
    install -d -m 700 -o "$worker_user" -g "$worker_user" "$profile_dir/plugins"
    rm -rf "$profile_dir/plugins/hermes-mobile-pptx"
    cp -a "$pptx_plugin_target" "$profile_dir/plugins/hermes-mobile-pptx"
    chown -R "$worker_user:$worker_user" "$profile_dir/plugins/hermes-mobile-pptx"
  fi
  if [ "$pdf_plugin_enabled" = "1" ]; then
    install -d -m 700 -o "$worker_user" -g "$worker_user" "$profile_dir/plugins"
    rm -rf "$profile_dir/plugins/hermes-mobile-pdf"
    cp -a "$pdf_plugin_target" "$profile_dir/plugins/hermes-mobile-pdf"
    chown -R "$worker_user:$worker_user" "$profile_dir/plugins/hermes-mobile-pdf"
  fi
  if [ "$audio_plugin_enabled" = "1" ]; then
    install -d -m 700 -o "$worker_user" -g "$worker_user" "$profile_dir/plugins"
    rm -rf "$profile_dir/plugins/hermes-mobile-audio"
    cp -a "$audio_plugin_target" "$profile_dir/plugins/hermes-mobile-audio"
    chown -R "$worker_user:$worker_user" "$profile_dir/plugins/hermes-mobile-audio"
  fi
  if [ "$archive_plugin_enabled" = "1" ]; then
    install -d -m 700 -o "$worker_user" -g "$worker_user" "$profile_dir/plugins"
    rm -rf "$profile_dir/plugins/hermes-mobile-archive"
    cp -a "$archive_plugin_target" "$profile_dir/plugins/hermes-mobile-archive"
    chown -R "$worker_user:$worker_user" "$profile_dir/plugins/hermes-mobile-archive"
  fi
  if [ "$image_plugin_enabled" = "1" ]; then
    install -d -m 700 -o "$worker_user" -g "$worker_user" "$profile_dir/plugins"
    rm -rf "$profile_dir/plugins/hermes-mobile-image"
    cp -a "$image_plugin_target" "$profile_dir/plugins/hermes-mobile-image"
    chown -R "$worker_user:$worker_user" "$profile_dir/plugins/hermes-mobile-image"
  fi
  if [ "$cronjob_plugin_enabled" = "1" ]; then
    install -d -m 700 -o "$worker_user" -g "$worker_user" "$profile_dir/plugins"
    rm -rf "$profile_dir/plugins/hermes-mobile-cronjob"
    cp -a "$cronjob_plugin_target" "$profile_dir/plugins/hermes-mobile-cronjob"
    chown -R "$worker_user:$worker_user" "$profile_dir/plugins/hermes-mobile-cronjob"
  fi
  weather_toolset_block=""
  weather_api_toolset_block=""
  http_toolset_block=""
  http_api_toolset_block=""
  current_environment_toolset_block=""
  current_environment_api_toolset_block=""
  cronjob_mobile_toolset_block=""
  cronjob_mobile_api_toolset_block=""
  plugin_enabled_lines=""
  if [ "$weather_plugin_enabled" = "1" ]; then
    weather_toolset_block="  - weather"
    weather_api_toolset_block="    - weather"
    plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-weather"$'\n'
  fi
  if [ "$web_plugin_enabled" = "1" ]; then
    plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-web"$'\n'
  fi
  if [ "$http_plugin_enabled" = "1" ]; then
    http_toolset_block="  - http"
    http_api_toolset_block="    - http"
    plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-http"$'\n'
  fi
  if [ "$current_environment_plugin_enabled" = "1" ]; then
    current_environment_toolset_block="  - current_environment"
    current_environment_api_toolset_block="    - current_environment"
    plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-current-environment"$'\n'
  fi
  if [ "$docx_plugin_enabled" = "1" ]; then
    plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-docx"$'\n'
  fi
  if [ "$pptx_plugin_enabled" = "1" ]; then
    plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-pptx"$'\n'
  fi
  if [ "$pdf_plugin_enabled" = "1" ]; then
    plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-pdf"$'\n'
  fi
  if [ "$audio_plugin_enabled" = "1" ]; then
    plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-audio"$'\n'
  fi
  if [ "$archive_plugin_enabled" = "1" ]; then
    plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-archive"$'\n'
  fi
  if [ "$image_plugin_enabled" = "1" ]; then
    plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-image"$'\n'
  fi
  if [ "$cronjob_plugin_enabled" = "1" ]; then
    cronjob_mobile_toolset_block="  - cronjob_mobile"
    cronjob_mobile_api_toolset_block="    - cronjob_mobile"
    plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-cronjob"$'\n'
  fi
  plugin_block="  enabled: []"
  if [ -n "$plugin_enabled_lines" ]; then
    plugin_block="  enabled:
${plugin_enabled_lines%$'\n'}"
  fi
  outlook_toolset_block=""
  outlook_api_toolset_block=""
  wardrobe_toolset_block=""
  wardrobe_api_toolset_block=""
  finance_toolset_block=""
  finance_api_toolset_block=""
  note_toolset_block=""
  note_api_toolset_block=""
  health_toolset_block=""
  health_api_toolset_block=""
  growth_toolset_block=""
  growth_api_toolset_block=""
  moira_toolset_block=""
  moira_api_toolset_block=""
  music_toolset_block=""
  music_api_toolset_block=""
  email_toolset_block=""
  email_api_toolset_block=""
  mcp_server_lines=""
  profile_wardrobe_workspace=""
  profile_workspace_id=""
  if is_owner_connector_profile "$profile"; then
    profile_wardrobe_workspace="$owner_wardrobe_workspace"
  else
    profile_workspace_id="$(workspace_id_for_gateway_profile "$profile")"
    if [ -n "$profile_workspace_id" ]; then
      profile_wardrobe_workspace="$(find_first_wardrobe_workspace_root "$profile_workspace_id")"
      if [ -z "$profile_wardrobe_workspace" ] && [ "$profile_workspace_id" = "weixin_wuping" ]; then
        profile_wardrobe_workspace="$wuping_wardrobe_workspace"
      fi
    fi
  fi
  if [ -n "$profile_wardrobe_workspace" ] && [ -f "$wardrobe_mcp_path" ]; then
    wardrobe_toolset_block="  - wardrobe"
    wardrobe_api_toolset_block="    - wardrobe"
    mcp_server_lines="${mcp_server_lines}  wardrobe:
    command: /opt/hermes-gateway-runtime/venv/bin/python
    args:
      - $wardrobe_mcp_path
      - --workspace
      - $profile_wardrobe_workspace
      - --no-workspace-override
    env:
      HERMES_HOME: $profile_link
      PYTHONPATH: /opt/hermes-gateway-runtime/official-clean
    enabled: true
    timeout: 180
    connect_timeout: 60"$'\n'
  fi
  profile_finance_workspace=""
  if is_owner_connector_profile "$profile"; then
    profile_finance_workspace="$owner_finance_workspace"
  else
    if [ -z "$profile_workspace_id" ]; then
      profile_workspace_id="$(workspace_id_for_gateway_profile "$profile")"
    fi
    if [ -n "$profile_workspace_id" ]; then
      profile_finance_workspace="$(find_first_finance_workspace_root "$profile_workspace_id")"
      if [ -z "$profile_finance_workspace" ] && [ "$profile_workspace_id" = "weixin_wuping" ]; then
        profile_finance_workspace="$wuping_finance_workspace"
      fi
    fi
  fi
  if [ -n "$profile_finance_workspace" ] && [ -f "$finance_mcp_path" ] && finance_mcp_schema_ready "$profile_finance_workspace" "$finance_mcp_api_base_url"; then
    finance_toolset_block="  - finance"
    finance_api_toolset_block="    - finance"
    mcp_server_lines="${mcp_server_lines}  finance:
    command: $finance_mcp_python
    args:
      - $finance_mcp_path
      - --workspace
      - $profile_finance_workspace
      - --no-workspace-override
      - --api-base-url
      - $finance_mcp_api_base_url
    env:
      HERMES_HOME: $profile_link
    enabled: true
    timeout: 180
    connect_timeout: 60"$'\n'
  elif [ -n "$profile_finance_workspace" ] && [ -f "$finance_mcp_path" ]; then
    echo "[WARN] Skipping finance MCP for $profile: schema probe failed for configured workspace"
  fi
  profile_note_workspace=""
  if is_owner_connector_profile "$profile"; then
    profile_note_workspace="$owner_note_workspace"
  else
    if [ -z "$profile_workspace_id" ]; then
      profile_workspace_id="$(workspace_id_for_gateway_profile "$profile")"
    fi
    if [ -n "$profile_workspace_id" ]; then
      profile_note_workspace="$(find_first_note_workspace_root "$profile_workspace_id")"
      if [ -z "$profile_note_workspace" ] && [ "$profile_workspace_id" = "weixin_wuping" ]; then
        profile_note_workspace="$wuping_note_workspace"
      fi
    fi
  fi
  if [ -n "$profile_note_workspace" ] && [ -f "$note_mcp_path" ]; then
    note_toolset_block="  - note"
    note_api_toolset_block="    - note"
    mcp_server_lines="${mcp_server_lines}  note:
    command: $note_mcp_python
    args:
      - $note_mcp_path
      - --workspace
      - $profile_note_workspace
      - --no-workspace-override
      - --api-base-url
      - $note_mcp_api_base_url
    env:
      HERMES_HOME: $profile_link
      HERMES_PROFILE: $profile
    startup_timeout: 60
    connect_timeout: 60"$'\n'
  fi
  profile_health_workspace=""
  if is_owner_connector_profile "$profile"; then
    profile_health_workspace="$owner_health_workspace"
  else
    if [ -z "$profile_workspace_id" ]; then
      profile_workspace_id="$(workspace_id_for_gateway_profile "$profile")"
    fi
    if [ -n "$profile_workspace_id" ]; then
      profile_health_workspace="$(find_first_health_workspace_root "$profile_workspace_id")"
      if [ -z "$profile_health_workspace" ] && [ "$profile_workspace_id" = "weixin_wuping" ]; then
        profile_health_workspace="$wuping_health_workspace"
      fi
    fi
  fi
  if [ -n "$profile_health_workspace" ] && [ -f "$health_mcp_path" ]; then
    health_toolset_block="  - health"
    health_api_toolset_block="    - health"
    mcp_server_lines="${mcp_server_lines}  health:
    command: $health_mcp_command
    args:
      - $health_mcp_path
      - --workspace
      - $profile_health_workspace
      - --no-workspace-override
      - --gateway-tool-names
      - --api-base-url
      - $health_mcp_api_base_url
    env:
      HERMES_HOME: $profile_link
      HERMES_PROFILE: $profile
    startup_timeout: 60
    connect_timeout: 60"$'\n'
  fi
  profile_growth_workspace=""
  if is_owner_connector_profile "$profile"; then
    profile_growth_workspace="$owner_growth_workspace"
  else
    if [ -z "$profile_workspace_id" ]; then
      profile_workspace_id="$(workspace_id_for_gateway_profile "$profile")"
    fi
    if [ -n "$profile_workspace_id" ]; then
      profile_growth_workspace="$(find_first_growth_workspace_root "$profile_workspace_id")"
      if [ -z "$profile_growth_workspace" ] && [ "$profile_workspace_id" = "weixin_wuping" ]; then
        profile_growth_workspace="$wuping_growth_workspace"
      fi
    fi
  fi
  if [ -n "$profile_growth_workspace" ] && [ -f "$growth_mcp_path" ]; then
    growth_toolset_block="  - growth"
    growth_api_toolset_block="    - growth"
    mcp_server_lines="${mcp_server_lines}  growth:
    command: $growth_mcp_command
    args:
      - $growth_mcp_path
      - --workspace
      - $profile_growth_workspace
      - --no-workspace-override
      - --api-base-url
      - $growth_mcp_api_base_url
    env:
      HERMES_HOME: $profile_link
      HERMES_PROFILE: $profile
    startup_timeout: 60
    connect_timeout: 60"$'\n'
  fi
  profile_moira_workspace=""
  if is_owner_connector_profile "$profile"; then
    profile_moira_workspace="$owner_moira_workspace"
  else
    if [ -z "$profile_workspace_id" ]; then
      profile_workspace_id="$(workspace_id_for_gateway_profile "$profile")"
    fi
    if [ -n "$profile_workspace_id" ]; then
      profile_moira_workspace="$(find_first_moira_workspace_root "$profile_workspace_id")"
    fi
  fi
  if [ -n "$profile_moira_workspace" ] && [ -f "$moira_mcp_path" ] && moira_mcp_schema_ready "$profile_moira_workspace" "$moira_mcp_api_base_url"; then
    moira_toolset_block="  - moira"
    moira_api_toolset_block="    - moira"
    mcp_server_lines="${mcp_server_lines}  moira:
    command: $moira_mcp_command
    args:
      - $moira_mcp_path
      - --workspace
      - $profile_moira_workspace
      - --no-workspace-override
      - --api-base-url
      - $moira_mcp_api_base_url
    env:
      HERMES_HOME: $profile_link
      HERMES_PROFILE: $profile
    startup_timeout: 60
    connect_timeout: 60"$'\n'
  elif [ -n "$profile_moira_workspace" ] && [ -f "$moira_mcp_path" ]; then
    echo "[WARN] Skipping moira MCP for $profile: schema probe failed for configured workspace"
  fi
  profile_music_workspace=""
  if is_owner_connector_profile "$profile"; then
    profile_music_workspace="$owner_music_workspace"
  fi
  if [ -n "$profile_music_workspace" ] && [ -f "$music_mcp_path" ]; then
    music_toolset_block="  - music"
    music_api_toolset_block="    - music"
    mcp_server_lines="${mcp_server_lines}  music:
    command: $music_mcp_command
    args:
      - $music_mcp_path
    env:
      HERMES_HOME: $profile_link
      HERMES_PROFILE: $profile
      MUSIC_SQLITE_PATH: $music_sqlite_path
    startup_timeout: 60
    connect_timeout: 60"$'\n'
  fi
  profile_email_workspace=""
  if is_owner_connector_profile "$profile"; then
    profile_email_workspace="$owner_email_workspace"
  else
    if [ -z "$profile_workspace_id" ]; then
      profile_workspace_id="$(workspace_id_for_gateway_profile "$profile")"
    fi
    if [ -n "$profile_workspace_id" ]; then
      profile_email_workspace="$(find_first_email_workspace_root "$profile_workspace_id")"
      if [ -z "$profile_email_workspace" ] && [ "$profile_workspace_id" = "weixin_wuping" ]; then
        profile_email_workspace="$wuping_email_workspace"
      fi
    fi
  fi
  if [ -n "$profile_email_workspace" ] && [ -f "$email_mcp_path" ]; then
    email_toolset_block="  - email"
    email_api_toolset_block="    - email"
    mcp_server_lines="${mcp_server_lines}  email:
    command: $email_mcp_python
    args:
      - $email_mcp_path
      - --workspace
      - $profile_email_workspace
      - --no-workspace-override
      - --api-base-url
      - $email_mcp_api_base_url
    env:
      HERMES_HOME: $profile_link
      HERMES_PROFILE: $profile
    startup_timeout: 60
    connect_timeout: 60"$'\n'
  fi
  if is_owner_connector_profile "$profile" && [ -f "$outlook_graph_mcp_path" ]; then
    outlook_toolset_block="  - outlook_graph"
    outlook_api_toolset_block="    - outlook_graph"
    mcp_server_lines="${mcp_server_lines}  outlook_graph:
    command: /opt/hermes-gateway-runtime/venv/bin/python
    args:
      - $outlook_graph_mcp_path
    env:
      HERMES_HOME: $profile_link
      PYTHONPATH: /opt/hermes-gateway-runtime/official-clean
    enabled: true
    timeout: 180
    connect_timeout: 60"$'\n'
  fi
  mcp_servers_block=""
  if [ -n "$mcp_server_lines" ]; then
    mcp_servers_block="mcp_servers:
${mcp_server_lines%$'\n'}"
  fi
  profile_default_model="gpt-5.5"
  profile_model_provider="openai-codex"
  profile_base_url_block="  base_url: https://chatgpt.com/backend-api/codex"
  if [[ "$profile" =~ ^deepseekgw[0-9]+$ ]]; then
    profile_default_model="deepseek-chat"
    profile_model_provider="deepseek"
    profile_base_url_block=""
  fi
  profile_materialized_workspace_id="$profile_workspace_id"
  if [ -z "$profile_materialized_workspace_id" ]; then
    profile_materialized_workspace_id="$(workspace_id_for_gateway_profile "$profile")"
  fi
  if [ -z "$profile_materialized_workspace_id" ] && is_owner_connector_profile "$profile"; then
    profile_materialized_workspace_id="owner"
  fi
  if [ -z "$profile_materialized_workspace_id" ]; then
    profile_materialized_workspace_id="owner"
  fi
  if ! render_gateway_template_yaml "$profile_link/config.yaml" \
    --config-kind profile \
    --value "profile=$profile" \
    --value "port=$port" \
    --value "profile_link=$profile_link" \
    --value "weather_plugin_enabled=$weather_plugin_enabled" \
    --value "web_plugin_enabled=$web_plugin_enabled" \
    --value "http_plugin_enabled=$http_plugin_enabled" \
    --value "current_environment_plugin_enabled=$current_environment_plugin_enabled" \
    --value "docx_plugin_enabled=$docx_plugin_enabled" \
    --value "pptx_plugin_enabled=$pptx_plugin_enabled" \
    --value "pdf_plugin_enabled=$pdf_plugin_enabled" \
    --value "audio_plugin_enabled=$audio_plugin_enabled" \
    --value "archive_plugin_enabled=$archive_plugin_enabled" \
    --value "image_plugin_enabled=$image_plugin_enabled" \
    --value "cronjob_plugin_enabled=$cronjob_plugin_enabled" \
    --value "wardrobe_enabled=${wardrobe_toolset_block:+1}" \
    --value "wardrobe_mcp_path=$wardrobe_mcp_path" \
    --value "wardrobe_workspace=$profile_wardrobe_workspace" \
    --value "finance_enabled=${finance_toolset_block:+1}" \
    --value "finance_mcp_python=$finance_mcp_python" \
    --value "finance_mcp_path=$finance_mcp_path" \
    --value "finance_workspace=$profile_finance_workspace" \
    --value "finance_mcp_api_base_url=$finance_mcp_api_base_url" \
    --value "note_enabled=${note_toolset_block:+1}" \
    --value "note_mcp_python=$note_mcp_python" \
    --value "note_mcp_path=$note_mcp_path" \
    --value "note_workspace=$profile_note_workspace" \
    --value "note_mcp_api_base_url=$note_mcp_api_base_url" \
    --value "health_enabled=${health_toolset_block:+1}" \
    --value "health_mcp_command=$health_mcp_command" \
    --value "health_mcp_path=$health_mcp_path" \
    --value "health_workspace=$profile_health_workspace" \
    --value "health_mcp_api_base_url=$health_mcp_api_base_url" \
    --value "growth_enabled=${growth_toolset_block:+1}" \
    --value "growth_mcp_command=$growth_mcp_command" \
    --value "growth_mcp_path=$growth_mcp_path" \
    --value "growth_workspace=$profile_growth_workspace" \
    --value "growth_mcp_api_base_url=$growth_mcp_api_base_url" \
    --value "moira_enabled=${moira_toolset_block:+1}" \
    --value "moira_mcp_command=$moira_mcp_command" \
    --value "moira_mcp_path=$moira_mcp_path" \
    --value "moira_workspace=$profile_moira_workspace" \
    --value "moira_mcp_api_base_url=$moira_mcp_api_base_url" \
    --value "music_enabled=${music_toolset_block:+1}" \
    --value "music_mcp_command=$music_mcp_command" \
    --value "music_mcp_path=$music_mcp_path" \
    --value "music_workspace=$profile_music_workspace" \
    --value "music_sqlite_path=$music_sqlite_path" \
    --value "email_enabled=${email_toolset_block:+1}" \
    --value "email_mcp_python=$email_mcp_python" \
    --value "email_mcp_path=$email_mcp_path" \
    --value "email_workspace=$profile_email_workspace" \
    --value "email_mcp_api_base_url=$email_mcp_api_base_url" \
    --value "outlook_graph_enabled=${outlook_toolset_block:+1}" \
    --value "outlook_graph_mcp_path=$outlook_graph_mcp_path"; then
  cat > "$profile_link/config.yaml" <<YAML
model:
  default: ${profile_default_model}
  provider: ${profile_model_provider}
${profile_base_url_block}
toolsets:
  - web
  - search
  - x_search
  - browser
  - file
  - vision
  - video
  - image_gen
  - messaging
  - tts
  - skills
  - todo
  - kanban
  - cronjob
  - memory
  - session_search
  - clarify
${weather_toolset_block}
${http_toolset_block}
${current_environment_toolset_block}
${cronjob_mobile_toolset_block}
${wardrobe_toolset_block}
${finance_toolset_block}
${note_toolset_block}
${health_toolset_block}
${growth_toolset_block}
${moira_toolset_block}
${music_toolset_block}
${email_toolset_block}
${outlook_toolset_block}
platform_toolsets:
  api_server:
    - web
    - search
    - x_search
    - browser
    - file
    - vision
    - video
    - image_gen
    - messaging
    - tts
    - skills
    - todo
    - kanban
    - cronjob
    - memory
    - session_search
    - clarify
${weather_api_toolset_block}
${http_api_toolset_block}
${current_environment_api_toolset_block}
${cronjob_mobile_api_toolset_block}
${wardrobe_api_toolset_block}
${finance_api_toolset_block}
${note_api_toolset_block}
${health_api_toolset_block}
${growth_api_toolset_block}
${moira_api_toolset_block}
${music_api_toolset_block}
${email_api_toolset_block}
${outlook_api_toolset_block}
agent:
  max_turns: 60
  reasoning_effort: medium
terminal:
  backend: local
  cwd: .
  timeout: 180
platforms:
  api_server:
    enabled: true
    extra:
      host: 127.0.0.1
      port: ${port}
plugins:
${plugin_block}
worker_pool:
  enabled: false
cron:
  enabled: false
${mcp_servers_block}
YAML
  fi
  write_materialized_identity "$profile_dir" "$profile" "$profile_materialized_workspace_id" "user" "$profile_model_provider"

  if [ "$shared_auth_enabled" = "1" ]; then
    rm -f "$profile_link/auth.json" "$profile_link/auth.lock"
    ln -s "$shared_auth_path" "$profile_link/auth.json"
    ln -s "$shared_auth_lock_path" "$profile_link/auth.lock"
  elif [ -s "$profile_link/auth.json" ]; then
    chmod 600 "$profile_link/auth.json" || true
  elif [ -s "$profile_seed" ]; then
    install -m 600 -o "$worker_user" -g "$worker_user" "$profile_seed" "$profile_link/auth.json"
  elif [ "${HERMES_LOW_GATEWAY_ALLOW_SHARED_AUTH_SEED:-0}" = "1" ] && [ -s "$worker_home_dir/auth.json" ]; then
    echo "WARNING: using shared low Gateway auth seed for $profile; this is not safe for rotating OAuth refresh tokens." >&2
    cp "$worker_home_dir/auth.json" "$profile_link/auth.json"
    chmod 600 "$profile_link/auth.json" || true
  else
    missing_auth_profiles+=("$profile")
  fi

  chmod 600 "$profile_link/config.yaml" || true
  chown -h "$worker_user:$worker_user" "$profile_link" 2>/dev/null || true
  chown -R "$worker_user:$worker_user" "$profile_dir" 2>/dev/null || true
done <<< "$gateway_specs"

while IFS=$'\t' read -r profile port; do
    if [[ ! "$profile" =~ ^grokgw[0-9]+$ ]]; then
      continue
    fi
    profile_link="$worker_home_dir/profiles/${profile}"
    profile_dir="${telemetry_profiles_root}/${profile}"
    profile_seed="$profile_auth_seed_root/${profile}/auth.json"
    prepare_low_gateway_profile_link "$profile" "$profile_link"
    mkdir -p "$profile_dir"
    chmod 700 "$profile_dir" || true
    repair_low_gateway_sqlite "$profile" "$profile_dir" "state.db"
    repair_low_gateway_sqlite "$profile" "$profile_dir" "response_store.db"
    ln -s "$profile_dir" "$profile_link"
    ensure_low_gateway_skill_link "$profile" "$profile_dir/skills"
    grok_plugin_block="  enabled: []"
    if [ "$video_plugin_enabled" = "1" ]; then
      install -d -m 700 -o "$worker_user" -g "$worker_user" "$profile_dir/plugins"
      rm -rf "$profile_dir/plugins/hermes-mobile-video"
      cp -a "$video_plugin_target" "$profile_dir/plugins/hermes-mobile-video"
      chown -R "$worker_user:$worker_user" "$profile_dir/plugins/hermes-mobile-video"
      grok_plugin_block="  enabled:
    - hermes-mobile-video"
    fi
    if ! render_gateway_template_yaml "$profile_link/config.yaml" \
      --config-kind grok \
      --value "profile=$profile" \
      --value "port=$port" \
      --value "video_plugin_enabled=$video_plugin_enabled"; then
    cat > "$profile_link/config.yaml" <<YAML
model:
  default: grok-4.3
  provider: xai-oauth
toolsets:
  - web
  - search
  - x_search
  - browser
  - file
  - vision
  - video
  - video_gen
  - image_gen
  - messaging
  - tts
  - skills
  - todo
  - kanban
  - cronjob
  - memory
  - session_search
  - clarify
platform_toolsets:
  api_server:
    - web
    - search
    - x_search
    - browser
    - file
    - vision
    - video
    - video_gen
    - image_gen
    - messaging
    - tts
    - skills
    - todo
    - kanban
    - cronjob
    - memory
    - session_search
    - clarify
agent:
  max_turns: 60
  reasoning_effort: medium
video_gen:
  provider: hermes-mobile-xai
  model: grok-imagine-video
terminal:
  backend: local
  cwd: .
  timeout: 180
platforms:
  api_server:
    enabled: true
    extra:
      host: 127.0.0.1
      port: ${port}
plugins:
${grok_plugin_block}
worker_pool:
  enabled: false
cron:
  enabled: false
YAML
    fi
    grok_materialized_workspace_id="${gateway_request_workspace_id:-owner}"
    write_materialized_identity "$profile_dir" "$profile" "$grok_materialized_workspace_id" "user" "xai-oauth"
    if [ "$shared_auth_enabled" = "1" ]; then
      rm -f "$profile_link/auth.json" "$profile_link/auth.lock"
      ln -s "$grok_auth_path" "$profile_link/auth.json"
      ln -s "$grok_auth_lock_path" "$profile_link/auth.lock"
    elif [ -s "$profile_link/auth.json" ]; then
      chmod 600 "$profile_link/auth.json" || true
    elif [ -s "$profile_seed" ]; then
      install -m 600 -o "$worker_user" -g "$worker_user" "$profile_seed" "$profile_link/auth.json"
    else
      missing_auth_profiles+=("$profile")
    fi
    chmod 600 "$profile_link/config.yaml" || true
    chown -h "$worker_user:$worker_user" "$profile_link" 2>/dev/null || true
    chown -R "$worker_user:$worker_user" "$profile_dir" 2>/dev/null || true
done <<< "$gateway_specs"

chown -R "$worker_user:$worker_user" "$worker_home_dir" 2>/dev/null || true

if [ "${#missing_auth_profiles[@]}" -gt 0 ]; then
  echo "Missing profile-local Codex auth for: ${missing_auth_profiles[*]}" >&2
  echo "Run hermes auth separately for each low Gateway profile or place per-profile auth.json files under $profile_auth_seed_root/<profile>/auth.json." >&2
  exit 2
fi

echo LOW_GATEWAY_CONFIGURED
