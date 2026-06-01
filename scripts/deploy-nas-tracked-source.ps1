param(
  [string] $NasHost = "192.168.10.99",
  [string] $NasUser = "xuxinxp",
  [int] $NasPort = 2222,
  [string] $SshKeyPath = "$env:USERPROFILE\.ssh\synology_ed25519",
  [string] $RemoteRoot = "/volume1/docker/hermes-mobile",
  [string] $RemoteNode = "/volume1/docker/hermes-mobile/runtime/node-v22.22.3-linux-x64/bin/node",
  [string] $PublicOrigin = "https://wardrobe-xuxin.synology.me:8555",
  [switch] $RestartListener
)

$ErrorActionPreference = "Stop"

function Resolve-RepoRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Read-ClientVersion {
  param([string] $RepoRoot)
  $indexPath = Join-Path $RepoRoot "public/index.html"
  $text = [System.IO.File]::ReadAllText($indexPath, [System.Text.Encoding]::UTF8)
  $match = [regex]::Match($text, 'data-client-version="([^"]+)"')
  if (-not $match.Success) {
    throw "public/index.html does not expose data-client-version"
  }
  return $match.Groups[1].Value
}

function Invoke-NasSsh {
  param([string] $Command)
  $target = "$NasUser@$NasHost"
  & ssh -i $SshKeyPath -p $NasPort -o BatchMode=yes -o ConnectTimeout=15 $target $Command
  if ($LASTEXITCODE -ne 0) {
    throw "ssh command failed with exit code $LASTEXITCODE"
  }
}

function Invoke-NasPython {
  param([string] $Python)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Python)
  $b64 = [Convert]::ToBase64String($bytes)
  Invoke-NasSsh "B64='$b64' python3 -c 'import os,base64; exec(base64.b64decode(os.environ.get(chr(66)+chr(54)+chr(52))).decode())'"
}

function Get-NasStatus {
  $python = @"
import json, urllib.request
key = open('$RemoteRoot/data/secrets/owner-web-key.secret', 'r', encoding='utf-8').read().strip()
req = urllib.request.Request('http://127.0.0.1:8797/api/status?detail=1', headers={'X-Hermes-Web-Key': key})
with urllib.request.urlopen(req, timeout=20) as resp:
    data = json.loads(resp.read().decode('utf-8'))
gp = data.get('gatewayPool') or {}
print(json.dumps({
    'ok': data.get('ok'),
    'health': (data.get('health') or {}).get('status'),
    'activeGlobal': (data.get('concurrency') or {}).get('activeGlobal'),
    'clientVersion': (data.get('clientVersion') or {}).get('version'),
    'gatewayMode': gp.get('mode'),
    'workerCount': gp.get('workerCount'),
}, ensure_ascii=False))
"@
  $output = Invoke-NasPython $python
  return $output | ConvertFrom-Json
}

function Invoke-NasFirstStartPreflight {
  param(
    [string] $ExpectedVersion,
    [switch] $StrictHybridParity
  )
  $python = @"
import json, re, urllib.request
from pathlib import Path

root = Path('$RemoteRoot')
key = (root / 'data/secrets/owner-web-key.secret').read_text(encoding='utf-8').strip()
req = urllib.request.Request('http://127.0.0.1:8797/api/status?detail=1', headers={'X-Hermes-Web-Key': key})
with urllib.request.urlopen(req, timeout=20) as resp:
    status = json.loads(resp.read().decode('utf-8'))

def read_version(path):
    text = Path(path).read_text(encoding='utf-8', errors='ignore')
    match = re.search(r'data-client-version="([^"]+)"', text)
    return match.group(1) if match else ''

app_version = read_version(root / 'app/public/index.html')
source_version = read_version(root / 'source/public/index.html')
gp = status.get('gatewayPool') or {}
workers = gp.get('workers') or []
user_workers = [
    w for w in workers
    if w.get('enabled', True) is not False and w.get('securityLevel') == 'user'
]
healthy_user_workers = [w for w in user_workers if w.get('healthy') is True]
single_worker_bridge = (
    len(user_workers) == 1
    and (user_workers[0].get('profile') or user_workers[0].get('name')) == 'nas-local-codex'
    and user_workers[0].get('allowedWorkspaceIds') == ['*']
)
issues = []
warnings = []
repairs = []

if app_version != '$ExpectedVersion':
    issues.append('app_index_version_mismatch')
if source_version != '$ExpectedVersion':
    issues.append('source_index_version_mismatch')
if (status.get('clientVersion') or {}).get('version') != '$ExpectedVersion':
    issues.append('served_client_version_mismatch')
if not status.get('ok') or (status.get('health') or {}).get('status') != 'ok':
    issues.append('status_not_ok')
if not gp.get('enabled'):
    issues.append('gateway_pool_disabled')
if not user_workers:
    issues.append('gateway_user_worker_missing')
if not healthy_user_workers:
    issues.append('gateway_healthy_user_worker_missing')
if single_worker_bridge:
    warnings.append('nas_single_worker_bridge_not_hybrid_parity')
if '$StrictHybridParity'.lower() == 'true':
    if gp.get('mode') != 'hybrid' or single_worker_bridge:
        issues.append('gateway_not_hybrid_parity')

print(json.dumps({
    'ok': len(issues) == 0,
    'issues': issues,
    'warnings': warnings,
    'repairs': repairs,
    'appVersion': app_version,
    'sourceVersion': source_version,
    'servedVersion': (status.get('clientVersion') or {}).get('version'),
    'gatewayMode': gp.get('mode'),
    'workerCount': gp.get('workerCount'),
    'userWorkerCount': len(user_workers),
    'healthyUserWorkerCount': len(healthy_user_workers),
    'singleWorkerBridge': single_worker_bridge,
}, ensure_ascii=False))
"@
  $output = Invoke-NasPython $python
  $result = $output | ConvertFrom-Json
  Write-Host ("NAS first-start preflight: " + ($result | ConvertTo-Json -Compress))
  if (-not $result.ok) {
    throw "NAS first-start preflight failed: $($result.issues -join ', ')"
  }
  return $result
}

function New-GitArchiveBase64 {
  param([string] $RepoRoot)
  $tempBase = Join-Path ([System.IO.Path]::GetTempPath()) ("hermes-nas-source-" + [System.Guid]::NewGuid().ToString("N"))
  $tarPath = "$tempBase.tar"
  $b64Path = "$tempBase.tar.b64"
  Push-Location $RepoRoot
  try {
    & git archive --format=tar --output=$tarPath HEAD
    if ($LASTEXITCODE -ne 0) {
      throw "git archive failed with exit code $LASTEXITCODE"
    }
    [System.IO.File]::WriteAllText(
      $b64Path,
      [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($tarPath)),
      [System.Text.Encoding]::ASCII
    )
    return [pscustomobject]@{ Tar = $tarPath; Base64 = $b64Path }
  } finally {
    Pop-Location
  }
}

function Push-NasArchive {
  param([string] $Base64Path, [string] $Version)
  $target = "$NasUser@$NasHost"
  $remoteB64 = "/tmp/hermes-mobile-$Version-source.tar.b64"
  $remoteTar = "/tmp/hermes-mobile-$Version-source.tar"
  $uploadCommand = 'type "' + $Base64Path + '" | ssh -i "' + $SshKeyPath + '" -p ' + $NasPort + ' -o BatchMode=yes -o ConnectTimeout=15 ' + $target + ' "cat > ' + $remoteB64 + '"'
  cmd.exe /d /c $uploadCommand
  if ($LASTEXITCODE -ne 0) {
    throw "base64 upload failed with exit code $LASTEXITCODE"
  }
  Invoke-NasSsh "set -e
python3 - <<'PY'
import base64, pathlib
b64_path = pathlib.Path('$remoteB64')
tar_path = pathlib.Path('$remoteTar')
tar_path.write_bytes(base64.b64decode(b64_path.read_text().strip()))
PY
stamp=`$(date +%Y%m%d-%H%M%S)
backup=""$RemoteRoot/backups/$Version-`$stamp""
mkdir -p ""`$backup/app"" ""`$backup/source""
tar -tf '$remoteTar' | while IFS= read -r f; do
  case ""`$f"" in
    */) continue ;;
    .agent-context/*|.codegraph/*|node_modules/*|*.sqlite3|*.db|*.secret) continue ;;
  esac
  for root in '$RemoteRoot/app' '$RemoteRoot/source'; do
    if [ -f ""`$root/`$f"" ]; then
      mkdir -p ""`$backup/`$(basename `$root)/`$(dirname `$f)""
      cp ""`$root/`$f"" ""`$backup/`$(basename `$root)/`$f""
    fi
  done
done
tar -xf '$remoteTar' -C '$RemoteRoot/app'
tar -xf '$remoteTar' -C '$RemoteRoot/source'
rm -f '$remoteTar' '$remoteB64'
printf '%s\n' ""`$backup"""
}

function Invoke-NasChecks {
  Invoke-NasSsh "cd '$RemoteRoot/app' && '$RemoteNode' --check server.js && '$RemoteNode' --check public/service-worker.js && '$RemoteNode' tests/task-list-ui.test.js && '$RemoteNode' tests/static-cache-version-harness.test.js"
}

function Invoke-NasVersionSmoke {
  param([string] $Version)
  $python = @"
import json, urllib.request
key = open('$RemoteRoot/data/secrets/owner-web-key.secret', 'r', encoding='utf-8').read().strip()
def get(path):
    req = urllib.request.Request('http://127.0.0.1:8797' + path, headers={'X-Hermes-Web-Key': key})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode('utf-8'))
status = get('/api/status?detail=1')
client = get('/api/client-version?clientVersion=$Version')
print(json.dumps({
    'ok': status.get('ok'),
    'health': (status.get('health') or {}).get('status'),
    'activeGlobal': (status.get('concurrency') or {}).get('activeGlobal'),
    'clientVersion': (status.get('clientVersion') or {}).get('version'),
    'refreshRequired': client.get('refreshRequired'),
    'gatewayMode': (status.get('gatewayPool') or {}).get('mode'),
    'workerCount': (status.get('gatewayPool') or {}).get('workerCount'),
}, ensure_ascii=False))
"@
  return Invoke-NasPython $python
}

function Invoke-PublicOriginSmoke {
  param([string] $Version)
  if (-not $PublicOrigin) {
    return
  }
  $response = Invoke-WebRequest -UseBasicParsing -Uri "$PublicOrigin/?source=pwa" -TimeoutSec 30
  if ([int] $response.StatusCode -ne 200) {
    throw "public origin returned HTTP $($response.StatusCode)"
  }
  if ($response.Content -notlike "*$Version*") {
    throw "public origin HTML does not contain $Version"
  }
}

function Restart-NasListener {
  Invoke-NasSsh "cd '$RemoteRoot/app' && if [ -x '$RemoteRoot/config/stop-hermes-processes.sh' ]; then '$RemoteRoot/config/stop-hermes-processes.sh'; fi && nohup '$RemoteRoot/config/start-hermes-mobile.sh' >/tmp/hermes-mobile-restart.out 2>/tmp/hermes-mobile-restart.err &"
  Start-Sleep -Seconds 4
}

$repoRoot = Resolve-RepoRoot
if (-not (Test-Path -LiteralPath $SshKeyPath)) {
  throw "SSH key file not found: $SshKeyPath"
}

$version = Read-ClientVersion $repoRoot
Write-Host "Preparing NAS tracked-source deploy for $version"

$status = Get-NasStatus
Write-Host ("NAS status before deploy: " + ($status | ConvertTo-Json -Compress))
if (-not $status.ok -or $status.health -ne "ok") {
  throw "NAS status is not healthy"
}
$activeGlobal = 0
if ($null -ne $status.activeGlobal) {
  $activeGlobal = [int] $status.activeGlobal
}
if ($activeGlobal -ne 0) {
  throw "NAS has active runs; aborting source deploy"
}

$preBefore = Invoke-NasFirstStartPreflight -ExpectedVersion $status.clientVersion
Write-Host ("NAS first-start preflight before deploy warning count: " + (($preBefore.warnings | Measure-Object).Count))

$archive = New-GitArchiveBase64 -RepoRoot $repoRoot
try {
  $backup = Push-NasArchive -Base64Path $archive.Base64 -Version $version
  Write-Host "NAS backup: $backup"
} finally {
  Remove-Item -LiteralPath $archive.Tar, $archive.Base64 -ErrorAction SilentlyContinue
}

Invoke-NasChecks
if ($RestartListener) {
  Restart-NasListener
}
$smoke = Invoke-NasVersionSmoke -Version $version
Write-Host ("NAS version smoke: " + ($smoke -join " "))
$preAfter = Invoke-NasFirstStartPreflight -ExpectedVersion $version
Write-Host ("NAS first-start preflight after deploy warning count: " + (($preAfter.warnings | Measure-Object).Count))
Invoke-PublicOriginSmoke -Version $version
Write-Host "NAS tracked-source deploy completed."
