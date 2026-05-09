param(
    [Parameter(Mandatory = $true)]
    [string]$BundlePath,
    [string]$WorkerRunAsScript = "C:\ProgramData\HermesMobile\gateway-worker\run-as-worker.ps1",
    [string]$WorkerDirectory = "C:\ProgramData\HermesMobile\gateway-worker",
    [string]$DistroName = "HermesGatewayWorker",
    [string]$WorkerLinuxUser = "hermes",
    [string[]]$Models = @("models--Systran--faster-whisper-base", "models--Systran--faster-whisper-small"),
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

function Convert-ToWslPath {
    param([string]$WindowsPath)
    $resolved = [System.IO.Path]::GetFullPath($WindowsPath)
    $drive = $resolved.Substring(0, 1).ToLowerInvariant()
    $rest = $resolved.Substring(2).Replace("\", "/")
    return "/mnt/$drive$rest"
}

if (-not (Test-Path -LiteralPath $WorkerRunAsScript)) {
    throw "Worker run-as script not found: $WorkerRunAsScript"
}
if (-not (Test-Path -LiteralPath $WorkerDirectory)) {
    throw "Worker directory not found: $WorkerDirectory"
}
if (-not $CheckOnly -and -not (Test-Path -LiteralPath $BundlePath)) {
    throw "STT model bundle not found: $BundlePath"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$childScript = Join-Path $WorkerDirectory "provision-worker-stt-cache-child.ps1"
$shellScript = Join-Path $WorkerDirectory "provision-worker-stt-cache.sh"
$encoding = New-Object System.Text.UTF8Encoding($false)
$modelList = ($Models | ForEach-Object { $_.Trim() } | Where-Object { $_ }) -join " "
$bundleWslPath = Convert-ToWslPath -WindowsPath $BundlePath
$shellWslPath = Convert-ToWslPath -WindowsPath $shellScript

if (-not $modelList) {
    throw "At least one model directory name is required."
}

$mode = if ($CheckOnly) { "check" } else { "install" }
$shell = @"
set -euo pipefail
mode="$mode"
bundle="$bundleWslPath"
dest="/home/$WorkerLinuxUser/.cache/huggingface/hub"
backup="/home/$WorkerLinuxUser/.cache/huggingface/hub.backups/before-stt-cache-$stamp"
models="$modelList"
python="/opt/hermes-gateway-runtime/venv/bin/python"
export HOME="/home/$WorkerLinuxUser"
export HERMES_HOME="/home/$WorkerLinuxUser/.hermes"
export PYTHONPATH="/opt/hermes-gateway-runtime/official-clean"
export HF_HUB_OFFLINE=1

if [ "`$mode" = "install" ]; then
  test -f "`$bundle"
  mkdir -p "`$dest" "`$backup"
  for model in `$models; do
    if [ -e "`$dest/`$model" ] || [ -L "`$dest/`$model" ]; then
      rm -rf "`$backup/`$model"
      mv "`$dest/`$model" "`$backup/`$model"
    fi
  done
  tar -C "`$dest" -xf "`$bundle"
  chown -R "${WorkerLinuxUser}:${WorkerLinuxUser}" "/home/$WorkerLinuxUser/.cache"
fi

command -v ffmpeg >/dev/null
runuser -u "$WorkerLinuxUser" -- env HOME="`$HOME" HERMES_HOME="`$HERMES_HOME" PYTHONPATH="`$PYTHONPATH" HF_HUB_OFFLINE=1 "`$python" - <<'PY'
import importlib.util
import shutil
missing = [name for name in ("faster_whisper", "ctranslate2") if importlib.util.find_spec(name) is None]
if missing:
    raise SystemExit("missing python modules: " + ", ".join(missing))
if shutil.which("ffmpeg") is None:
    raise SystemExit("missing ffmpeg")
print("python_deps=ok")
PY

for model in `$models; do
  test -d "`$dest/`$model"
done

runuser -u "$WorkerLinuxUser" -- env HOME="`$HOME" HERMES_HOME="`$HERMES_HOME" PYTHONPATH="`$PYTHONPATH" HF_HUB_OFFLINE=1 "`$python" - <<PY
from faster_whisper import WhisperModel
for model in "$modelList".split():
    name = model.removeprefix("models--Systran--faster-whisper-")
    WhisperModel(name, device="cpu", compute_type="int8")
    print(f"loaded={name}")
PY

find "`$dest" -maxdepth 1 -name 'models--Systran--faster-whisper-*' -printf '%f %u:%g\n' | sort
"@

$child = @"
`$ErrorActionPreference = "Stop"
& wsl.exe -d "$DistroName" -u root -- bash "$shellWslPath"
if (`$LASTEXITCODE -ne 0) { throw "Worker STT cache provisioning failed with exit code `$LASTEXITCODE" }
"@

[System.IO.File]::WriteAllText($shellScript, $shell, $encoding)
[System.IO.File]::WriteAllText($childScript, $child, $encoding)

& $WorkerRunAsScript -ChildScript $childScript
