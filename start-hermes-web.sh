#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ps_script="$(wslpath -w "$script_dir/start-hermes-web.ps1")"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$ps_script" "$@"
