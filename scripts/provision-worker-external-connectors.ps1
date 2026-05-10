param(
    [string]$WorkerRunAsScript = "C:\ProgramData\HermesMobile\gateway-worker\run-as-worker.ps1",
    [string]$WorkerDirectory = "C:\ProgramData\HermesMobile\gateway-worker",
    [string]$DistroName = "HermesGatewayWorker",
    [string]$WorkerLinuxUser = "hermes",
    [string[]]$Profiles = @("lowgw1", "lowgw2", "lowgw3", "lowgw4", "lowgw10"),
    [string]$GoogleTokenPath = $env:HERMES_WEB_GOOGLE_TOKEN_PATH,
    [string]$GoogleClientSecretPath = $env:HERMES_WEB_GOOGLE_CLIENT_SECRET_PATH,
    [string]$OutlookGraphTokenPath = $env:HERMES_WEB_OUTLOOK_GRAPH_TOKEN_PATH,
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
python="/opt/hermes-gateway-runtime/venv/bin/python"

if [ "`$mode" = "install" ]; then
  mkdir -p "`$owner_secret_root/microsoft-graph-outlook-mail"
  if [ -f "`$staging/google_token.json" ]; then
    install -o "`$worker_user" -g "`$worker_user" -m 600 "`$staging/google_token.json" "`$owner_secret_root/google_token.json"
  fi
  if [ -f "`$staging/google_client_secret.json" ]; then
    install -o "`$worker_user" -g "`$worker_user" -m 600 "`$staging/google_client_secret.json" "`$owner_secret_root/google_client_secret.json"
  fi
  if [ -f "`$staging/microsoft-graph-outlook-mail/token.json" ]; then
    install -o "`$worker_user" -g "`$worker_user" -m 600 "`$staging/microsoft-graph-outlook-mail/token.json" "`$owner_secret_root/microsoft-graph-outlook-mail/token.json"
  fi
  chown -R "`$worker_user:`$worker_user" "`$owner_secret_root"
  chmod 700 "`$owner_secret_root" "`$owner_secret_root/microsoft-graph-outlook-mail"

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
  done
fi

runuser -u "`$worker_user" -- env HOME="/home/`$worker_user" HERMES_HOME="/home/`$worker_user/.hermes" PYTHONPATH="/opt/hermes-gateway-runtime/official-clean" "`$python" - <<'PY'
import importlib.util
missing = [name for name in ("googleapiclient", "google.oauth2", "google_auth_oauthlib") if importlib.util.find_spec(name) is None]
if missing:
    raise SystemExit("missing python modules: " + ", ".join(missing))
print("python_google_deps=ok")
PY

for profile in `$profiles; do
  profile_dir="/home/`$worker_user/.hermes/profiles/`$profile"
  echo "---`$profile"
  for rel in google_token.json google_client_secret.json microsoft-graph-outlook-mail/token.json; do
    if [ -e "`$profile_dir/`$rel" ]; then
      runuser -u "`$worker_user" -- test -r "`$profile_dir/`$rel"
      stat -c "link:%N" "`$profile_dir/`$rel" | sed -E "s#`$owner_secret_root#[owner-secret-root]#g"
      stat -Lc "target:%n %U:%G %a %s" "`$profile_dir/`$rel" | sed -E "s#`$owner_secret_root#[owner-secret-root]#g"
    else
      echo "missing:`$rel"
    fi
  done
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
