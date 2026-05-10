#!/usr/bin/env bash
set -euo pipefail

payload_b64="${1:-}"
if [ -z "$payload_b64" ]; then
  echo "Missing Kanban payload." >&2
  exit 2
fi

/opt/hermes-gateway-runtime/venv/bin/python - "$payload_b64" <<'PY'
import base64
import json
import os
import subprocess
import sys

payload = json.loads(base64.b64decode(sys.argv[1]).decode("utf-8"))
profile = str(payload.get("profile") or "lowgw1")
hermes_home = str(payload.get("hermesHome") or "/home/hermes/.hermes")
kanban_args = [str(item) for item in (payload.get("kanbanArgs") or [])]
if not kanban_args:
    print("Kanban arguments are required.", file=sys.stderr)
    raise SystemExit(2)

env_parts = [
    "HOME=/home/hermes",
    f"HERMES_HOME={hermes_home}",
    f"HERMES_PROFILE={profile}",
    "PYTHONPATH=/opt/hermes-gateway-runtime/official-clean",
]
cmd = [
    "runuser",
    "-u",
    "hermes",
    "--",
    "env",
    *env_parts,
    "/opt/hermes-gateway-runtime/venv/bin/python",
    "-m",
    "hermes_cli.main",
    "-p",
    profile,
    *kanban_args,
]
if "--json" in kanban_args:
    result = subprocess.run(cmd, text=True, encoding="utf-8", errors="replace", capture_output=True)
    if result.stderr:
        sys.stderr.write(result.stderr)
    if result.stdout:
        try:
            parsed = json.loads(result.stdout)
            print(json.dumps(parsed, ensure_ascii=True, indent=2))
        except Exception:
            sys.stdout.write(result.stdout)
else:
    result = subprocess.run(cmd)
raise SystemExit(result.returncode)
PY
