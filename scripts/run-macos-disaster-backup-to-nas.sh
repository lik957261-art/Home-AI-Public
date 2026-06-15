#!/usr/bin/env bash
set -euo pipefail

ROOT="${HOMEAI_PRODUCTION_ROOT:-/Users/hermes-host/HermesMobile}"
NODE_BIN="${HOMEAI_PRODUCTION_NODE:-$ROOT/runtime/node-current/bin/node}"
APP_SCRIPT="${HOMEAI_DISASTER_BACKUP_SCRIPT:-/Users/hermes-dev/HermesMobileDev/app/scripts/create-macos-disaster-backup.js}"
STAGING="${HOMEAI_DISASTER_BACKUP_STAGING:-/Users/xuxin/HomeAI-Disaster-Staging/mac-production}"
DEFAULT_NFS_DESTINATION="${HOMEAI_NAS_BACKUP_MOUNT:-/Users/xuxin/HomeAI-NAS-Backup-NFS}/${HOMEAI_NAS_BACKUP_SUBDIR:-HomeAI-Production-Backups/mac-production}"
DESTINATION="${HOMEAI_DISASTER_BACKUP_DESTINATION:-$DEFAULT_NFS_DESTINATION}"
LABEL="${HOMEAI_DISASTER_BACKUP_LABEL:-daily-nfs}"
SUDO_PASSWORD_FILE="${HOMEAI_MAC_SUDO_PASSWORD_FILE:-/Users/xuxin/.homeai-qa/sudo-password}"
OPERATOR_USER="${HOMEAI_DISASTER_BACKUP_OPERATOR_USER:-$(id -un)}"
USE_SUDO="${HOMEAI_DISASTER_BACKUP_USE_SUDO:-1}"
NFS_OP_TIMEOUT_SECONDS="${HOMEAI_NAS_BACKUP_OP_TIMEOUT_SECONDS:-30}"
NFS_RSYNC_TIMEOUT_SECONDS="${HOMEAI_NAS_BACKUP_RSYNC_TIMEOUT_SECONDS:-1800}"

usage() {
  cat <<'USAGE'
Usage:
  eval "$(scripts/mount-macos-nas-backup-destination.sh)"
  scripts/run-macos-disaster-backup-to-nas.sh

Environment:
  HOMEAI_DISASTER_BACKUP_DESTINATION  NFS-mounted NAS backup root.
  HOMEAI_DISASTER_BACKUP_STAGING      Local staging root.
  HOMEAI_DISASTER_BACKUP_LABEL        Backup label.
  HOMEAI_MAC_SUDO_PASSWORD_FILE       Restricted sudo password file.
  HOMEAI_DISASTER_BACKUP_OPERATOR_USER User that writes to the NFS mount.
  HOMEAI_DISASTER_BACKUP_USE_SUDO      Set to 0 when running as hermes-host.

This wrapper avoids NFS root-squash failures by splitting privileges:
1. sudo reads Mac production and writes a complete local staging backup.
2. the normal operator user rsyncs staging/current to the NFS destination.
When running from Hermes CRON as hermes-host, set
HOMEAI_DISASTER_BACKUP_USE_SUDO=0 and use a staging path owned by hermes-host.
USAGE
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ -z "$DESTINATION" ]]; then
  echo "homeai_disaster_backup_destination_missing" >&2
  exit 77
fi

if [[ ! -x "$NODE_BIN" ]]; then
  echo "production_node_not_executable:$NODE_BIN" >&2
  exit 1
fi

if [[ "$USE_SUDO" != "0" && ! -f "$SUDO_PASSWORD_FILE" ]]; then
  echo "sudo_password_file_missing:$SUDO_PASSWORD_FILE" >&2
  exit 77
fi

sudo_cmd() {
  if [[ "$USE_SUDO" == "0" ]]; then
    "$@"
  else
    printf '%s\n' "$(cat "$SUDO_PASSWORD_FILE")" | sudo -p '' -S "$@"
  fi
}

run_with_timeout() {
  local timeout_seconds="$1"
  shift
  "$@" &
  local child_pid=$!
  local elapsed=0
  while kill -0 "$child_pid" >/dev/null 2>&1; do
    if [[ "$elapsed" -ge "$timeout_seconds" ]]; then
      kill "$child_pid" >/dev/null 2>&1 || true
      sleep 1
      kill -9 "$child_pid" >/dev/null 2>&1 || true
      wait "$child_pid" 2>/dev/null || true
      return 124
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  wait "$child_pid"
}

nfs_write_probe() {
  local dir="$1"
  mkdir -p "$dir"
  local test_file="${dir%/}/.homeai-nfs-write-test-$$"
  (printf 'ok\n' > "$test_file") 2>/dev/null || return 1
  rm -f "$test_file"
}

nfs_prepare_current_dir() {
  local destination="$1"
  local current="${destination%/}/current"
  mkdir -p "$destination"
  if [[ -e "$current" ]]; then
    if run_with_timeout "$NFS_OP_TIMEOUT_SECONDS" nfs_write_probe "$current"; then
      return 0
    fi
    local stamp
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    local quarantine="${destination%/}/.homeai-nfs-inaccessible-current-${stamp}"
    if ! run_with_timeout "$NFS_OP_TIMEOUT_SECONDS" mv "$current" "$quarantine"; then
      echo "nfs_destination_current_unwritable:${current}" >&2
      return 1
    fi
  fi
  run_with_timeout "$NFS_OP_TIMEOUT_SECONDS" nfs_write_probe "$current"
}

if ! run_with_timeout "$NFS_OP_TIMEOUT_SECONDS" nfs_write_probe "$DESTINATION"; then
  echo "nfs_destination_write_unavailable:${DESTINATION}" >&2
  exit 78
fi

sudo_cmd mkdir -p "$STAGING"
sudo_cmd "$NODE_BIN" "$APP_SCRIPT" \
  --destination "$STAGING" \
  --label "$LABEL" \
  --json

if [[ "$USE_SUDO" != "0" ]]; then
  sudo_cmd chown -R "$OPERATOR_USER" "${STAGING%/}/current"
fi
sudo_cmd chmod -R u+rwX,go-rwx "${STAGING%/}/current"

if ! nfs_prepare_current_dir "$DESTINATION"; then
  echo "nfs_destination_current_unavailable:${DESTINATION%/}/current" >&2
  exit 78
fi

if ! run_with_timeout "$NFS_RSYNC_TIMEOUT_SECONDS" /usr/bin/rsync -rlpt --delete --links --safe-links --inplace \
  "${STAGING%/}/current/" \
  "${DESTINATION%/}/current/"; then
  echo "nfs_destination_rsync_failed:${DESTINATION%/}/current" >&2
  exit 78
fi

"$NODE_BIN" - "${DESTINATION%/}/current/DISASTER-RECOVERY-MANIFEST.json" "$DESTINATION" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const manifestPath = process.argv[2];
const destinationRoot = path.resolve(process.argv[3]);
const currentRoot = path.join(destinationRoot, "current");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

manifest.transferMode = "local-staging-to-nfs";
manifest.stagingDestinationRoot = manifest.destinationRoot;
manifest.stagingCurrentRoot = manifest.currentRoot;
manifest.destinationRoot = destinationRoot;
manifest.currentRoot = currentRoot;
manifest.publishedAt = new Date().toISOString();

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
NODE

cat <<EOF
HOMEAI_DISASTER_BACKUP_STAGING=${STAGING}
HOMEAI_DISASTER_BACKUP_DESTINATION=${DESTINATION}
HOMEAI_DISASTER_BACKUP_CURRENT=${DESTINATION%/}/current
EOF
