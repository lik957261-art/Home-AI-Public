#!/usr/bin/env bash
set -euo pipefail

worker_user="${HERMES_LOW_GATEWAY_USER:-hermes}"
worker_home="/home/$worker_user"
worker_home_dir="$worker_home/.hermes"
gateway_worker_root="${HERMES_GATEWAY_WORKER_ROOT:-/mnt/c/ProgramData/HermesMobile/gateway-worker}"
telemetry_profiles_root="${HERMES_LOW_GATEWAY_TELEMETRY_PROFILES_ROOT:-$gateway_worker_root/telemetry/profiles}"
profile_auth_seed_root="${HERMES_LOW_GATEWAY_PROFILE_AUTH_ROOT:-$gateway_worker_root/profile-auth}"
low_gateway_count="${HERMES_LOW_GATEWAY_COUNT:-10}"
shared_auth_mode="${HERMES_LOW_GATEWAY_SHARED_AUTH_MODE:-shared-root}"
shared_auth_path="${HERMES_LOW_GATEWAY_SHARED_AUTH_PATH:-$worker_home_dir/auth.json}"
shared_auth_lock_path="${HERMES_LOW_GATEWAY_SHARED_AUTH_LOCK_PATH:-$worker_home_dir/auth.lock}"
shared_auth_source_profile="${HERMES_LOW_GATEWAY_SHARED_AUTH_SOURCE_PROFILE:-}"
shared_auth_seed_path="${HERMES_LOW_GATEWAY_SHARED_AUTH_SEED_PATH:-$profile_auth_seed_root/shared/auth.json}"
mobile_app_root="${HERMES_MOBILE_APP_ROOT:-/mnt/c/ProgramData/HermesMobile/app}"
weather_plugin_source="${HERMES_MOBILE_WEATHER_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-weather}"
weather_plugin_target="$worker_home_dir/plugins/hermes-mobile-weather"
http_plugin_source="${HERMES_MOBILE_HTTP_PLUGIN_SOURCE:-$mobile_app_root/gateway-plugins/hermes-mobile-http}"
http_plugin_target="$worker_home_dir/plugins/hermes-mobile-http"

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

install -d -m 700 -o "$worker_user" -g "$worker_user" "$(dirname "$shared_auth_path")"

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

missing_auth_profiles=()
weather_plugin_enabled=0
http_plugin_enabled=0

if [ -f "$weather_plugin_source/plugin.yaml" ] && [ -f "$weather_plugin_source/__init__.py" ]; then
  rm -rf "$weather_plugin_target"
  cp -a "$weather_plugin_source" "$weather_plugin_target"
  chown -R "$worker_user:$worker_user" "$weather_plugin_target"
  weather_plugin_enabled=1
else
  echo "Weather plugin source not found: $weather_plugin_source" >&2
fi

if [ -f "$http_plugin_source/plugin.yaml" ] && [ -f "$http_plugin_source/__init__.py" ]; then
  rm -rf "$http_plugin_target"
  cp -a "$http_plugin_source" "$http_plugin_target"
  chown -R "$worker_user:$worker_user" "$http_plugin_target"
  http_plugin_enabled=1
else
  echo "HTTP plugin source not found: $http_plugin_source" >&2
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
plugin_enabled_lines=""
if [ "$weather_plugin_enabled" = "1" ]; then
  weather_toolset_block="  - weather"
  weather_api_toolset_block="    - weather"
  plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-weather"$'\n'
fi
if [ "$http_plugin_enabled" = "1" ]; then
  http_toolset_block="  - http"
  http_api_toolset_block="    - http"
  plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-http"$'\n'
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
  - file
  - vision
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
platform_toolsets:
  api_server:
    - web
    - file
    - vision
    - image_gen
    - messaging
    - tts
    - skills
    - todo
    - cronjob
    - memory
    - session_search
    - clarify
${weather_api_toolset_block}
${http_api_toolset_block}
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
  port=$((18750 + idx))
  profile_link="$worker_home_dir/profiles/${profile}"
  profile_dir="${telemetry_profiles_root}/${profile}"
  profile_seed="$profile_auth_seed_root/${profile}/auth.json"
  rm -rf "$profile_link"
  mkdir -p "$profile_dir"
  chmod 700 "$profile_dir" || true
  ln -s "$profile_dir" "$profile_link"
  if [ "$weather_plugin_enabled" = "1" ]; then
    install -d -m 700 -o "$worker_user" -g "$worker_user" "$profile_dir/plugins"
    rm -rf "$profile_dir/plugins/hermes-mobile-weather"
    cp -a "$weather_plugin_target" "$profile_dir/plugins/hermes-mobile-weather"
    chown -R "$worker_user:$worker_user" "$profile_dir/plugins/hermes-mobile-weather"
  fi
  if [ "$http_plugin_enabled" = "1" ]; then
    install -d -m 700 -o "$worker_user" -g "$worker_user" "$profile_dir/plugins"
    rm -rf "$profile_dir/plugins/hermes-mobile-http"
    cp -a "$http_plugin_target" "$profile_dir/plugins/hermes-mobile-http"
    chown -R "$worker_user:$worker_user" "$profile_dir/plugins/hermes-mobile-http"
  fi
  weather_toolset_block=""
  weather_api_toolset_block=""
  http_toolset_block=""
  http_api_toolset_block=""
  plugin_enabled_lines=""
  if [ "$weather_plugin_enabled" = "1" ]; then
    weather_toolset_block="  - weather"
    weather_api_toolset_block="    - weather"
    plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-weather"$'\n'
  fi
  if [ "$http_plugin_enabled" = "1" ]; then
    http_toolset_block="  - http"
    http_api_toolset_block="    - http"
    plugin_enabled_lines="${plugin_enabled_lines}    - hermes-mobile-http"$'\n'
  fi
  plugin_block="  enabled: []"
  if [ -n "$plugin_enabled_lines" ]; then
    plugin_block="  enabled:
${plugin_enabled_lines%$'\n'}"
  fi
  cat > "$profile_link/config.yaml" <<YAML
model:
  default: gpt-5.5
  provider: openai-codex
  base_url: https://chatgpt.com/backend-api/codex
toolsets:
  - web
  - file
  - vision
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
platform_toolsets:
  api_server:
    - web
    - file
    - vision
    - image_gen
    - messaging
    - tts
    - skills
    - todo
    - cronjob
    - memory
    - session_search
    - clarify
${weather_api_toolset_block}
${http_api_toolset_block}
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

chown -R "$worker_user:$worker_user" "$worker_home_dir"

if [ "${#missing_auth_profiles[@]}" -gt 0 ]; then
  echo "Missing profile-local Codex auth for: ${missing_auth_profiles[*]}" >&2
  echo "Run hermes auth separately for each low Gateway profile or place per-profile auth.json files under $profile_auth_seed_root/<profile>/auth.json." >&2
  exit 2
fi

echo LOW_GATEWAY_CONFIGURED
