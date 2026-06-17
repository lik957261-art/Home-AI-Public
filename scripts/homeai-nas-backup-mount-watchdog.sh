#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${HERMES_MOBILE_APP_DIR:-/Users/example/path"
MOUNT_SCRIPT="${HOMEAI_NAS_BACKUP_MOUNT_SCRIPT:-${APP_DIR}/scripts/mount-macos-nas-backup-destination.sh}"
MOUNT_POINT="${HOMEAI_NAS_BACKUP_MOUNT:-/Users/example/path"
NAS_HOST="${HOMEAI_NAS_HOST:-192.168.10.99}"
NAS_NFS_EXPORT="${HOMEAI_NAS_NFS_EXPORT:-/volume1/备份}"

if mount | grep -F " on ${MOUNT_POINT} " | grep -F "${NAS_HOST}:${NAS_NFS_EXPORT}" >/dev/null 2>&1; then
  echo "homeai_nas_backup_mount_ok:${MOUNT_POINT}"
  exit 0
fi

if [[ ! -x "$MOUNT_SCRIPT" ]]; then
  echo "homeai_nas_backup_mount_script_not_executable:${MOUNT_SCRIPT}" >&2
  exit 72
fi

"$MOUNT_SCRIPT" >/dev/null
echo "homeai_nas_backup_mount_repaired:${MOUNT_POINT}"
