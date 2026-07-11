#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="${HERMES_MOBILE_APP_ROOT:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
ROOT="${HERMES_MOBILE_ROOT:-$(cd "${APP}/.." && pwd)}"
NODE="${HERMES_MOBILE_NODE:-$ROOT/runtime/node-current/bin/node}"
PYTHON="${HERMES_GROK_REAUTH_PYTHON:-$ROOT/runtime/hermes-agent-official/venv/bin/python}"
OS_USER="${HERMES_GROK_REAUTH_USER:-hm-owner}"
PROFILE="${HERMES_GROK_REAUTH_PROFILE:-grokgw1}"
PROFILE_HOME="${HERMES_GROK_REAUTH_PROFILE_HOME:-/Users/$OS_USER/HermesWorkspace/.hermes-gateway/profiles/$PROFILE}"
PROFILE_AUTH_FILE="${HERMES_GROK_REAUTH_PROFILE_AUTH_FILE:-$PROFILE_HOME/auth.json}"
SHARED_AUTH_FILE="${HERMES_GROK_REAUTH_SHARED_AUTH_FILE:-$ROOT/gateway-worker/telemetry/profiles/shared-auth/auth.json}"
LABEL="${HERMES_GROK_REAUTH_LABEL:-shared-xai-oauth}"
TIMEOUT="${HERMES_GROK_REAUTH_TIMEOUT:-600}"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "macos-grok-xai-reauth.sh must run on macOS." >&2
  exit 2
fi

if [ ! -x "$PYTHON" ]; then
  echo "Hermes Python runtime is not executable." >&2
  exit 2
fi

if [ ! -x "$NODE" ]; then
  echo "Hermes Node runtime is not executable." >&2
  exit 2
fi

if [ ! -f "$APP/scripts/grok-auth-metadata-smoke.js" ]; then
  echo "grok-auth-metadata-smoke.js is missing from the live app." >&2
  exit 2
fi

cat <<'EOF'
This starts xAI OAuth re-authentication for the Mac production Grok profile.

The command uses the official Hermes OAuth manual-paste flow:
1. Open the printed xAI authorization URL in a browser.
2. Approve the request.
3. Paste the failed callback URL, or the authorization code shown by xAI, into
   this terminal only.

Do not paste the callback URL or authorization code into chat, docs, logs, or
handoff files.
EOF

sudo -u "$OS_USER" env \
  HOME="/Users/$OS_USER" \
  HERMES_HOME="$PROFILE_HOME" \
  HERMES_PROFILE="$PROFILE" \
  PATH="/usr/bin:/bin:/usr/sbin:/sbin" \
  "$PYTHON" -m hermes_cli.main auth add xai-oauth \
    --type oauth \
    --label "$LABEL" \
    --manual-paste \
    --timeout "$TIMEOUT"

"$NODE" "$APP/scripts/grok-auth-metadata-smoke.js" \
  --profile-auth-file "$PROFILE_AUTH_FILE" \
  --shared-auth-file "$SHARED_AUTH_FILE" \
  --require-access-token \
  --json
