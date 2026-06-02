param(
  [string] $NasHost = "192.168.10.99",
  [string] $NasUser = "xuxinxp",
  [int] $NasPort = 2222,
  [string] $SshKeyPath = "$env:USERPROFILE\.ssh\synology_ed25519",
  [string] $RemoteRoot = "/volume1/docker/hermes-mobile",
  [string] $RemoteNode = "/volume1/docker/hermes-mobile/runtime/node-v22.22.3-linux-x64/bin/node",
  [string] $PublicOrigin = "https://wardrobe-xuxin.synology.me:8555",
  [string[]] $Files = @(
    "public/index.html",
    "public/service-worker.js",
    "public/directory-viewer.html",
    "tests/task-list-ui.test.js"
  )
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
print(json.dumps({
    'ok': data.get('ok'),
    'health': (data.get('health') or {}).get('status'),
    'activeGlobal': (data.get('concurrency') or {}).get('activeGlobal'),
    'clientVersion': (data.get('clientVersion') or {}).get('version'),
    'gatewayMode': (data.get('gatewayPool') or {}).get('mode'),
    'workerCount': (data.get('gatewayPool') or {}).get('workerCount'),
}, ensure_ascii=False))
"@
  $output = Invoke-NasPython $python
  return $output | ConvertFrom-Json
}

function Backup-NasFiles {
  param([string] $Version, [string[]] $RelFiles)
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backup = "$RemoteRoot/backups/$Version-$stamp"
  $fileList = ($RelFiles -join " ")
  $null = Invoke-NasSsh "set -e
backup='$backup'
files='$fileList'
for root in '$RemoteRoot/app' '$RemoteRoot/source'; do
  for f in `$files; do
    mkdir -p ""`$backup/`$(basename `$root)/`$(dirname `$f)""
    if [ -f ""`$root/`$f"" ]; then cp ""`$root/`$f"" ""`$backup/`$(basename `$root)/`$f""; fi
    mkdir -p ""`$root/`$(dirname `$f)""
  done
done
printf '%s\n' ""`$backup"""
  return $backup
}

function New-StaticTarBase64 {
  param([string] $RepoRoot, [string[]] $RelFiles)
  $tempBase = Join-Path ([System.IO.Path]::GetTempPath()) ("hermes-nas-static-" + [System.Guid]::NewGuid().ToString("N"))
  $tarPath = "$tempBase.tar"
  $b64Path = "$tempBase.tar.b64"
  try {
    Push-Location $RepoRoot
    $tarArgs = @("-cf", $tarPath) + $RelFiles
    & tar.exe @tarArgs
    if ($LASTEXITCODE -ne 0) {
      throw "local tar failed with exit code $LASTEXITCODE"
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
  $remoteB64 = "/tmp/hermes-mobile-$Version-static.tar.b64"
  $remoteTar = "/tmp/hermes-mobile-$Version-static.tar"
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
tar -xf '$remoteTar' -C '$RemoteRoot/app'
tar -xf '$remoteTar' -C '$RemoteRoot/source'
rm -f '$remoteTar' '$remoteB64'"
}

function Get-LocalHashes {
  param([string] $RepoRoot, [string[]] $RelFiles)
  $items = @{}
  foreach ($file in $RelFiles) {
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $RepoRoot $file)).Hash.ToLowerInvariant()
    $items[$file] = $hash
  }
  return $items
}

function Get-NasHashes {
  param([string[]] $RelFiles)
  $fileList = ($RelFiles -join " ")
  $output = Invoke-NasSsh "set -e
cd '$RemoteRoot/app'
sha256sum $fileList
echo SOURCE
cd '$RemoteRoot/source'
sha256sum $fileList"
  return $output
}

function Assert-HashesMatch {
  param([hashtable] $LocalHashes, [string] $RemoteOutput, [string[]] $RelFiles)
  foreach ($file in $RelFiles) {
    $escaped = [regex]::Escape($file)
    $matches = [regex]::Matches($RemoteOutput, "([0-9a-f]{64})\s+$escaped")
    if ($matches.Count -ne 2) {
      throw "expected app and source hash entries for $file"
    }
    foreach ($match in $matches) {
      if ($match.Groups[1].Value -ne $LocalHashes[$file]) {
        throw "hash mismatch for $file"
      }
    }
  }
}

function Invoke-NasChecks {
  Invoke-NasSsh "cd '$RemoteRoot/app' && '$RemoteNode' --check public/service-worker.js && '$RemoteNode' tests/task-list-ui.test.js && '$RemoteNode' tests/static-cache-version-harness.test.js"
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

$repoRoot = Resolve-RepoRoot
if (-not (Test-Path -LiteralPath $SshKeyPath)) {
  throw "SSH key file not found: $SshKeyPath"
}

$version = Read-ClientVersion $repoRoot
Write-Host "Preparing NAS static deploy for $version"

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
  throw "NAS has active runs; aborting static deploy"
}

$backup = Backup-NasFiles -Version $version -RelFiles $Files
Write-Host "NAS backup: $backup"

$archive = New-StaticTarBase64 -RepoRoot $repoRoot -RelFiles $Files
try {
  Push-NasArchive -Base64Path $archive.Base64 -Version $version
} finally {
  Remove-Item -LiteralPath $archive.Tar, $archive.Base64 -ErrorAction SilentlyContinue
}

$localHashes = Get-LocalHashes -RepoRoot $repoRoot -RelFiles $Files
$remoteHashes = Get-NasHashes -RelFiles $Files
Assert-HashesMatch -LocalHashes $localHashes -RemoteOutput ($remoteHashes -join "`n") -RelFiles $Files
Write-Host "NAS app/source hashes match local files."

Invoke-NasChecks
$smoke = Invoke-NasVersionSmoke -Version $version
Write-Host ("NAS version smoke: " + ($smoke -join " "))
Invoke-PublicOriginSmoke -Version $version
Write-Host "NAS static deploy completed."
