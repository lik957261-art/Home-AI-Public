#!/usr/bin/env bash
set -euo pipefail

TZ="${TZ:-Asia/Shanghai}"
POWERSHELL="${POWERSHELL:-/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe}"
BACKUP_SCRIPT_WIN="${BACKUP_SCRIPT_WIN:-C:\\ProgramData\\HermesMobile\\app\\scripts\\create-hermes-mobile-disaster-backup.ps1}"
DESTINATION_ROOT="${DESTINATION_ROOT:-C:\\Users\\xuxin\\SynologyDrive\\HermesMobile-Disaster-Recovery}"
RECEIPT_DIR="${RECEIPT_DIR:-C:\\ProgramData\\HermesMobile\\data\\drive\\users\\owner\\Hermes-徐欣\\交付\\每日Hermes与Codex备份到NAS}"

json_path="$(mktemp)"
cleanup() {
  rm -f "$json_path"
}
trap cleanup EXIT

set +e
"$POWERSHELL" -NoProfile -ExecutionPolicy Bypass -File "$BACKUP_SCRIPT_WIN" \
  -DestinationRoot "$DESTINATION_ROOT" \
  -ReceiptDirectory "$RECEIPT_DIR" >"$json_path" 2>&1
code=$?
set -e

receipt_path="$(python3 - "$json_path" <<'PY'
import json, pathlib, re, sys
text = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8', errors='replace')
match = re.search(r'\{.*\}\s*$', text, re.S)
if not match:
    print('')
    raise SystemExit
try:
    data = json.loads(match.group(0))
except Exception:
    print('')
    raise SystemExit
print(data.get('receiptPath', ''))
PY
)"

now="$(TZ="$TZ" date '+%Y-%m-%d %H:%M:%S %Z')"
printf 'Hermes Mobile disaster recovery backup | %s\n' "$now"
if [[ "$code" -eq 0 ]]; then
  printf 'Status: success. Backup refreshed under %s.\n' "$DESTINATION_ROOT"
else
  printf 'Status: failed. Exit code %s.\n' "$code"
  sed -n '1,80p' "$json_path"
fi
if [[ -n "$receipt_path" ]]; then
  printf 'MEDIA:%s\n' "$receipt_path"
fi
exit "$code"
