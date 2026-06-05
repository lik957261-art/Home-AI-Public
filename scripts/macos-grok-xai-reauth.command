#!/usr/bin/env bash
set -euo pipefail

LIVE_APP="${HERMES_MOBILE_APP_ROOT:-/Users/hermes-host/HermesMobile/app}"
HELPER="$LIVE_APP/scripts/macos-grok-xai-reauth.sh"

clear
echo "Home AI Grok/xAI re-auth"
echo
echo "This opens the checked Hermes xAI OAuth manual-paste flow."
echo "Paste the callback URL or authorization code into this Terminal window only."
echo

if [ ! -f "$HELPER" ]; then
  if ! sudo test -f "$HELPER"; then
    echo "Missing live helper: $HELPER" >&2
    echo
    read -r -p "Press Enter to close..."
    exit 2
  fi
fi

sudo bash "$HELPER"

echo
echo "Done. If the metadata smoke above is ok=true, Grok provider smoke can be rerun."
read -r -p "Press Enter to close..."
