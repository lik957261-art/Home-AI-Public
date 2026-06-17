#!/usr/bin/env bash
set -euo pipefail

NAS_HOST="${HOMEAI_NAS_HOST:-192.168.10.99}"
NAS_NFS_EXPORT="${HOMEAI_NAS_NFS_EXPORT:-/volume1/备份}"
MOUNT_POINT="${HOMEAI_NAS_BACKUP_MOUNT:-/Users/example/path"
DESTINATION_SUBDIR="${HOMEAI_NAS_BACKUP_SUBDIR:-HomeAI-Production-Backups/mac-production}"
SUDO_PASSWORD_FILE="${HOMEAI_MAC_SUDO_PASSWORD_FILE:-/Users/example/path"

usage() {
  cat <<'USAGE'
Usage:
  scripts/mount-macos-nas-backup-destination.sh

Environment:
  HOMEAI_NAS_HOST              NAS host. Default: 192.168.10.99
  HOMEAI_NAS_NFS_EXPORT        NFS export. Default: /volume1/备份
  HOMEAI_NAS_BACKUP_MOUNT      Local mount point. Default: /Users/example/path
  HOMEAI_NAS_BACKUP_SUBDIR     Backup subdirectory under the export.
  HOMEAI_MAC_SUDO_PASSWORD_FILE Restricted sudo password file for mount_nfs.

The script mounts the dedicated NAS backup NFS export. NFS does not use the NAS
account password. The sudo password is used only for the local macOS mount
operation and must stay in a restricted local file.
USAGE
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if ! command -v mount_nfs >/dev/null 2>&1; then
  echo "mount_nfs_not_available" >&2
  exit 1
fi

mkdir -p "$MOUNT_POINT"
chmod 700 "$MOUNT_POINT" 2>/dev/null || true

if mount | grep -F " on ${MOUNT_POINT} " >/dev/null 2>&1; then
  current_mount="$(mount | grep -F " on ${MOUNT_POINT} " | head -n 1)"
  expected="${NAS_HOST}:${NAS_NFS_EXPORT}"
  if ! printf '%s\n' "$current_mount" | grep -F "$expected" >/dev/null 2>&1; then
    echo "backup_mount_point_already_used:$current_mount" >&2
    exit 73
  fi
else
  if [[ "${EUID:-$(id -u)}" == "0" ]]; then
    /sbin/mount_nfs -o resvport,nolocks "${NAS_HOST}:${NAS_NFS_EXPORT}" "$MOUNT_POINT" >/dev/null
  elif [[ ! -f "$SUDO_PASSWORD_FILE" ]]; then
    echo "sudo_password_file_missing_for_nfs_mount:$SUDO_PASSWORD_FILE" >&2
    exit 77
  else
    printf '%s\n' "$(cat "$SUDO_PASSWORD_FILE")" \
      | sudo -S /sbin/mount_nfs -o resvport,nolocks "${NAS_HOST}:${NAS_NFS_EXPORT}" "$MOUNT_POINT" >/dev/null
  fi
fi

DESTINATION="${MOUNT_POINT%/}/${DESTINATION_SUBDIR}"
mkdir -p "$DESTINATION" 2>/dev/null || true

cat <<EOF
export HOMEAI_DISASTER_BACKUP_DESTINATION=${DESTINATION}
export HOMEAI_NAS_BACKUP_MOUNT=${MOUNT_POINT}
export HOMEAI_NAS_HOST=${NAS_HOST}
export HOMEAI_NAS_NFS_EXPORT=${NAS_NFS_EXPORT}
EOF
