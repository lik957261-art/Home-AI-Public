param(
    [string]$DistroName = "",
    [string]$WslUser = "",
    [string]$HermesHome = "",
    [string]$RuntimeRoot = "/opt/hermes-gateway-runtime",
    [string]$MobileBaseUrl = "",
    [string]$IngressKeyPath = "",
    [string]$RouteMapPath = "",
    [string]$BridgeScript = "",
    [int]$ReadyWaitSeconds = 45,
    [string]$LogPath = "",
    [switch]$CheckOnly,
    [switch]$ReplaceExisting
)

$ErrorActionPreference = "Stop"

if (-not $DistroName) { $DistroName = $env:HERMES_WEB_WSL_DISTRO }
if (-not $DistroName) { $DistroName = "Ubuntu-24.04" }
if (-not $WslUser) { $WslUser = $env:HERMES_MOBILE_WEIXIN_FRONT_GATEWAY_WSL_USER }
if (-not $WslUser) { $WslUser = $env:HERMES_WEB_WSL_USER }
if (-not $WslUser) { $WslUser = "xuxin" }
if (-not $HermesHome) { $HermesHome = $env:HERMES_MOBILE_WEIXIN_FRONT_GATEWAY_HERMES_HOME }
if (-not $HermesHome) { $HermesHome = $env:HERMES_WEB_HERMES_HOME }
if (-not $HermesHome) { $HermesHome = "/home/$WslUser/.hermes" }
if (-not $MobileBaseUrl) { $MobileBaseUrl = $env:HERMES_MOBILE_BASE_URL }
if (-not $MobileBaseUrl) { $MobileBaseUrl = $env:HERMES_WEB_BASE_URL }
if (-not $MobileBaseUrl) { $MobileBaseUrl = "http://127.0.0.1:8797" }

$dataRoot = $env:HERMES_WEB_DATA_DIR
if (-not $dataRoot) { $dataRoot = "C:\ProgramData\HermesMobile\data" }
$configRoot = Join-Path $dataRoot "config"
if (-not $IngressKeyPath) { $IngressKeyPath = $env:HERMES_MOBILE_WEIXIN_INGRESS_KEY_PATH }
if (-not $IngressKeyPath) { $IngressKeyPath = Join-Path $dataRoot "weixin-ingress.secret" }
if (-not $RouteMapPath) { $RouteMapPath = $env:HERMES_WEB_WEIXIN_ROUTE_MAP_PATH }
if (-not $RouteMapPath) { $RouteMapPath = Join-Path $configRoot "access-control\weixin-routing-map.json" }
if (-not $BridgeScript) { $BridgeScript = $env:HERMES_MOBILE_WEIXIN_INGRESS_BRIDGE_SCRIPT }
if (-not $BridgeScript) { $BridgeScript = "C:\ProgramData\HermesMobile\app\scripts\weixin-mobile-ingress-bridge.py" }
if (-not $LogPath) { $LogPath = $env:HERMES_MOBILE_WEIXIN_INGRESS_BRIDGE_LOG_PATH }
if (-not $LogPath) { $LogPath = Join-Path (Join-Path $dataRoot "logs") "weixin-mobile-ingress-bridge-start.log" }
if ($ReadyWaitSeconds -lt 5) { $ReadyWaitSeconds = 5 }

function Write-WeixinIngressBridgeLog {
    param([string]$Message)
    $parent = Split-Path -Parent $LogPath
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    $line = "{0} {1}" -f (Get-Date).ToString("s"), $Message
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
}

function Invoke-WeixinIngressBridgeBash {
    param([string]$Script)
    $tmpScript = Join-Path ([System.IO.Path]::GetTempPath()) ("hermes-weixin-ingress-bridge-{0}.sh" -f ([Guid]::NewGuid().ToString("N")))
    $encoding = New-Object System.Text.UTF8Encoding($false)
    try {
        [System.IO.File]::WriteAllText($tmpScript, $Script, $encoding)
        $wslScript = & wsl.exe -d $DistroName -u $WslUser -- wslpath -a $tmpScript 2>&1 | Select-Object -First 1
        if ($LASTEXITCODE -ne 0 -or -not $wslScript) {
            throw "Failed to convert Weixin ingress bridge script path for WSL."
        }
        $output = & wsl.exe -d $DistroName -u $WslUser -- bash $wslScript 2>&1 | ForEach-Object { $_.ToString() }
        $exitCode = $LASTEXITCODE
        foreach ($line in $output) { Write-WeixinIngressBridgeLog ("wsl: {0}" -f $line) }
        return [pscustomobject]@{
            ExitCode = $exitCode
            Output = $output
        }
    } finally {
        Remove-Item -LiteralPath $tmpScript -Force -ErrorAction SilentlyContinue
    }
}

function New-WeixinIngressBridgeBash {
    param(
        [bool]$Check,
        [bool]$Replace
    )
    $checkValue = if ($Check) { "1" } else { "0" }
    $replaceValue = if ($Replace) { "1" } else { "0" }
    @"
set -euo pipefail

hermes_home='$HermesHome'
runtime_root='$RuntimeRoot'
mobile_base_url='$MobileBaseUrl'
ingress_key_path='$IngressKeyPath'
route_map_path='$RouteMapPath'
bridge_script='$BridgeScript'
ready_wait_seconds='$ReadyWaitSeconds'
check_only='$checkValue'
replace_existing='$replaceValue'

runtime_python="`$runtime_root/venv/bin/python"
runtime_source="`$runtime_root/official-clean"
state_path="`$hermes_home/gateway_state.json"
state_dir="`$hermes_home/weixin-mobile-ingress"
bridge_log="`$hermes_home/logs/weixin-mobile-ingress-bridge.log"

mkdir -p "`$state_dir" "`$hermes_home/logs"

to_wsl_path() {
  local value="`$1"
  if command -v wslpath >/dev/null 2>&1; then
    wslpath -u "`$value" 2>/dev/null && return 0
  fi
  printf '%s' "`$value"
}

ingress_key_path="`$(to_wsl_path "`$ingress_key_path")"
route_map_path="`$(to_wsl_path "`$route_map_path")"
bridge_script="`$(to_wsl_path "`$bridge_script")"

resolve_mobile_base_url() {
  local value="`$1"
  case "`$value" in
    http://127.0.0.1:*|http://localhost:*|https://127.0.0.1:*|https://localhost:*)
      local host
      host="`$(ip route | awk '/default/{print `$3; exit}' 2>/dev/null || true)"
      if [ -n "`$host" ]; then
        value="`$(printf '%s' "`$value" | sed -E "s#//(127[.]0[.]0[.]1|localhost)(:|/)#//`$host\2#")"
      fi
      ;;
  esac
  printf '%s' "`$value"
}

mobile_base_url="`$(resolve_mobile_base_url "`$mobile_base_url")"

legacy_gateway_pid() {
  python3 - "`$hermes_home" <<'PY'
import re
import sys
from pathlib import Path

target_home = sys.argv[1].replace("\\", "/").rstrip("/")
pattern = re.compile(r"(?:^| )(?:\S*/python(?:3)?|\S*/python(?:3)?\.\d+|\S*/hermes|hermes)(?: -m hermes_cli\.main| \S*/hermes_cli/main\.py)? gateway run --replace$")

def read_environ(proc):
    try:
        raw = (proc / "environ").read_bytes()
    except OSError:
        return {}
    values = {}
    for item in raw.split(b"\0"):
        if not item or b"=" not in item:
            continue
        key, value = item.split(b"=", 1)
        values[key.decode("utf-8", "replace")] = value.decode("utf-8", "replace")
    return values

for proc in Path("/proc").iterdir():
    if not proc.name.isdigit():
        continue
    try:
        raw = (proc / "cmdline").read_bytes()
    except OSError:
        continue
    if not raw:
        continue
    cmd = raw.replace(b"\0", b" ").decode("utf-8", "replace").strip()
    if " -p " in cmd:
        continue
    if not pattern.search(cmd):
        continue
    env = read_environ(proc)
    profile = env.get("HERMES_PROFILE", "").strip()
    hermes_home = env.get("HERMES_HOME", "").replace("\\", "/").rstrip("/")
    if profile or "/.hermes/profiles/" in hermes_home:
        continue
    if target_home and hermes_home != target_home:
        continue
    print(proc.name)
    raise SystemExit(0)
raise SystemExit(1)
PY
}

legacy_active_agents() {
  python3 - "`$state_path" <<'PY'
import json
import sys
from pathlib import Path

try:
    data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
except Exception:
    print("0")
    raise SystemExit(0)
print(int(data.get("active_agents") or 0))
PY
}

stop_legacy_gateway() {
  local pid
  pid="`$(legacy_gateway_pid || true)"
  if [ -z "`$pid" ]; then
    return 0
  fi
  local agents
  agents="`$(legacy_active_agents)"
  if [ "`$replace_existing" != "1" ] && [ "`$agents" != "0" ]; then
    echo "legacy Weixin Gateway still has active_agents=`$agents; not replacing pid=`$pid" >&2
    return 1
  fi
  echo "stopping legacy direct Weixin Gateway pid=`$pid active_agents=`$agents"
  kill "`$pid" 2>/dev/null || true
  sleep 2
  if kill -0 "`$pid" 2>/dev/null; then
    kill -9 "`$pid" 2>/dev/null || true
  fi
}

bridge_pid() {
  local pid=""
  if [ -f "`$state_dir/bridge.pid" ]; then
    pid="`$(tr -cd '0-9' < "`$state_dir/bridge.pid" || true)"
  fi
  if [ -n "`$pid" ] && kill -0 "`$pid" 2>/dev/null; then
    printf '%s' "`$pid"
    return 0
  fi
  return 1
}

stop_bridge() {
  local pid
  pid="`$(bridge_pid || true)"
  if [ -z "`$pid" ]; then
    return 0
  fi
  echo "stopping existing Weixin Mobile ingress bridge pid=`$pid"
  kill "`$pid" 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    sleep 1
    if ! kill -0 "`$pid" 2>/dev/null; then
      return 0
    fi
  done
  kill -9 "`$pid" 2>/dev/null || true
}

bridge_check() {
  env \
    HOME="/home/$WslUser" \
    HERMES_HOME="`$hermes_home" \
    PYTHONPATH="`$runtime_source" \
    HERMES_MOBILE_WEIXIN_RUNTIME_ROOT="`$runtime_root" \
    HERMES_MOBILE_WEIXIN_INGRESS_KEY_FILE="`$ingress_key_path" \
    HERMES_MOBILE_WEIXIN_ROUTE_MAP_PATH="`$route_map_path" \
    HERMES_MOBILE_WEIXIN_BRIDGE_STATE_DIR="`$state_dir" \
    "`$runtime_python" "`$bridge_script" --base-url "`$mobile_base_url" --state-dir "`$state_dir" check
}

dispatcher_check() {
  HERMES_GATEWAY_CHECK_ONLY=1 bash "`$hermes_home/bin/ensure-weixin-reminder-dispatcher.sh"
  HERMES_GATEWAY_CHECK_ONLY=1 bash "`$hermes_home/bin/ensure-weixin-todo-dispatcher.sh"
  HERMES_GATEWAY_CHECK_ONLY=1 bash "`$hermes_home/bin/ensure-weixin-delivery-queue-dispatcher.sh"
}

start_dispatchers() {
  for script in \
    "`$hermes_home/bin/ensure-weixin-reminder-dispatcher.sh" \
    "`$hermes_home/bin/ensure-weixin-todo-dispatcher.sh" \
    "`$hermes_home/bin/ensure-weixin-delivery-queue-dispatcher.sh"
  do
    if [ -f "`$script" ]; then
      bash "`$script"
    else
      echo "missing dispatcher script: `$script" >&2
      return 1
    fi
  done
}

if [ "`$check_only" = "1" ]; then
  if legacy_gateway_pid >/dev/null 2>&1; then
    echo "legacy direct Weixin Gateway is still running" >&2
    exit 1
  fi
  bridge_check
  dispatcher_check
  echo "WEIXIN_MOBILE_INGRESS_BRIDGE_OK"
  exit 0
fi

test -x "`$runtime_python"
test -d "`$runtime_source"
test -f "`$bridge_script"
test -f "`$ingress_key_path"

stop_legacy_gateway

if [ "`$replace_existing" = "1" ]; then
  stop_bridge
fi

if bridge_check >/dev/null 2>&1; then
  start_dispatchers
  dispatcher_check
  echo "WEIXIN_MOBILE_INGRESS_BRIDGE_OK"
  exit 0
fi

echo "starting Weixin Mobile ingress bridge"
setsid -f env \
  HOME="/home/$WslUser" \
  HERMES_HOME="`$hermes_home" \
  PYTHONPATH="`$runtime_source" \
  PATH="/home/$WslUser/.local/bin:`$runtime_root/venv/bin:/usr/local/bin:/usr/bin:/bin" \
  HERMES_MOBILE_BASE_URL="`$mobile_base_url" \
  HERMES_MOBILE_WEIXIN_RUNTIME_ROOT="`$runtime_root" \
  HERMES_MOBILE_WEIXIN_INGRESS_KEY_FILE="`$ingress_key_path" \
  HERMES_MOBILE_WEIXIN_ROUTE_MAP_PATH="`$route_map_path" \
  HERMES_MOBILE_WEIXIN_BRIDGE_STATE_DIR="`$state_dir" \
  "`$runtime_python" "`$bridge_script" --base-url "`$mobile_base_url" --state-dir "`$state_dir" loop >>"`$bridge_log" 2>&1 < /dev/null

deadline=`$((SECONDS + ready_wait_seconds))
while [ "`$SECONDS" -lt "`$deadline" ]; do
  if bridge_check; then
    start_dispatchers
    dispatcher_check
    echo "WEIXIN_MOBILE_INGRESS_BRIDGE_OK"
    exit 0
  fi
  sleep 1
done

echo "Weixin Mobile ingress bridge did not become healthy" >&2
tail -n 100 "`$bridge_log" >&2 || true
exit 1
"@
}

$script = New-WeixinIngressBridgeBash -Check:$CheckOnly.IsPresent -Replace:$ReplaceExisting.IsPresent
Write-WeixinIngressBridgeLog "Starting Weixin Mobile ingress bridge check. distro=$DistroName user=$WslUser hermesHome=$HermesHome checkOnly=$($CheckOnly.IsPresent)"
$result = Invoke-WeixinIngressBridgeBash -Script $script
if ($result.ExitCode -ne 0) {
    throw "Weixin Mobile ingress bridge start/check failed with exit code $($result.ExitCode). See $LogPath"
}

if ($CheckOnly) {
    Write-Host "Weixin Mobile ingress bridge check OK"
} else {
    Write-Host "Weixin Mobile ingress bridge OK"
}
Write-Host "Log: $LogPath"
