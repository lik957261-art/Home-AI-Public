#!/bin/sh
set -eu

ROOT="${HERMES_MOBILE_NAS_ROOT:-/volume1/docker/hermes-mobile}"
HERMES_BIN="${HERMES_MOBILE_NAS_HERMES_BIN:-/var/services/homes/xuxinxp/.local/bin/hermes}"
BASE_HOME="${HERMES_MOBILE_NAS_BASE_HERMES_HOME:-/var/services/homes/xuxinxp/.hermes}"
PROFILES_ROOT="${HERMES_MOBILE_NAS_GATEWAY_PROFILES_ROOT:-$ROOT/gateway-worker/profiles}"
MANIFEST_PATH="${HERMES_MOBILE_NAS_GATEWAY_MANIFEST:-$ROOT/data/gateway-pool-manifest.nas-native.json}"
SKILL_PROFILES_ROOT="${HERMES_MOBILE_NAS_SKILL_PROFILES_ROOT:-$ROOT/data/skill-profiles}"
MEMORY_PROFILES_ROOT="${HERMES_MOBILE_NAS_MEMORY_PROFILES_ROOT:-$ROOT/data/gateway-memories}"
WARDROBE_MCP_PYTHON="${HERMES_MOBILE_NAS_WARDROBE_MCP_PYTHON:-/volume1/docker/hermes-agent/current/venv/bin/python3}"
WARDROBE_MCP_PATH="${HERMES_MOBILE_NAS_WARDROBE_MCP_PATH:-/volume1/docker/wardrobe-mcp/scripts/wardrobe-mcp.py}"
FINANCE_MCP_PYTHON="${HERMES_MOBILE_NAS_FINANCE_MCP_PYTHON:-/opt/hermes-gateway-runtime/venv/bin/python}"
FINANCE_MCP_PATH="${HERMES_MOBILE_NAS_FINANCE_MCP_PATH:-/volume1/docker/finance-mcp/source/scripts/finance_mcp_stdio.py}"
FINANCE_MCP_API_BASE_URL="${HERMES_MOBILE_NAS_FINANCE_MCP_API_BASE_URL:-http://127.0.0.1:8791}"

# Format: profile:port:workspaceId:skillProfile
# Optional fifth field is provider. Defaults to openai-codex.
WORKERS="${HERMES_MOBILE_NAS_GATEWAY_WORKERS:-nasgw1:18751:owner:owner-full:openai-codex,nasgw2:18752:owner:owner-full:openai-codex,nasgw3:18753:owner:owner-full:openai-codex,nasgw4:18754:owner:owner-full:openai-codex,nasdsgw1:18771:owner:owner-full:deepseek,nasdsgw2:18772:owner:owner-full:deepseek,nasgw5:18755:weixin_wuping:workspace:weixin_wuping:openai-codex,nasgw6:18756:weixin_wuping:workspace:weixin_wuping:openai-codex,nasdsgw5:18775:weixin_wuping:workspace:weixin_wuping:deepseek,nasgw7:18757:weixin_stephen:workspace:weixin_stephen:openai-codex,nasgw8:18758:weixin_stephen:workspace:weixin_stephen:openai-codex,nasdsgw7:18777:weixin_stephen:workspace:weixin_stephen:deepseek,nasgw9:18759:xuyan:workspace:xuyan:openai-codex,nasgw10:18760:xuyan:workspace:xuyan:openai-codex,nasdsgw9:18779:xuyan:workspace:xuyan:deepseek,nasgw11:18761:weixin_test_1:workspace:weixin_test_1:openai-codex,nasgw12:18762:weixin_test_1:workspace:weixin_test_1:openai-codex,nasdsgw11:18781:weixin_test_1:workspace:weixin_test_1:deepseek}"
START_PROFILES="${HERMES_MOBILE_NAS_GATEWAY_START_PROFILES:-nasgw1}"
STOP_PROFILES=""
NO_STOP_EXISTING=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --start-profiles|-StartProfiles)
      START_PROFILES="${2:-}"
      NO_STOP_EXISTING=1
      shift 2
      ;;
    --stop-profiles|-StopProfiles)
      STOP_PROFILES="${2:-}"
      START_PROFILES=""
      NO_STOP_EXISTING=1
      shift 2
      ;;
    --no-stop-existing|-NoStopExisting)
      NO_STOP_EXISTING=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

mkdir -p "$PROFILES_ROOT" "$(dirname "$MANIFEST_PATH")" "$SKILL_PROFILES_ROOT" "$MEMORY_PROFILES_ROOT"

python3 - "$ROOT" "$BASE_HOME" "$PROFILES_ROOT" "$MANIFEST_PATH" "$WORKERS" "$SKILL_PROFILES_ROOT" "$MEMORY_PROFILES_ROOT" "$WARDROBE_MCP_PYTHON" "$WARDROBE_MCP_PATH" "$FINANCE_MCP_PYTHON" "$FINANCE_MCP_PATH" "$FINANCE_MCP_API_BASE_URL" <<'PY'
import json
import os
import secrets
import shutil
import sys
from pathlib import Path

root = Path(sys.argv[1])
base_home = Path(sys.argv[2])
profiles_root = Path(sys.argv[3])
manifest_path = Path(sys.argv[4])
worker_spec = sys.argv[5]
skill_profiles_root = Path(sys.argv[6])
memory_profiles_root = Path(sys.argv[7])
wardrobe_mcp_python = sys.argv[8]
wardrobe_mcp_path = Path(sys.argv[9])
finance_mcp_python = sys.argv[10]
finance_mcp_path = Path(sys.argv[11])
finance_mcp_api_base_url = sys.argv[12]

base_config = (base_home / "config.yaml").read_text(encoding="utf-8")
base_env = (base_home / ".env").read_text(encoding="utf-8")

existing = {}
if manifest_path.exists():
    try:
        for worker in json.loads(manifest_path.read_text(encoding="utf-8")).get("workers", []):
            key = str(worker.get("profile") or worker.get("name") or "").strip()
            if key:
                existing[key] = worker
    except Exception:
        existing = {}

manifest = {"enabled": True, "version": 3, "workers": []}

def safe_remove_path(path):
    if path.is_symlink() or path.is_file():
        path.unlink()
    elif path.exists():
        shutil.rmtree(path)

def skill_profile_name(raw_skill_profile, workspace_id):
    text = str(raw_skill_profile or "").strip()
    if text.lower().startswith("workspace:"):
        return text.split(":", 1)[1].strip()
    if text:
        return text
    return workspace_id

def link_dir(dst, src):
    if not src.exists() or not src.is_dir():
        raise SystemExit(f"required profile directory missing: {src}")
    if dst.exists() or dst.is_symlink():
        current = None
        if dst.is_symlink():
            try:
                current = Path(os.readlink(dst))
            except OSError:
                current = None
        if current is not None and str(current) == str(src):
            return
        safe_remove_path(dst)
    try:
        dst.symlink_to(src, target_is_directory=True)
    except Exception:
        shutil.copytree(src, dst, dirs_exist_ok=True)

def strip_plugin_toolset(config_text, toolset):
    lines = []
    for line in config_text.splitlines():
        if line.strip() == f"- {toolset}":
            continue
        lines.append(line)
    return "\n".join(lines).rstrip() + "\n"

def remove_mcp_servers(config_text):
    lines = config_text.splitlines()
    output = []
    skipping = False
    for line in lines:
        if line.startswith("mcp_servers:"):
            skipping = True
            continue
        if skipping and line and not line.startswith((" ", "\t")):
            skipping = False
        if not skipping:
            output.append(line)
    return "\n".join(output).rstrip() + "\n"

def append_toolset(config_text, toolset):
    lines = config_text.splitlines()
    if any(line.strip() == f"- {toolset}" for line in lines):
        return config_text
    output = []
    in_toolsets = False
    added_toolset = False
    in_api_toolsets = False
    added_api = False
    for index, line in enumerate(lines):
        if line == "toolsets:":
            in_toolsets = True
            output.append(line)
            continue
        if in_toolsets and line and not line.startswith("  "):
            output.append(f"  - {toolset}")
            added_toolset = True
            in_toolsets = False
        if line.startswith("  api_server:"):
            in_api_toolsets = True
            output.append(line)
            continue
        if in_api_toolsets and line and not line.startswith("    "):
            output.append(f"    - {toolset}")
            added_api = True
            in_api_toolsets = False
        output.append(line)
    if in_toolsets and not added_toolset:
        output.append(f"  - {toolset}")
    if in_api_toolsets and not added_api:
        output.append(f"    - {toolset}")
    return "\n".join(output).rstrip() + "\n"

def first_plugin_workspace(user_root, dirname, key_names):
    if not user_root.exists():
        return None
    for config in sorted(user_root.rglob(f"{dirname}/config.json")):
        plugin_root = config.parent
        if any((plugin_root / name).exists() for name in key_names):
            return plugin_root.parent
    return None

def plugin_mcp_config(config_text, profile_home, workspace_root):
    config = remove_mcp_servers(config_text)
    config = strip_plugin_toolset(config, "wardrobe")
    config = strip_plugin_toolset(config, "finance")
    blocks = []
    wardrobe_workspace = first_plugin_workspace(workspace_root, ".hermes-wardrobe", ["access-key.txt", "workspace-key.txt"])
    if wardrobe_workspace and wardrobe_mcp_path.exists():
        config = append_toolset(config, "wardrobe")
        blocks.append(f"""  wardrobe:
    command: {wardrobe_mcp_python}
    args:
      - {wardrobe_mcp_path}
      - --workspace
      - {wardrobe_workspace}
      - --no-workspace-override
    env:
      HERMES_HOME: {profile_home}
    enabled: true
    timeout: 180
    connect_timeout: 60""")
    finance_workspace = first_plugin_workspace(workspace_root, ".hermes-finance", ["access-key.txt", "workspace-key.txt"])
    if finance_workspace and finance_mcp_path.exists():
        config = append_toolset(config, "finance")
        blocks.append(f"""  finance:
    command: {finance_mcp_python}
    args:
      - {finance_mcp_path}
      - --workspace
      - {finance_workspace}
      - --no-workspace-override
      - --api-base-url
      - {finance_mcp_api_base_url}
    env:
      HERMES_HOME: {profile_home}
    enabled: true
    timeout: 180
    connect_timeout: 60""")
    if blocks:
        config += "mcp_servers:\n" + "\n".join(blocks) + "\n"
    return config

def apply_provider_config(config_text, provider):
    if provider != "deepseek":
        return config_text
    lines = []
    for line in config_text.splitlines():
        if line.strip().startswith("provider:"):
            indent = line[:len(line) - len(line.lstrip())]
            lines.append(f"{indent}provider: deepseek")
        elif line.strip().startswith("default:"):
            indent = line[:len(line) - len(line.lstrip())]
            lines.append(f"{indent}default: deepseek-chat")
        else:
            lines.append(line)
    return "\n".join(lines).rstrip() + "\n"

for raw in [item.strip() for item in worker_spec.split(",") if item.strip()]:
    parts = raw.split(":")
    if len(parts) < 4:
        raise SystemExit(f"invalid worker spec: {raw}")
    name, port_text, workspace_id = parts[0].strip(), parts[1].strip(), parts[2].strip()
    provider = "openai-codex"
    if len(parts) >= 5 and parts[-1].strip() in ("openai-codex", "deepseek"):
        provider = parts[-1].strip()
        skill_profile = ":".join(parts[3:-1]).strip()
    else:
        skill_profile = ":".join(parts[3:]).strip()
    port = int(port_text)
    if not name or not workspace_id:
        raise SystemExit(f"invalid worker spec: {raw}")
    workspace_root = root / "data" / "drive" / "users" / workspace_id
    workspace_root.mkdir(parents=True, exist_ok=True)
    try:
        workspace_root.chmod(0o700)
    except Exception:
        pass
    profile_home = profiles_root / name
    profile_home.mkdir(parents=True, exist_ok=True)
    try:
        profile_home.chmod(0o700)
    except Exception:
        pass
    (profile_home / "logs").mkdir(exist_ok=True)
    api_key = str(existing.get(name, {}).get("api_key") or "").strip() or secrets.token_hex(32)

    env_lines = []
    seen_port = False
    seen_key = False
    for line in base_env.splitlines():
        if line.startswith("API_SERVER_PORT="):
            env_lines.append(f"API_SERVER_PORT={port}")
            seen_port = True
        elif line.startswith("API_SERVER_KEY="):
            env_lines.append(f"API_SERVER_KEY={api_key}")
            seen_key = True
        else:
            env_lines.append(line)
    if not seen_port:
        env_lines.append(f"API_SERVER_PORT={port}")
    if not seen_key:
        env_lines.append(f"API_SERVER_KEY={api_key}")
    (profile_home / ".env").write_text("\n".join(env_lines) + "\n", encoding="utf-8")

    config = base_config.replace(
        str(root / "data" / "drive" / "users" / "owner"),
        str(workspace_root),
    ).replace(
        f"HERMES_HOME: {base_home}",
        f"HERMES_HOME: {profile_home}",
    )
    config = apply_provider_config(config, provider)
    config = plugin_mcp_config(config, profile_home, workspace_root)
    (profile_home / "config.yaml").write_text(config, encoding="utf-8")

    for filename in ["auth.json", "SOUL.md"]:
        src = base_home / filename
        dst = profile_home / filename
        if src.exists() and not dst.exists():
            try:
                dst.symlink_to(src)
            except Exception:
                shutil.copy2(src, dst)

    for dirname in ["plugins", "node"]:
        src = base_home / dirname
        dst = profile_home / dirname
        if not src.exists():
            continue
        if dst.exists() and not dst.is_symlink():
            shutil.rmtree(dst)
        if not dst.exists():
            try:
                dst.symlink_to(src, target_is_directory=True)
            except Exception:
                shutil.copytree(src, dst, dirs_exist_ok=True)

    profile_key = skill_profile_name(skill_profile, workspace_id)
    skill_profile_root = skill_profiles_root / profile_key
    skill_store = skill_profile_root / "skills"
    if not skill_store.exists() or not skill_store.is_dir():
        raise SystemExit(f"required skill store missing for {name}: {skill_store}")
    link_dir(profile_home / "skills", skill_store)

    memory_store = skill_profile_root / "memories"
    if not memory_store.exists():
        memory_store = memory_profiles_root / profile_key
        memory_store.mkdir(parents=True, exist_ok=True)
    try:
        memory_store.chmod(0o700)
    except Exception:
        pass
    link_dir(profile_home / "memories", memory_store)

    manifest["workers"].append({
        "name": name,
        "profile": name,
        "apiBase": f"http://127.0.0.1:{port}",
        "api_key": api_key,
        "enabled": True,
        "provider": provider,
        "tags": ["official", "clean", "nas", "user"] + (["deepseek"] if provider == "deepseek" else []),
        "securityLevel": "user",
        "allowedWorkspaceIds": [workspace_id],
        "skillProfile": skill_profile,
        "skillWorkspaceIds": [workspace_id],
    })

tmp = manifest_path.with_suffix(manifest_path.suffix + ".tmp")
tmp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
tmp.replace(manifest_path)
PY

stop_profile() {
  profile="$1"
  profile_home="$PROFILES_ROOT/$profile"
  if [ -f "$profile_home/gateway.pid" ]; then
    old_pid=$(python3 - "$profile_home/gateway.pid" <<'PY' 2>/dev/null || true
import json
import sys
print(json.load(open(sys.argv[1], encoding="utf-8")).get("pid", ""))
PY
)
    if [ -n "$old_pid" ]; then
      kill "$old_pid" 2>/dev/null || true
    fi
  fi
}

profile_in_list() {
  needle="$1"
  list="$2"
  for item in $(printf '%s' "$list" | tr ',' ' '); do
    [ "$item" = "$needle" ] && return 0
  done
  return 1
}

if [ -n "$STOP_PROFILES" ]; then
  for profile in $(printf '%s' "$STOP_PROFILES" | tr ',' ' '); do
    stop_profile "$profile"
  done
  exit 0
fi

if [ "$NO_STOP_EXISTING" = "0" ]; then
  for item in $(printf '%s' "$WORKERS" | tr ',' ' '); do
    profile=$(printf '%s' "$item" | cut -d: -f1)
    if ! profile_in_list "$profile" "$START_PROFILES"; then
      stop_profile "$profile"
    fi
  done
fi

for profile in $(printf '%s' "$START_PROFILES" | tr ',' ' '); do
  [ -n "$profile" ] || continue
  profile_home="$PROFILES_ROOT/$profile"
  if [ ! -d "$profile_home" ]; then
    echo "Unknown profile: $profile" >&2
    exit 3
  fi
  mkdir -p "$profile_home/logs"
  stop_profile "$profile"
  nohup env \
    HOME="$HOME" \
    HERMES_HOME="$profile_home" \
    HERMES_PROFILE="$profile" \
    "$HERMES_BIN" gateway run --replace \
    >"$profile_home/logs/gateway.log" 2>&1 &
done

python3 - "$MANIFEST_PATH" "$START_PROFILES" <<'PY'
import json
import sys
import time
import urllib.request

manifest = json.load(open(sys.argv[1], encoding="utf-8"))
start_profiles = {item.strip() for item in sys.argv[2].replace(",", " ").split() if item.strip()}
failures = []
for worker in manifest.get("workers", []):
    name = worker.get("profile") or worker.get("name")
    if name not in start_profiles:
        continue
    api_base = str(worker.get("apiBase") or "").rstrip("/")
    ok = False
    last_error = ""
    for _ in range(30):
        try:
            with urllib.request.urlopen(api_base + "/health", timeout=2) as resp:
                ok = resp.status == 200
                if ok:
                    break
        except Exception as exc:
            last_error = type(exc).__name__
        time.sleep(1)
    if not ok:
        failures.append(f"{name}:{last_error}")

if failures:
    raise SystemExit("NAS Gateway workers unhealthy: " + ", ".join(failures))
print(f"NAS Gateway workers healthy: {len(start_profiles)}")
PY
