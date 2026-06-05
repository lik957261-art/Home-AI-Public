#!/usr/bin/env bash
set -euo pipefail

ROOT="${HERMES_MOBILE_ROOT:-/Users/hermes-host/HermesMobile}"
MANIFEST="${HERMES_MOBILE_GATEWAY_POOL_MANIFEST:-$ROOT/data/gateway-pool-manifest-mac.json}"
ACTION=""
TARGETS=""
OWNER_MAINTENANCE_ONLY="0"
NO_STOP_EXISTING="0"

append_targets() {
  local value="${1:-}"
  if [[ -z "$value" ]]; then
    return
  fi
  if [[ -n "$TARGETS" ]]; then
    TARGETS="$TARGETS,$value"
  else
    TARGETS="$value"
  fi
}

require_value() {
  local name="$1"
  local value="${2:-}"
  if [[ -z "$value" ]]; then
    echo "missing value for $name" >&2
    exit 2
  fi
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --start-profiles|-StartProfiles)
      require_value "$1" "${2:-}"
      ACTION="start"
      append_targets "$2"
      shift 2
      ;;
    --stop-profiles|-StopProfiles)
      require_value "$1" "${2:-}"
      ACTION="stop"
      append_targets "$2"
      shift 2
      ;;
    --start-replicas|-StartReplicas)
      require_value "$1" "${2:-}"
      ACTION="start"
      append_targets "$2"
      shift 2
      ;;
    --stop-replicas|-StopReplicas)
      require_value "$1" "${2:-}"
      ACTION="stop"
      append_targets "$2"
      shift 2
      ;;
    --owner-maintenance-only|-OwnerMaintenanceOnly)
      OWNER_MAINTENANCE_ONLY="1"
      shift
      ;;
    --no-stop-existing|-NoStopExisting)
      NO_STOP_EXISTING="1"
      shift
      ;;
    --force-configure|-ForceConfigure)
      shift
      ;;
    --pool-key|-PoolKey|--profile-template-key|-ProfileTemplateKey|--template-key|-TemplateKey|--replica-id|-ReplicaId|--profile-alias|-ProfileAlias|--workspace-id|-WorkspaceId|--permission-tier|-PermissionTier|--provider|-Provider|--capability-hash|-CapabilityHash|--tool-schema-epoch|-ToolSchemaEpoch)
      require_value "$1" "${2:-}"
      shift 2
      ;;
    *)
      echo "unknown macOS Gateway profile launch argument: $1" >&2
      exit 2
      ;;
  esac
done

[[ -n "$ACTION" ]] || { echo "missing Gateway profile launch action" >&2; exit 2; }
[[ -n "$TARGETS" ]] || { echo "missing Gateway profile or replica list" >&2; exit 2; }

/usr/bin/python3 - "$MANIFEST" "$ACTION" "$TARGETS" "$OWNER_MAINTENANCE_ONLY" "$NO_STOP_EXISTING" <<'PY'
import json
import re
import socket
import subprocess
import sys
from pathlib import Path

manifest_path = Path(sys.argv[1])
action = sys.argv[2]
targets = [item.strip() for item in sys.argv[3].replace(";", ",").split(",") if item.strip()]
owner_maintenance_only = sys.argv[4] == "1"
no_stop_existing = sys.argv[5] == "1"
safe_target = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
safe_label = re.compile(r"^com\.hermesmobile\.gateway\.[A-Za-z0-9_.-]+$")

if action not in {"start", "stop"}:
    print("unsupported Gateway profile launch action", file=sys.stderr)
    raise SystemExit(2)
if not targets or any(not safe_target.match(target) for target in targets):
    print("unsafe Gateway profile launch request", file=sys.stderr)
    raise SystemExit(2)

try:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
except Exception as exc:
    print(f"Gateway manifest unreadable: {type(exc).__name__}", file=sys.stderr)
    raise SystemExit(3)

workers = {}
for worker in manifest.get("workers", []):
    profile = str(worker.get("profile") or worker.get("name") or "").strip()
    replica = str(worker.get("replicaId") or worker.get("replica_id") or profile).strip()
    label = str(worker.get("launchdLabel") or "").strip()
    try:
        port = int(worker.get("port") or 0)
    except Exception:
        port = 0
    security_level = str(worker.get("securityLevel") or worker.get("security_level") or "").strip().lower()
    row = {"profile": profile, "replica": replica, "label": label, "port": port, "security_level": security_level}
    for key in (profile, replica):
        if key:
            workers[key] = row

def port_is_listening(port):
    if not port:
        return False
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            return True
    except OSError:
        return False

for target in targets:
    worker = workers.get(target, {})
    profile = str(worker.get("profile") or target)
    label = str(worker.get("label") or "")
    port = int(worker.get("port") or 0)
    security_level = str(worker.get("security_level") or "")
    if not safe_label.match(label):
        print(f"Gateway profile has no safe launchd label: {target}", file=sys.stderr)
        raise SystemExit(3)
    if owner_maintenance_only and security_level != "owner-maintenance":
        print(f"Gateway profile is not owner-maintenance: {profile}", file=sys.stderr)
        raise SystemExit(3)
    if action == "start":
        cmd = ["/bin/launchctl", "kickstart"]
        if not no_stop_existing:
            cmd.append("-k")
        cmd.append(f"system/{label}")
    else:
        cmd = ["/bin/launchctl", "kill", "SIGTERM", f"system/{label}"]
    result = subprocess.run(cmd, text=True, capture_output=True)
    if action == "stop" and result.returncode != 0:
        if not port_is_listening(port):
            print(f"Gateway profile stop skipped profile={profile} reason=not_listening")
            continue
        stderr = (result.stderr or "").strip()[-500:]
        print(f"Gateway profile stop failed profile={profile} code={result.returncode} stderr={stderr}", file=sys.stderr)
        raise SystemExit(result.returncode or 1)
    if result.returncode != 0:
        stderr = (result.stderr or "").strip()[-500:]
        print(f"Gateway profile {action} failed profile={profile} code={result.returncode} stderr={stderr}", file=sys.stderr)
        raise SystemExit(result.returncode or 1)
    print(f"Gateway profile {action} requested profile={profile}")
PY
