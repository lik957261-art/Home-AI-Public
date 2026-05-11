#!/usr/bin/env bash
set -euo pipefail

worker_user="${HERMES_LOW_GATEWAY_USER:-hermes}"
worker_home="/home/$worker_user"
worker_home_dir="$worker_home/.hermes"
gateway_worker_root="${HERMES_GATEWAY_WORKER_ROOT:-/mnt/c/ProgramData/HermesMobile/gateway-worker}"
telemetry_profiles_root="${HERMES_LOW_GATEWAY_TELEMETRY_PROFILES_ROOT:-$gateway_worker_root/telemetry/profiles}"
profile_auth_seed_root="${HERMES_LOW_GATEWAY_PROFILE_AUTH_ROOT:-$gateway_worker_root/profile-auth}"
low_gateway_count="${HERMES_LOW_GATEWAY_COUNT:-10}"

if ! id -u "$worker_user" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$worker_user"
fi

install -d -m 700 -o "$worker_user" -g "$worker_user" "$worker_home_dir"
install -d -m 700 -o "$worker_user" -g "$worker_user" "$worker_home_dir/logs"
install -d -m 700 -o "$worker_user" -g "$worker_user" "$worker_home_dir/profiles"
install -d -m 700 -o "$worker_user" -g "$worker_user" "$worker_home_dir/skills"
mkdir -p "$telemetry_profiles_root"

if [ -s "$gateway_worker_root/secrets/auth.json" ]; then
  install -m 600 -o "$worker_user" -g "$worker_user" "$gateway_worker_root/secrets/auth.json" "$worker_home_dir/auth.json"
fi
install -m 600 -o "$worker_user" -g "$worker_user" "$gateway_worker_root/secrets/low-gateway-api-key.secret" "$worker_home_dir/api-server-key.secret"

missing_auth_profiles=()

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
  cat > "$profile_link/config.yaml" <<YAML
model:
  default: gpt-5.5
  provider: openai-codex
  base_url: https://chatgpt.com/backend-api/codex
toolsets:
  - hermes-cli
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
  enabled: []
worker_pool:
  enabled: false
cron:
  enabled: false
YAML

  if [ -s "$profile_link/auth.json" ]; then
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
