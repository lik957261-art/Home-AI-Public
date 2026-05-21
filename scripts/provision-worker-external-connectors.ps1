param(
    [string]$WorkerRunAsScript = "C:\ProgramData\HermesMobile\gateway-worker\run-as-worker.ps1",
    [string]$WorkerDirectory = "C:\ProgramData\HermesMobile\gateway-worker",
    [string]$DistroName = "HermesGatewayWorker",
    [string]$WorkerLinuxUser = "hermes",
    [string[]]$Profiles = @("lowgw1", "lowgw2", "lowgw3", "lowgw4", "lowgw10"),
    [string]$GoogleTokenPath = $env:HERMES_WEB_GOOGLE_TOKEN_PATH,
    [string]$GoogleClientSecretPath = $env:HERMES_WEB_GOOGLE_CLIENT_SECRET_PATH,
    [string]$OutlookGraphTokenPath = $env:HERMES_WEB_OUTLOOK_GRAPH_TOKEN_PATH,
    [string]$OutlookGraphEnvPath = $env:HERMES_WEB_OUTLOOK_GRAPH_ENV_PATH,
    [string]$OutlookGraphMcpPath = "",
    [string]$WindowsWorkerAccount = "HermesMobileWorker",
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

function Copy-ConnectorFile {
    param(
        [string]$SourcePath,
        [string]$DestinationPath
    )
    if (-not $SourcePath) { return $false }
    if (-not (Test-Path -LiteralPath $SourcePath)) { return $false }
    $parent = Split-Path -Parent $DestinationPath
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    Copy-Item -LiteralPath $SourcePath -Destination $DestinationPath -Force
    return $true
}

function Copy-FilteredOutlookEnvFile {
    param(
        [string]$SourcePath,
        [string]$DestinationPath
    )
    if (-not $SourcePath) { return $false }
    if (-not (Test-Path -LiteralPath $SourcePath)) { return $false }
    $lines = @()
    foreach ($rawLine in Get-Content -LiteralPath $SourcePath) {
        $line = [string]$rawLine
        if ($line -match '^\s*(MS_GRAPH_[A-Z0-9_]+|EMAIL_HOME_(CHANNEL|ADDRESS))\s*=') {
            $lines += $line.Trim()
        }
    }
    if ($lines.Count -eq 0) { return $false }
    $parent = Split-Path -Parent $DestinationPath
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($DestinationPath, (($lines -join "`n") + "`n"), $utf8NoBom)
    return $true
}

function Set-ImportDirectoryAcl {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    try {
        & icacls $Path /inheritance:r | Out-Null
        & icacls $Path /grant:r "${currentUser}:(OI)(CI)F" "SYSTEM:(OI)(CI)F" "BUILTIN\Administrators:(OI)(CI)F" "${WindowsWorkerAccount}:(OI)(CI)R" | Out-Null
    } catch {
        Write-Warning "Could not restrict connector staging ACLs: $($_.Exception.Message)"
    }
}

if (-not (Test-Path -LiteralPath $WorkerRunAsScript)) {
    throw "Worker run-as script not found: $WorkerRunAsScript"
}
if (-not (Test-Path -LiteralPath $WorkerDirectory)) {
    throw "Worker directory not found: $WorkerDirectory"
}

$profilesText = ($Profiles | ForEach-Object { $_.Trim() } | Where-Object { $_ }) -join " "
if (-not $profilesText) { throw "At least one worker profile is required." }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$encoding = New-Object System.Text.UTF8Encoding($false)
$childScript = Join-Path $WorkerDirectory "provision-worker-external-connectors-child.ps1"
$shellScript = Join-Path $WorkerDirectory "provision-worker-external-connectors.sh"
$stagingRoot = Join-Path $WorkerDirectory ("secrets\external-connectors-import-{0}" -f $stamp)
$stagingWslPath = Convert-ToWslPath -WindowsPath $stagingRoot
$shellWslPath = Convert-ToWslPath -WindowsPath $shellScript

$copied = @()
if (-not $CheckOnly) {
    New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null
    if (Copy-ConnectorFile -SourcePath $GoogleTokenPath -DestinationPath (Join-Path $stagingRoot "google_token.json")) {
        $copied += "google_token.json"
    }
    if (Copy-ConnectorFile -SourcePath $GoogleClientSecretPath -DestinationPath (Join-Path $stagingRoot "google_client_secret.json")) {
        $copied += "google_client_secret.json"
    }
    if (Copy-ConnectorFile -SourcePath $OutlookGraphTokenPath -DestinationPath (Join-Path $stagingRoot "microsoft-graph-outlook-mail\token.json")) {
        $copied += "microsoft-graph-outlook-mail/token.json"
    }
    if (Copy-FilteredOutlookEnvFile -SourcePath $OutlookGraphEnvPath -DestinationPath (Join-Path $stagingRoot "outlook_graph.env")) {
        $copied += "outlook_graph.env"
    }
    if (Copy-ConnectorFile -SourcePath $OutlookGraphMcpPath -DestinationPath (Join-Path $stagingRoot "outlook_graph_mcp.py")) {
        $copied += "outlook_graph_mcp.py"
    }
    if ($copied.Count -eq 0) {
        throw "No connector credential files were found to provision."
    }
    Set-ImportDirectoryAcl -Path $stagingRoot
}

$mode = if ($CheckOnly) { "check" } else { "install" }
$shell = @"
set -euo pipefail
mode="$mode"
staging="$stagingWslPath"
worker_user="$WorkerLinuxUser"
profiles="$profilesText"
owner_secret_root="/home/$WorkerLinuxUser/.hermes/external-connectors/owner"
worker_scripts_dir="/home/$WorkerLinuxUser/.hermes/scripts"
python="/opt/hermes-gateway-runtime/venv/bin/python"

patch_google_workspace_skill() {
  profile_dir="`$1"
  scripts_dir="`$profile_dir/skills/productivity/google-workspace/scripts"
  if [ ! -d "`$scripts_dir" ]; then
    return 0
  fi

  cat > "`$scripts_dir/_hermes_home.py" <<'PY'
"""Resolve HERMES_HOME for standalone skill scripts.

Profile-local Skill copies run with process HERMES_HOME set to the shared
Hermes home.  For connector credentials, prefer the enclosing profile
directory when this file lives under ``~/.hermes/profiles/<profile>/skills``.
"""

from __future__ import annotations

import os
from pathlib import Path


def _profile_home_from_script() -> Path | None:
    current = Path(__file__).resolve()
    parts = current.parts
    for idx, part in enumerate(parts):
        if part == "profiles" and idx + 1 < len(parts):
            candidate = Path(*parts[:idx + 2])
            if (candidate / "skills").exists() or (candidate / "config.yaml").exists():
                return candidate
    return None


def get_hermes_home() -> Path:
    explicit = os.environ.get("HERMES_GOOGLE_PROFILE_HOME", "").strip()
    if explicit:
        return Path(explicit)
    inferred = _profile_home_from_script()
    if inferred is not None:
        return inferred
    val = os.environ.get("HERMES_HOME", "").strip()
    return Path(val) if val else Path.home() / ".hermes"


def display_hermes_home() -> str:
    home = get_hermes_home()
    try:
        return "~/" + str(home.relative_to(Path.home()))
    except ValueError:
        return str(home)
PY

  cat > "`$scripts_dir/_google_runtime.py" <<'PY'
"""Run Google Workspace scripts with the Gateway runtime Python when needed."""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import sys


REQUIRED_MODULES = ("googleapiclient", "google.oauth2", "google_auth_oauthlib")


def _module_missing(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is None
    except ModuleNotFoundError:
        return True


def ensure_google_runtime_python() -> None:
    missing = [name for name in REQUIRED_MODULES if _module_missing(name)]
    if not missing:
        return
    if os.environ.get("HERMES_GOOGLE_RUNTIME_REEXEC") == "1":
        return
    runtime_python = Path(os.environ.get("HERMES_GOOGLE_RUNTIME_PYTHON", "/opt/hermes-gateway-runtime/venv/bin/python"))
    if not runtime_python.exists():
        return
    try:
        current = Path(sys.executable).resolve()
        target = runtime_python.resolve()
    except Exception:
        current = Path(sys.executable)
        target = runtime_python
    if current == target:
        return
    env = os.environ.copy()
    env["HERMES_GOOGLE_RUNTIME_REEXEC"] = "1"
    os.execve(str(runtime_python), [str(runtime_python), *sys.argv], env)
PY

  for script_name in google_api.py setup.py; do
    script_path="`$scripts_dir/`$script_name"
    if [ -f "`$script_path" ] && ! grep -q "ensure_google_runtime_python" "`$script_path"; then
      "`$python" - "`$script_path" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
if "from _google_runtime import ensure_google_runtime_python" in text:
    raise SystemExit(0)
marker = "from _hermes_home import "
line_start = text.find(marker)
if line_start < 0:
    raise SystemExit(f"Cannot find _hermes_home import in {path}")
line_end = text.find("\n", line_start)
insert = "\nfrom _google_runtime import ensure_google_runtime_python\nensure_google_runtime_python()\n"
text = text[:line_end + 1] + insert + text[line_end + 1:]
path.write_text(text)
PY
    fi
  done
  chown -R "`$worker_user:`$worker_user" "`$scripts_dir"
  chmod 755 "`$scripts_dir" || true
}

if [ "`$mode" = "install" ]; then
  mkdir -p "`$owner_secret_root/microsoft-graph-outlook-mail" "`$worker_scripts_dir"
  if [ -f "`$staging/google_token.json" ]; then
    install -o "`$worker_user" -g "`$worker_user" -m 600 "`$staging/google_token.json" "`$owner_secret_root/google_token.json"
  fi
  if [ -f "`$staging/google_client_secret.json" ]; then
    install -o "`$worker_user" -g "`$worker_user" -m 600 "`$staging/google_client_secret.json" "`$owner_secret_root/google_client_secret.json"
  fi
  if [ -f "`$staging/microsoft-graph-outlook-mail/token.json" ]; then
    install -o "`$worker_user" -g "`$worker_user" -m 600 "`$staging/microsoft-graph-outlook-mail/token.json" "`$owner_secret_root/microsoft-graph-outlook-mail/token.json"
  fi
  if [ -f "`$staging/outlook_graph.env" ]; then
    install -o "`$worker_user" -g "`$worker_user" -m 600 "`$staging/outlook_graph.env" "`$owner_secret_root/outlook_graph.env"
  fi
  if [ -f "`$staging/outlook_graph_mcp.py" ]; then
    install -o "`$worker_user" -g "`$worker_user" -m 700 "`$staging/outlook_graph_mcp.py" "`$worker_scripts_dir/outlook_graph_mcp.py"
  fi
  chown -R "`$worker_user:`$worker_user" "`$owner_secret_root"
  chown -R "`$worker_user:`$worker_user" "`$worker_scripts_dir"
  chmod 700 "`$owner_secret_root" "`$owner_secret_root/microsoft-graph-outlook-mail" "`$worker_scripts_dir"

  for profile in `$profiles; do
    profile_dir="/home/`$worker_user/.hermes/profiles/`$profile"
    mkdir -p "`$profile_dir/microsoft-graph-outlook-mail"
    chown -R "`$worker_user:`$worker_user" "`$profile_dir"
    if [ -f "`$owner_secret_root/google_token.json" ]; then
      ln -sfn "`$owner_secret_root/google_token.json" "`$profile_dir/google_token.json"
      chown -h "`$worker_user:`$worker_user" "`$profile_dir/google_token.json" || true
    fi
    if [ -f "`$owner_secret_root/google_client_secret.json" ]; then
      ln -sfn "`$owner_secret_root/google_client_secret.json" "`$profile_dir/google_client_secret.json"
      chown -h "`$worker_user:`$worker_user" "`$profile_dir/google_client_secret.json" || true
    fi
    if [ -f "`$owner_secret_root/microsoft-graph-outlook-mail/token.json" ]; then
      ln -sfn "`$owner_secret_root/microsoft-graph-outlook-mail/token.json" "`$profile_dir/microsoft-graph-outlook-mail/token.json"
      chown -h "`$worker_user:`$worker_user" "`$profile_dir/microsoft-graph-outlook-mail/token.json" || true
    fi
    if [ -f "`$owner_secret_root/outlook_graph.env" ]; then
      install -o "`$worker_user" -g "`$worker_user" -m 600 "`$owner_secret_root/outlook_graph.env" "`$profile_dir/.env"
    fi
    patch_google_workspace_skill "`$profile_dir"
  done
fi

runuser -u "`$worker_user" -- env HOME="/home/`$worker_user" HERMES_HOME="/home/`$worker_user/.hermes" PYTHONPATH="/opt/hermes-gateway-runtime/official-clean" "`$python" - <<'PY'
import importlib.util
missing = [name for name in ("googleapiclient", "google.oauth2", "google_auth_oauthlib") if importlib.util.find_spec(name) is None]
if missing:
    raise SystemExit("missing python modules: " + ", ".join(missing))
print("python_google_deps=ok")
PY
if [ -f "`$worker_scripts_dir/outlook_graph_mcp.py" ]; then
  runuser -u "`$worker_user" -- env HOME="/home/`$worker_user" HERMES_HOME="/home/`$worker_user/.hermes" PYTHONPATH="/opt/hermes-gateway-runtime/official-clean" "`$python" -m py_compile "`$worker_scripts_dir/outlook_graph_mcp.py"
  echo "outlook_graph_mcp=installed"
fi

for profile in `$profiles; do
  profile_dir="/home/`$worker_user/.hermes/profiles/`$profile"
  echo "---`$profile"
  for rel in google_token.json google_client_secret.json microsoft-graph-outlook-mail/token.json .env; do
    if [ -e "`$profile_dir/`$rel" ]; then
      runuser -u "`$worker_user" -- test -r "`$profile_dir/`$rel"
      stat -c "link:%N" "`$profile_dir/`$rel" | sed -E "s#`$owner_secret_root#[owner-secret-root]#g"
      stat -Lc "target:%n %U:%G %a %s" "`$profile_dir/`$rel" | sed -E "s#`$owner_secret_root#[owner-secret-root]#g"
    else
      echo "missing:`$rel"
    fi
  done
  if [ -f "`$profile_dir/.env" ] && grep -q '^MS_GRAPH_CLIENT_ID=' "`$profile_dir/.env"; then
    echo "outlook_graph_env=present"
  else
    echo "outlook_graph_env=missing"
  fi
  google_setup="`$profile_dir/skills/productivity/google-workspace/scripts/setup.py"
  if [ -f "`$google_setup" ]; then
    runuser -u "`$worker_user" -- env HOME="/home/`$worker_user" HERMES_HOME="/home/`$worker_user/.hermes" HERMES_GOOGLE_PROFILE_HOME="`$profile_dir" python3 "`$google_setup" --check >/tmp/hermes-google-check-`$profile.out 2>&1
    echo "google_workspace_setup_check=ok"
  else
    echo "google_workspace_setup_check=missing"
  fi
done
"@

$child = @"
`$ErrorActionPreference = "Stop"
& wsl.exe -d "$DistroName" -u root -- bash "$shellWslPath"
if (`$LASTEXITCODE -ne 0) { throw "Worker external connector provisioning failed with exit code `$LASTEXITCODE" }
"@

try {
    [System.IO.File]::WriteAllText($shellScript, $shell, $encoding)
    [System.IO.File]::WriteAllText($childScript, $child, $encoding)
    & $WorkerRunAsScript -ChildScript $childScript
} finally {
    if (-not $CheckOnly -and (Test-Path -LiteralPath $stagingRoot)) {
        Remove-Item -LiteralPath $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
