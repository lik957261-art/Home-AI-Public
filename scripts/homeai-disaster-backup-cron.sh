#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${HERMES_MOBILE_APP_DIR:-/Users/example/path"
MOUNT_POINT="${HOMEAI_NAS_BACKUP_MOUNT:-/Users/example/path"
DESTINATION="${HOMEAI_DISASTER_BACKUP_DESTINATION:-${MOUNT_POINT%/}/HomeAI-Production-Backups/mac-production}"
STAGING="${HOMEAI_DISASTER_BACKUP_STAGING:-/Users/example/path"
LABEL="${HOMEAI_DISASTER_BACKUP_LABEL:-daily-nfs-$(date -u +%Y%m%dT%H%M%SZ)}"

if ! mount | grep -F " on ${MOUNT_POINT} " >/dev/null 2>&1; then
  echo "Home AI NAS backup failed: NFS mount is not available at ${MOUNT_POINT}"
  exit 1
fi

if [[ ! -x "${APP_DIR}/scripts/run-macos-disaster-backup-to-nas.sh" ]]; then
  echo "Home AI NAS backup failed: wrapper script is not executable under ${APP_DIR}"
  exit 1
fi

export HOMEAI_DISASTER_BACKUP_DESTINATION="$DESTINATION"
export HOMEAI_DISASTER_BACKUP_STAGING="$STAGING"
export HOMEAI_DISASTER_BACKUP_LABEL="$LABEL"
export HOMEAI_DISASTER_BACKUP_USE_SUDO=0
export HOMEAI_DISASTER_BACKUP_OPERATOR_USER="$(id -un)"

run_output="$("${APP_DIR}/scripts/run-macos-disaster-backup-to-nas.sh" 2>&1)" || {
  echo "Home AI NAS backup failed during publish:"
  echo "$run_output"
  exit 1
}

manifest="${DESTINATION%/}/current/DISASTER-RECOVERY-MANIFEST.json"
if [[ ! -f "$manifest" ]]; then
  echo "Home AI NAS backup failed: manifest was not published to ${manifest}"
  exit 1
fi

"${APP_DIR}/../runtime/node-current/bin/node" - "$manifest" <<'NODE'
const fs = require("node:fs");
const manifestPath = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const failures = Array.isArray(manifest.failures) ? manifest.failures : [];
if (failures.length > 0) {
  console.log(`Home AI NAS backup partial: ${manifest.backupId}`);
  console.log(`Failures: ${failures.length}`);
  for (const failure of failures.slice(0, 5)) console.log(`- ${failure}`);
  process.exit(1);
}
console.log(`Home AI NAS backup success: ${manifest.backupId}`);
console.log(`Destination: ${manifest.destinationRoot}`);
console.log(`SQLite snapshots: ${manifest.sqliteFileCount}`);
console.log(`Soul files: ${Array.isArray(manifest.soulFiles) ? manifest.soulFiles.length : 0}`);
console.log(`Steps: ${Array.isArray(manifest.steps) ? manifest.steps.length : 0}`);
NODE
