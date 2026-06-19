#!/usr/bin/env bash
set -euo pipefail

ROOT="${HOMEAI_PRODUCTION_ROOT:-/Users/example/path"
NODE_BIN="${HOMEAI_PRODUCTION_NODE:-$ROOT/runtime/node-current/bin/node}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_SCRIPT="${HOMEAI_DISASTER_BACKUP_SCRIPT:-${SCRIPT_DIR}/create-macos-disaster-backup.js}"
STAGING="${HOMEAI_DISASTER_BACKUP_STAGING:-/Users/example/path"
DEFAULT_NFS_DESTINATION="${HOMEAI_NAS_BACKUP_MOUNT:-/Users/example/path"
DESTINATION="${HOMEAI_DISASTER_BACKUP_DESTINATION:-$DEFAULT_NFS_DESTINATION}"
LABEL="${HOMEAI_DISASTER_BACKUP_LABEL:-daily-nfs}"
SUDO_PASSWORD_FILE="${HOMEAI_MAC_SUDO_PASSWORD_FILE:-/Users/example/path"
OPERATOR_USER="${HOMEAI_DISASTER_BACKUP_OPERATOR_USER:-$(id -un)}"
USE_SUDO="${HOMEAI_DISASTER_BACKUP_USE_SUDO:-1}"
TRANSPORT="${HOMEAI_DISASTER_BACKUP_TRANSPORT:-auto}"
SSH_TARGET="${HOMEAI_DISASTER_BACKUP_SSH_TARGET:-}"
SSH_DESTINATION="${HOMEAI_DISASTER_BACKUP_SSH_DESTINATION:-}"
SSH_OPTIONS="${HOMEAI_DISASTER_BACKUP_SSH_OPTIONS:-}"
NFS_OP_TIMEOUT_SECONDS="${HOMEAI_NAS_BACKUP_OP_TIMEOUT_SECONDS:-30}"
NFS_RSYNC_TIMEOUT_SECONDS="${HOMEAI_NAS_BACKUP_RSYNC_TIMEOUT_SECONDS:-1800}"
SSH_OP_TIMEOUT_SECONDS="${HOMEAI_BACKUP_SSH_OP_TIMEOUT_SECONDS:-30}"
SSH_RSYNC_TIMEOUT_SECONDS="${HOMEAI_BACKUP_SSH_RSYNC_TIMEOUT_SECONDS:-1800}"
RSYNC_ATTEMPTS="${HOMEAI_DISASTER_BACKUP_RSYNC_ATTEMPTS:-3}"

usage() {
  cat <<'USAGE'
Usage:
  eval "$(scripts/mount-macos-nas-backup-destination.sh)"
  scripts/run-macos-disaster-backup-to-nas.sh

Environment:
  HOMEAI_DISASTER_BACKUP_DESTINATION  NFS-mounted NAS backup root.
  HOMEAI_DISASTER_BACKUP_STAGING      Local staging root.
  HOMEAI_DISASTER_BACKUP_LABEL        Backup label.
  HOMEAI_DISASTER_BACKUP_TRANSPORT    auto, ssh, or nfs. Default: auto.
  HOMEAI_MAC_SUDO_PASSWORD_FILE       Restricted sudo password file.
  HOMEAI_DISASTER_BACKUP_OPERATOR_USER User that writes to the NFS mount.
  HOMEAI_DISASTER_BACKUP_USE_SUDO      Set to 0 when running as hermes-host.
  HOMEAI_DISASTER_BACKUP_SSH_TARGET    SSH target/alias for ssh transport.
  HOMEAI_DISASTER_BACKUP_SSH_DESTINATION Remote backup root for ssh transport.
  HOMEAI_DISASTER_BACKUP_SSH_OPTIONS   Optional ssh options, such as "-i <key>".
  HOMEAI_DISASTER_BACKUP_RSYNC_ATTEMPTS Publish rsync attempts. Default: 3.

This wrapper avoids NFS root-squash failures by splitting privileges:
1. sudo reads Mac production and writes a complete local staging backup.
2. the normal operator user rsyncs staging/current to NFS or an SSH target.
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

if [[ "$TRANSPORT" != "auto" && "$TRANSPORT" != "nfs" && "$TRANSPORT" != "ssh" ]]; then
  echo "homeai_disaster_backup_transport_invalid:${TRANSPORT}" >&2
  exit 77
fi

if [[ "$TRANSPORT" == "auto" && -n "$SSH_TARGET" && -n "$SSH_DESTINATION" ]]; then
  TRANSPORT="ssh"
elif [[ "$TRANSPORT" == "auto" ]]; then
  TRANSPORT="nfs"
fi

if [[ "$TRANSPORT" == "ssh" ]]; then
  if [[ -z "$SSH_TARGET" || -z "$SSH_DESTINATION" ]]; then
    echo "homeai_disaster_backup_ssh_destination_missing" >&2
    exit 77
  fi
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

rsync_with_retries() {
  local timeout_seconds="$1"
  shift
  local attempt=1
  local status=0
  while [[ "$attempt" -le "$RSYNC_ATTEMPTS" ]]; do
    if run_with_timeout "$timeout_seconds" "$@"; then
      return 0
    fi
    status=$?
    if [[ "$attempt" -ge "$RSYNC_ATTEMPTS" ]]; then
      return "$status"
    fi
    echo "homeai_disaster_backup_rsync_retry:${attempt}/${RSYNC_ATTEMPTS}:status=${status}" >&2
    sleep "$attempt"
    attempt=$((attempt + 1))
  done
  return "$status"
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

shell_quote() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

ssh_command() {
  local remote_command="$1"
  # shellcheck disable=SC2086
  ssh -o BatchMode=yes -o ConnectTimeout=15 $SSH_OPTIONS "$SSH_TARGET" "$remote_command"
}

ssh_remote_prepare() {
  local remote_root="${SSH_DESTINATION%/}"
  local remote_current="${remote_root}/current"
  local remote_root_q
  local remote_current_q
  remote_root_q="$(shell_quote "$remote_root")"
  remote_current_q="$(shell_quote "$remote_current")"
  local probe_q
  probe_q="$(shell_quote "${remote_current}/.homeai-ssh-write-test-$$")"
  local command
  command="mkdir -p -- ${remote_root_q} && "
  command="${command}if [ -e ${remote_current_q} ]; then "
  command="${command}if (printf 'ok\n' > ${probe_q}) 2>/dev/null; then rm -f -- ${probe_q}; "
  command="${command}else stamp=\$(date -u +%Y%m%dT%H%M%SZ); mv -- ${remote_current_q} ${remote_root_q}/.homeai-ssh-inaccessible-current-\${stamp} || exit 78; mkdir -p -- ${remote_current_q}; fi; "
  command="${command}else mkdir -p -- ${remote_current_q}; fi && "
  command="${command}printf 'ok\n' > ${probe_q} && rm -f -- ${probe_q} && test -d ${remote_root_q}"
  run_with_timeout "$SSH_OP_TIMEOUT_SECONDS" ssh_command "$command"
}

update_manifest_destination() {
  local manifest_path="$1"
  local destination_root="$2"
  local transfer_mode="$3"
  "$NODE_BIN" - "$manifest_path" "$destination_root" "$transfer_mode" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const manifestPath = process.argv[2];
const destinationRoot = process.argv[3];
const transferMode = process.argv[4];
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const currentRoot = path.posix.join(String(destinationRoot).replace(/\/+$/g, ""), "current");

manifest.transferMode = transferMode;
manifest.stagingDestinationRoot = manifest.destinationRoot;
manifest.stagingCurrentRoot = manifest.currentRoot;
manifest.destinationRoot = destinationRoot;
manifest.currentRoot = currentRoot;
manifest.publishedAt = new Date().toISOString();

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
NODE
}

publish_current_to_nfs() {
  if ! run_with_timeout "$NFS_OP_TIMEOUT_SECONDS" nfs_write_probe "$DESTINATION"; then
    echo "nfs_destination_write_unavailable:${DESTINATION}" >&2
    exit 78
  fi
  if ! nfs_prepare_current_dir "$DESTINATION"; then
    echo "nfs_destination_current_unavailable:${DESTINATION%/}/current" >&2
    exit 78
  fi
  if ! rsync_with_retries "$NFS_RSYNC_TIMEOUT_SECONDS" /usr/bin/rsync -rlpt --delete --links --safe-links \
    "${STAGING%/}/current/" \
    "${DESTINATION%/}/current/"; then
    echo "nfs_destination_rsync_failed:${DESTINATION%/}/current" >&2
    exit 78
  fi
  update_manifest_destination "${DESTINATION%/}/current/DISASTER-RECOVERY-MANIFEST.json" "$DESTINATION" "local-staging-to-nfs"
  cat <<EOF
HOMEAI_DISASTER_BACKUP_STAGING=${STAGING}
HOMEAI_DISASTER_BACKUP_DESTINATION=${DESTINATION}
HOMEAI_DISASTER_BACKUP_CURRENT=${DESTINATION%/}/current
EOF
}

publish_current_to_ssh() {
  local remote_root="${SSH_DESTINATION%/}"
  local remote_current="${remote_root}/current"
  if ! ssh_remote_prepare; then
    echo "ssh_destination_write_unavailable:${SSH_TARGET}:${remote_root}" >&2
    exit 78
  fi
  update_manifest_destination "${STAGING%/}/current/DISASTER-RECOVERY-MANIFEST.json" "${SSH_TARGET}:${remote_root}" "local-staging-to-ssh"
  # shellcheck disable=SC2086
  if ! rsync_with_retries "$SSH_RSYNC_TIMEOUT_SECONDS" /usr/bin/rsync -rlpt --delete --links --safe-links \
    --rsync-path=/usr/bin/rsync \
    -e "ssh -o BatchMode=yes -o ConnectTimeout=15 $SSH_OPTIONS" \
    "${STAGING%/}/current/" \
    "${SSH_TARGET}:${remote_current}/"; then
    echo "ssh_destination_rsync_failed:${SSH_TARGET}:${remote_current}" >&2
    exit 78
  fi
  cat <<EOF
HOMEAI_DISASTER_BACKUP_STAGING=${STAGING}
HOMEAI_DISASTER_BACKUP_DESTINATION=${SSH_TARGET}:${remote_root}
HOMEAI_DISASTER_BACKUP_CURRENT=${SSH_TARGET}:${remote_current}
EOF
}

sudo_cmd mkdir -p "$STAGING"
sudo_cmd "$NODE_BIN" "$APP_SCRIPT" \
  --destination "$STAGING" \
  --label "$LABEL" \
  --json

if [[ "$USE_SUDO" != "0" ]]; then
  sudo_cmd chown -R "$OPERATOR_USER" "${STAGING%/}/current"
fi
sudo_cmd chmod -R u+rwX,go-rwx "${STAGING%/}/current"

if [[ "$TRANSPORT" == "ssh" ]]; then
  publish_current_to_ssh
else
  publish_current_to_nfs
fi
