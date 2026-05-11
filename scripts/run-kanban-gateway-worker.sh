#!/usr/bin/env bash
set -euo pipefail

payload_b64="${1:-}"
if [ -z "$payload_b64" ]; then
  echo "Missing Kanban payload." >&2
  exit 2
fi

runtime_root="${HERMES_GATEWAY_RUNTIME_ROOT:-/opt/hermes-gateway-runtime}"
runtime_python="${HERMES_GATEWAY_RUNTIME_PYTHON:-$runtime_root/venv/bin/python}"
runtime_source="${HERMES_GATEWAY_RUNTIME_SOURCE:-$runtime_root/official-clean}"
runtime_bin="${HERMES_GATEWAY_RUNTIME_BIN:-$runtime_root/bin}"
hermes_shim="$runtime_bin/hermes"

mkdir -p "$runtime_bin"
cat > "$hermes_shim" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export PYTHONPATH="$runtime_source\${PYTHONPATH:+:\$PYTHONPATH}"
exec "$runtime_python" -m hermes_cli.main "\$@"
EOF
chmod 755 "$hermes_shim"

"$runtime_python" - "$payload_b64" <<'PY'
import base64
import json
import os
import subprocess
import sys

runtime_root = os.environ.get("HERMES_GATEWAY_RUNTIME_ROOT") or "/opt/hermes-gateway-runtime"
runtime_python = os.environ.get("HERMES_GATEWAY_RUNTIME_PYTHON") or f"{runtime_root}/venv/bin/python"
runtime_source = os.environ.get("HERMES_GATEWAY_RUNTIME_SOURCE") or f"{runtime_root}/official-clean"
runtime_bin = os.environ.get("HERMES_GATEWAY_RUNTIME_BIN") or f"{runtime_root}/bin"
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
    f"PYTHONPATH={runtime_source}",
    f"PATH={runtime_bin}:{runtime_root}/venv/bin:/usr/local/bin:/usr/bin:/bin",
]
cmd = [
    "runuser",
    "-u",
    "hermes",
    "--",
    "env",
    *env_parts,
    runtime_python,
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
