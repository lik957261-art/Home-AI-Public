#!/usr/bin/env bash
set -euo pipefail

ROOT="${HERMES_MOBILE_ROOT:-/Users/example/path"
APP_DIR="${HERMES_MOBILE_APP_DIR:-${ROOT%/}/app}"
NODE="${HERMES_MOBILE_NODE_EXE:-${ROOT%/}/runtime/node-current/bin/node}"
STATE_FILE="${HOMEAI_CODEX_MOBILE_PR_AUTOMATION_STATE_FILE:-${ROOT%/}/data/hermes-home/codex-mobile-pr-automation/state.json}"
SOURCE_ROOT="${HOMEAI_CODEX_MOBILE_PR_AUTOMATION_SOURCE_ROOT:-${ROOT%/}/data/hermes-home/codex-mobile-pr-automation/source}"
CHECKOUT="${CODEX_MOBILE_PR_AUTOMATION_CHECKOUT:-/Users/example/path"
SOURCE_REF="${CODEX_MOBILE_PR_AUTOMATION_SOURCE_REF:-origin/main}"

export CODEX_MOBILE_PRIVATE_REPOSITORY="${CODEX_MOBILE_PRIVATE_REPOSITORY:-pentiumxp/codex-mobile-web}"
export CODEX_MOBILE_PUBLIC_REPOSITORY="${CODEX_MOBILE_PUBLIC_REPOSITORY:-pentiumxp/codex-mobile-web-public}"
export CODEX_MOBILE_PR_AUTOMATION_STATE="$STATE_FILE"

if [[ ! -x "$NODE" ]]; then
  echo '{"ok":false,"error":"codex_mobile_pr_automation_node_missing"}'
  exit 1
fi

if [[ ! -f "${APP_DIR}/scripts/codex-mobile-pr-automation-scheduled-task.js" ]]; then
  echo '{"ok":false,"error":"codex_mobile_pr_automation_wrapper_missing"}'
  exit 1
fi

cd "$APP_DIR"
exec "$NODE" "${APP_DIR}/scripts/codex-mobile-pr-automation-scheduled-task.js" \
  --codex-mobile-checkout "$CHECKOUT" \
  --source-ref "$SOURCE_REF" \
  --worktree-root "$SOURCE_ROOT" \
  --state-file "$STATE_FILE" \
  --json
