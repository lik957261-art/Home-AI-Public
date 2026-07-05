#!/usr/bin/env bash
set -euo pipefail

USER_NAME="hermes-mobile"
RUNTIME_DIR="/opt/hermes-mobile/app"
DATA_DIR="/var/lib/hermes-mobile"
LOG_DIR="/var/log/hermes-mobile"
SOURCE_DIR=""
APPLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --user)
      USER_NAME="${2:?missing --user value}"
      shift 2
      ;;
    --runtime-dir)
      RUNTIME_DIR="${2:?missing --runtime-dir value}"
      shift 2
      ;;
    --data-dir)
      DATA_DIR="${2:?missing --data-dir value}"
      shift 2
      ;;
    --log-dir)
      LOG_DIR="${2:?missing --log-dir value}"
      shift 2
      ;;
    --source-dir)
      SOURCE_DIR="${2:?missing --source-dir value}"
      shift 2
      ;;
    --apply)
      APPLY=1
      shift
      ;;
    -h|--help)
      cat <<'EOF'
Prepare Hermes Mobile process-isolation directories on macOS/Linux.

Dry run by default. Add --apply to make changes.

Options:
  --user <name>
  --runtime-dir <path>
  --data-dir <path>
  --log-dir <path>
  --source-dir <path>
  --apply
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

is_macos() {
  [[ "$(uname -s)" == "Darwin" ]]
}

step() {
  local message="$1"
  shift
  echo "[plan] $message"
  if [[ "$APPLY" == "1" ]]; then
    "$@"
  fi
}

if [[ "$APPLY" == "1" && "$(id -u)" != "0" ]]; then
  echo "--apply requires root/sudo." >&2
  exit 1
fi

echo "Hermes Mobile process isolation preparation"
echo "User: $USER_NAME"
echo "RuntimeDir: $RUNTIME_DIR"
echo "DataDir: $DATA_DIR"
echo "LogDir: $LOG_DIR"
if [[ -n "$SOURCE_DIR" ]]; then echo "SourceDir: $SOURCE_DIR"; fi
if [[ "$APPLY" != "1" ]]; then echo "Dry run only. Add --apply to make changes."; fi

ensure_user_macos() {
  if dscl . -read "/Users/$USER_NAME" >/dev/null 2>&1; then
    return 0
  fi
  echo "Creating macOS service users is deployment-specific."
  echo "Create $USER_NAME with a stable UniqueID, no login shell, and no home directory, then rerun this script."
  return 1
}

ensure_user_linux() {
  if id "$USER_NAME" >/dev/null 2>&1; then
    return 0
  fi
  useradd --system --no-create-home --shell /usr/sbin/nologin "$USER_NAME"
}

if is_macos; then
  if [[ "$APPLY" == "1" ]]; then ensure_user_macos; fi
else
  step "Ensure Linux system user exists" ensure_user_linux
fi

step "Create runtime/data/log directories" mkdir -p "$RUNTIME_DIR" "$DATA_DIR" "$LOG_DIR"
step "Set runtime directory read-only for non-owners" chmod -R a+rX,go-w "$RUNTIME_DIR"
step "Set data/log directories writable by service user" chown -R "$USER_NAME" "$DATA_DIR" "$LOG_DIR"
step "Restrict data/log directory permissions" chmod -R u+rwX,go-rwx "$DATA_DIR" "$LOG_DIR"

if [[ -n "$SOURCE_DIR" ]]; then
  echo "[note] Keep the development checkout outside the service user's readable paths."
  echo "[note] On macOS use ACLs such as: chmod -RN <source>; chmod +a \"$USER_NAME deny read,execute,list,search\" <source>"
  echo "[note] On Linux keep source owned by the operator and do not add the service user to that group."
fi

echo "Done."
