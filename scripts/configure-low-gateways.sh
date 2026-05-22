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
low_gateway_base_port="${HERMES_LOW_GATEWAY_BASE_PORT:-18750}"
grok_gateway_base_port="${HERMES_GROK_GATEWAY_BASE_PORT:-$((low_gateway_base_port + low_gateway_count))}"
shared_auth_mode="${HERMES_LOW_GATEWAY_SHARED_AUTH_MODE:-shared-root}"
shared_auth_default_root="${HERMES_LOW_GATEWAY_SHARED_AUTH_ROOT:-$telemetry_profiles_root/shared-auth}"
shared_auth_path="${HERMES_LOW_GATEWAY_SHARED_AUTH_PATH:-$shared_auth_default_root/auth.json}"
shared_auth_lock_path="${HERMES_LOW_GATEWAY_SHARED_AUTH_LOCK_PATH:-$shared_auth_default_root/auth.lock}"
grok_auth_default_root="${HERMES_GROK_GATEWAY_AUTH_ROOT:-$telemetry_profiles_root/shared-auth-grok}"
grok_auth_path="${HERMES_GROK_GATEWAY_AUTH_PATH:-$grok_auth_default_root/auth.json}"
grok_auth_lock_path="${HERMES_GROK_GATEWAY_AUTH_LOCK_PATH:-$grok_auth_default_root/auth.lock}"
legacy_shared_auth_path="$worker_home_dir/auth.json"
legacy_shared_auth_lock_path="$worker_home_dir/auth.lock"
shared_auth_source_profile="${HERMES_LOW_GATEWAY_SHARED_AUTH_SOURCE_PROFILE:-}"
shared_auth_seed_path="${HERMES_LOW_GATEWAY_SHARED_AUTH_SEED_PATH:-$profile_auth_seed_root/shared/auth.json}"
mobile_app_root="${HERMES_MOBILE_APP_ROOT:-/mnt/c/ProgramData/HermesMobile/app}"
weather_plugin_source="${HERMES_MOBILE_WEATHER_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-weather}"
weather_plugin_target="$worker_home_dir/plugins/hermes-mobile-weather"
web_plugin_source="${HERMES_MOBILE_WEB_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-web}"
web_plugin_target="$worker_home_dir/plugins/hermes-mobile-web"
http_plugin_source="${HERMES_MOBILE_HTTP_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-http}"
http_plugin_target="$worker_home_dir/plugins/hermes-mobile-http"
docx_plugin_source="${HERMES_MOBILE_DOCX_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-docx}"
docx_plugin_target="$worker_home_dir/plugins/hermes-mobile-docx"
audio_plugin_source="${HERMES_MOBILE_AUDIO_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-audio}"
audio_plugin_target="$worker_home_dir/plugins/hermes-mobile-audio"
image_plugin_source="${HERMES_MOBILE_IMAGE_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-image}"
image_plugin_target="$worker_home_dir/plugins/hermes-mobile-image"
video_plugin_source="${HERMES_MOBILE_VIDEO_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-video}"
video_plugin_target="$worker_home_dir/plugins/hermes-mobile-video"
cronjob_plugin_source="${HERMES_MOBILE_CRONJOB_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-cronjob}"
cronjob_plugin_target="$worker_home_dir/plugins/hermes-mobile-cronjob"
owner_connector_profiles="${HERMES_MOBILE_OWNER_CONNECTOR_PROFILES:-lowgw1 lowgw2 lowgw3 lowgw4 lowgw10}"
outlook_graph_mcp_path="${HERMES_MOBILE_OUTLOOK_GRAPH_MCP_PATH:-$worker_home_dir/scripts/outlook_graph_mcp.py}"

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
  local profile
  for profile in $owner_connector_profiles; do
    if [ "$profile" = "$candidate" ]; then
      return 0
    fi
  done
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
  chown -R "$worker_user:$worker_user" "$backup_dir" || true
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
    echo "WARNING: moving real low Gateway profile directory for ${profile} to ${backup_path}" >&2
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
for idx in $(seq 1 "$low_gateway_count"); do
  candidate_auth="${telemetry_profiles_root}/lowgw${idx}/auth.json"
  if [ -s "$candidate_auth" ]; then
    candidate_mtime="$(stat -c %Y "$candidate_auth" 2>/dev/null || echo 0)"
    if [ "$candidate_mtime" -gt "$newest_profile_auth_mtime" ]; then
      newest_profile_auth="$candidate_auth"
      newest_profile_auth_mtime="$candidate_mtime"
    fi
  fi
done

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
docx_plugin_enabled=0
audio_plugin_enabled=0
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

if [ -f "$docx_plugin_source/plugin.yaml" ] && [ -f "$docx_plugin_source/__init__.py" ]; then
  rm -rf "$docx_plugin_target"
  cp -a "$docx_plugin_source" "$docx_plugin_target"
  chown -R "$worker_user:$worker_user" "$docx_plugin_target"
  docx_plugin_enabled=1
else
  echo "DOCX plugin source not found: $docx_plugin_source" >&2
fi

if [ -f "$audio_plugin_source/plugin.yaml" ] && [ -f "$audio_plugin_source/__init__.py" ]; then
  rm -rf "$audio_plugin_target"
  cp -a "$audio_plugin_source" "$audio_plugin_target"
  chown -R "$worker_user:$worker_user" "$audio_plugin_target"
  audio_plugin_enabled=1
else
  echo "Audio plugin source not found: $audio_plugin_source" >&2
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
if [ "$docx_plugin_enabled" = "1" ]; then
  plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-docx"$'\n'
fi
if [ "$audio_plugin_enabled" = "1" ]; then
  plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-audio"$'\n'
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
${cronjob_mobile_api_toolset_block}
agent:
  max_turns: 60
  reasoning_effort: medium
plugins:
${plugin_block}
YAML
chmod 600 "$worker_home_dir/config.yaml" || true
chown "$worker_user:$worker_user" "$worker_home_dir/config.yaml" || true

for idx in $(seq 1 "$low_gateway_count"); do
  profile="lowgw${idx}"
  port=$((low_gateway_base_port + idx))
  profile_link="$worker_home_dir/profiles/${profile}"
  profile_dir="${telemetry_profiles_root}/${profile}"
  profile_seed="$profile_auth_seed_root/${profile}/auth.json"
  prepare_low_gateway_profile_link "$profile" "$profile_link"
  mkdir -p "$profile_dir"
  chmod 700 "$profile_dir" || true
  repair_low_gateway_sqlite "$profile" "$profile_dir" "state.db"
  repair_low_gateway_sqlite "$profile" "$profile_dir" "response_store.db"
  ln -s "$profile_dir" "$profile_link"
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
  if [ "$docx_plugin_enabled" = "1" ]; then
    install -d -m 700 -o "$worker_user" -g "$worker_user" "$profile_dir/plugins"
    rm -rf "$profile_dir/plugins/hermes-mobile-docx"
    cp -a "$docx_plugin_target" "$profile_dir/plugins/hermes-mobile-docx"
    chown -R "$worker_user:$worker_user" "$profile_dir/plugins/hermes-mobile-docx"
  fi
  if [ "$audio_plugin_enabled" = "1" ]; then
    install -d -m 700 -o "$worker_user" -g "$worker_user" "$profile_dir/plugins"
    rm -rf "$profile_dir/plugins/hermes-mobile-audio"
    cp -a "$audio_plugin_target" "$profile_dir/plugins/hermes-mobile-audio"
    chown -R "$worker_user:$worker_user" "$profile_dir/plugins/hermes-mobile-audio"
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
  if [ "$docx_plugin_enabled" = "1" ]; then
    plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-docx"$'\n'
  fi
  if [ "$audio_plugin_enabled" = "1" ]; then
    plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-audio"$'\n'
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
  outlook_mcp_block=""
  if is_owner_connector_profile "$profile" && [ -f "$outlook_graph_mcp_path" ]; then
    outlook_toolset_block="  - outlook_graph"
    outlook_api_toolset_block="    - outlook_graph"
    outlook_mcp_block="mcp_servers:
  outlook_graph:
    command: /opt/hermes-gateway-runtime/venv/bin/python
    args:
      - $outlook_graph_mcp_path
    env:
      HERMES_HOME: $profile_link
      PYTHONPATH: /opt/hermes-gateway-runtime/official-clean
    enabled: true
    timeout: 180
    connect_timeout: 60"
  fi
  cat > "$profile_link/config.yaml" <<YAML
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
${cronjob_mobile_toolset_block}
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
${cronjob_mobile_api_toolset_block}
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
${outlook_mcp_block}
YAML

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
  chown -h "$worker_user:$worker_user" "$profile_link" || true
  chown -R "$worker_user:$worker_user" "$profile_dir" || true
done

if [ "$grok_gateway_count" -gt 0 ]; then
  for idx in $(seq 1 "$grok_gateway_count"); do
    profile="grokgw${idx}"
    port=$((grok_gateway_base_port + idx))
    profile_link="$worker_home_dir/profiles/${profile}"
    profile_dir="${telemetry_profiles_root}/${profile}"
    profile_seed="$profile_auth_seed_root/${profile}/auth.json"
    prepare_low_gateway_profile_link "$profile" "$profile_link"
    mkdir -p "$profile_dir"
    chmod 700 "$profile_dir" || true
    repair_low_gateway_sqlite "$profile" "$profile_dir" "state.db"
    repair_low_gateway_sqlite "$profile" "$profile_dir" "response_store.db"
    ln -s "$profile_dir" "$profile_link"
    grok_plugin_block="  enabled: []"
    if [ "$video_plugin_enabled" = "1" ]; then
      install -d -m 700 -o "$worker_user" -g "$worker_user" "$profile_dir/plugins"
      rm -rf "$profile_dir/plugins/hermes-mobile-video"
      cp -a "$video_plugin_target" "$profile_dir/plugins/hermes-mobile-video"
      chown -R "$worker_user:$worker_user" "$profile_dir/plugins/hermes-mobile-video"
      grok_plugin_block="  enabled:
    - hermes-mobile-video"
    fi
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
    chown -h "$worker_user:$worker_user" "$profile_link" || true
    chown -R "$worker_user:$worker_user" "$profile_dir" || true
  done
fi

chown -R "$worker_user:$worker_user" "$worker_home_dir"

if [ "${#missing_auth_profiles[@]}" -gt 0 ]; then
  echo "Missing profile-local Codex auth for: ${missing_auth_profiles[*]}" >&2
  echo "Run hermes auth separately for each low Gateway profile or place per-profile auth.json files under $profile_auth_seed_root/<profile>/auth.json." >&2
  exit 2
fi

echo LOW_GATEWAY_CONFIGURED
