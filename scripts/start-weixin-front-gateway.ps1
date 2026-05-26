param(
    [string]$DistroName = "",
    [string]$WslUser = "",
    [string]$HermesHome = "",
    [string]$RuntimeRoot = "/opt/hermes-gateway-runtime",
    [int]$GatewayPort = 8642,
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
if (-not $LogPath) { $LogPath = $env:HERMES_MOBILE_WEIXIN_FRONT_GATEWAY_LOG_PATH }
if (-not $LogPath) {
    $dataRoot = $env:HERMES_WEB_DATA_DIR
    if (-not $dataRoot) { $dataRoot = "C:\ProgramData\HermesMobile\data" }
    $LogPath = Join-Path (Join-Path $dataRoot "logs") "weixin-front-gateway-start.log"
}
if ($ReadyWaitSeconds -lt 5) { $ReadyWaitSeconds = 5 }

function Write-WeixinFrontGatewayLog {
    param([string]$Message)
    $parent = Split-Path -Parent $LogPath
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    $line = "{0} {1}" -f (Get-Date).ToString("s"), $Message
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
}

function Invoke-WeixinFrontGatewayBash {
    param([string]$Script)
    $encoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Script))
    $command = "printf '%s' '$encoded' | base64 -d | bash"
    $output = & wsl.exe -d $DistroName -u $WslUser -- bash -lc $command 2>&1 | ForEach-Object { $_.ToString() }
    $exitCode = $LASTEXITCODE
    foreach ($line in $output) { Write-WeixinFrontGatewayLog ("wsl: {0}" -f $line) }
    return [pscustomobject]@{
        ExitCode = $exitCode
        Output = $output
    }
}

function New-WeixinFrontGatewayBash {
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
gateway_port='$GatewayPort'
ready_wait_seconds='$ReadyWaitSeconds'
check_only='$checkValue'
replace_existing='$replaceValue'

runtime_python="`$runtime_root/venv/bin/python"
runtime_source="`$runtime_root/official-clean"
state_path="`$hermes_home/gateway_state.json"
front_log="`$hermes_home/logs/gateway-detached.log"

mkdir -p "`$hermes_home/logs"

gateway_pid() {
  python3 - "`$hermes_home" <<'PY'
import os
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

gateway_state_ok() {
  python3 - "`$state_path" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
try:
    data = json.loads(path.read_text(encoding="utf-8"))
except Exception:
    raise SystemExit(1)

platforms = data.get("platforms") or {}
if data.get("gateway_state") != "running":
    raise SystemExit(1)
if (platforms.get("weixin") or {}).get("state") != "connected":
    raise SystemExit(1)
if (platforms.get("api_server") or {}).get("state") != "connected":
    raise SystemExit(1)
raise SystemExit(0)
PY
}

active_agents() {
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
  gateway_state_ok
  dispatcher_check
  echo "WEIXIN_FRONT_GATEWAY_OK"
  exit 0
fi

pid="`$(gateway_pid || true)"
if [ -n "`$pid" ] && ! gateway_state_ok; then
  agents="`$(active_agents)"
  if [ "`$replace_existing" = "1" ] || [ "`$agents" = "0" ]; then
    echo "weixin front gateway stale; restarting pid=`$pid active_agents=`$agents"
    kill "`$pid" 2>/dev/null || true
    sleep 2
    if kill -0 "`$pid" 2>/dev/null; then
      kill -9 "`$pid" 2>/dev/null || true
    fi
    pid=""
  else
    echo "weixin front gateway unhealthy but active_agents=`$agents; leaving existing process pid=`$pid" >&2
  fi
fi

if [ -z "`$pid" ]; then
  test -x "`$runtime_python"
  test -d "`$runtime_source"
  echo "starting weixin front gateway on port `$gateway_port"
  setsid -f env \
    HOME="/home/$WslUser" \
    HERMES_HOME="`$hermes_home" \
    PYTHONPATH="`$runtime_source" \
    PATH="/home/$WslUser/.local/bin:`$runtime_root/venv/bin:/usr/local/bin:/usr/bin:/bin" \
    "`$runtime_python" -m hermes_cli.main gateway run --replace >>"`$front_log" 2>&1 < /dev/null
fi

deadline=`$((SECONDS + ready_wait_seconds))
while [ "`$SECONDS" -lt "`$deadline" ]; do
  if gateway_state_ok; then
    start_dispatchers
    dispatcher_check
    echo "WEIXIN_FRONT_GATEWAY_OK"
    exit 0
  fi
  sleep 1
done

echo "weixin front gateway did not become healthy" >&2
tail -n 80 "`$front_log" >&2 || true
exit 1
"@
}

$script = New-WeixinFrontGatewayBash -Check:$CheckOnly.IsPresent -Replace:$ReplaceExisting.IsPresent
Write-WeixinFrontGatewayLog "Starting Weixin front gateway check. distro=$DistroName user=$WslUser hermesHome=$HermesHome checkOnly=$($CheckOnly.IsPresent)"
$result = Invoke-WeixinFrontGatewayBash -Script $script
if ($result.ExitCode -ne 0) {
    throw "Weixin front gateway start/check failed with exit code $($result.ExitCode). See $LogPath"
}

if ($CheckOnly) {
    Write-Host "Weixin front gateway check OK"
} else {
    Write-Host "Weixin front gateway OK"
}
Write-Host "Log: $LogPath"
