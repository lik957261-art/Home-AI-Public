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
skill_profiles_root = root / 'data/skill-profiles'
gateway_profiles_root = root / 'gateway-worker/profiles'
base_hermes_home = Path('/var/services/homes/xuxinxp/.hermes')

def normalized_workspace_ids(worker):
    raw = worker.get('allowedWorkspaceIds') or worker.get('allowed_workspace_ids') or []
    if isinstance(raw, str):
        raw = [item.strip() for item in raw.split(',') if item.strip()]
    return [str(item).strip() for item in raw if str(item).strip()]

def skill_profile_name(worker, workspace_id):
    raw = str(worker.get('skillProfile') or worker.get('skill_profile') or '').strip()
    if raw.lower().startswith('workspace:'):
        return raw.split(':', 1)[1].strip()
    if raw:
        return raw
    return 'owner-full' if workspace_id == 'owner' else workspace_id

def is_publicly_accessible(path):
    try:
        return bool(path.stat().st_mode & 0o077)
    except FileNotFoundError:
        return False

def is_documented_grok_wildcard(worker):
    profile = str(worker.get('profile') or worker.get('name') or '').strip()
    provider = str(worker.get('provider') or worker.get('modelProvider') or worker.get('model_provider') or '').strip()
    markers = []
    for key in ('toolsets', 'tags'):
        raw = worker.get(key) or []
        if isinstance(raw, str):
            raw = [raw]
        markers.extend(raw)
    return (
        profile == 'grokgw1'
        and provider == 'xai-oauth'
        and ('grok' in markers or 'xai-oauth' in markers)
    )

def finance_config_missing_for_key(workspace_id):
    finance_root = root / 'data/drive/users' / workspace_id / '.hermes-finance'
    key_path = finance_root / 'access-key.txt'
    config_path = finance_root / 'config.json'
    try:
        return key_path.exists() and not config_path.exists()
    except Exception:
        return False

if not skill_profiles_root.exists():
    issues.append('nas_skill_profiles_missing')

users_root = root / 'data/drive/users'
try:
    for entry in users_root.iterdir():
        if entry.is_dir() and finance_config_missing_for_key(entry.name):
            issues.append(f'nas_finance_config_missing:{entry.name}')
except FileNotFoundError:
    pass

for worker in user_workers:
    profile = str(worker.get('profile') or worker.get('name') or '').strip()
    workspace_ids = normalized_workspace_ids(worker)
    if workspace_ids == ['*']:
        if not single_worker_bridge and not is_documented_grok_wildcard(worker):
            issues.append(f'nas_user_worker_wildcard_workspace:{profile}')
        continue
    if len(workspace_ids) != 1:
        issues.append(f'nas_user_worker_not_single_workspace:{profile}')
        continue
    workspace_id = workspace_ids[0]
    workspace_root = root / 'data/drive/users' / workspace_id
    if not workspace_root.exists():
        issues.append(f'nas_workspace_root_missing:{workspace_id}')
    elif is_publicly_accessible(workspace_root):
        issues.append(f'nas_workspace_root_not_private:{workspace_id}')
    skill_profile = skill_profile_name(worker, workspace_id)
    skill_store = skill_profiles_root / skill_profile / 'skills'
    if not skill_store.exists():
        issues.append(f'nas_worker_skill_store_missing:{profile}:{skill_profile}')
    profile_home = gateway_profiles_root / profile
    profile_skills = profile_home / 'skills'
    profile_memories = profile_home / 'memories'
    if profile and profile_home.exists():
        if profile_skills.is_symlink():
            try:
                target = Path(profile_skills.resolve())
            except Exception:
                target = Path('')
            if str(target).startswith(str(base_hermes_home / 'skills')):
                issues.append(f'nas_worker_uses_shared_base_skills:{profile}')
            if skill_store.exists() and target != skill_store.resolve():
                issues.append(f'nas_worker_skill_store_mismatch:{profile}')
        elif profile_skills.exists():
            issues.append(f'nas_worker_skills_not_linked:{profile}')
        else:
            issues.append(f'nas_worker_skills_missing:{profile}')
        if profile_memories.is_symlink():
            try:
                memory_target = Path(profile_memories.resolve())
            except Exception:
                memory_target = Path('')
            if str(memory_target).startswith(str(base_hermes_home / 'memories')):
                issues.append(f'nas_worker_uses_shared_base_memories:{profile}')
        elif profile_memories.exists():
            issues.append(f'nas_worker_memories_not_linked:{profile}')
        else:
            issues.append(f'nas_worker_memories_missing:{profile}')

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
if gp.get('mode') != 'hybrid':
    issues.append('gateway_mode_not_hybrid')
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

function Sync-NasRuntimeConfigScripts {
  $python = @"
from pathlib import Path
import shutil
import time

root = Path('$RemoteRoot')
pairs = [
    (root / 'app/scripts/start-nas-gateway-pool.sh', root / 'config/start-nas-gateway-pool.sh'),
]
synced = []
for src, dst in pairs:
    if not src.exists():
        raise SystemExit(f'nas_runtime_config_source_missing:{src}')
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists() and src.read_bytes() == dst.read_bytes():
        continue
    if dst.exists():
        backup = dst.with_name(dst.name + '.before-sync-' + time.strftime('%Y%m%d-%H%M%S'))
        shutil.copy2(dst, backup)
    shutil.copy2(src, dst)
    dst.chmod(0o755)
    synced.append(str(dst))
print(';'.join(synced) if synced else 'runtime config scripts already current')
"@
  Invoke-NasPython $python
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
owner_elevation = get('/api/owner-elevation').get('ownerElevation') or {}
if owner_elevation.get('available') is not True:
    raise SystemExit('owner_elevation_unavailable:' + str(owner_elevation.get('reason') or 'unknown'))
print(json.dumps({
    'ok': status.get('ok'),
    'health': (status.get('health') or {}).get('status'),
    'activeGlobal': (status.get('concurrency') or {}).get('activeGlobal'),
    'clientVersion': (status.get('clientVersion') or {}).get('version'),
    'refreshRequired': client.get('refreshRequired'),
    'ownerElevationAvailable': owner_elevation.get('available'),
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
  $python = @"
import json, os, signal, subprocess, time, urllib.request
from pathlib import Path

root = Path('$RemoteRoot')
app_root = root / 'app'
launcher = root / 'config/start-hermes-mobile.sh'
log_path = root / 'runtime/hermes-mobile-listener-restart.log'

def public_config():
    try:
        with urllib.request.urlopen('http://127.0.0.1:8797/api/public-config', timeout=2) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception:
        return None

def listener_pids():
    try:
        proc = subprocess.run(['ps', '-eo', 'pid=,args='], capture_output=True, text=True, timeout=10)
    except Exception:
        return []
    pids = []
    for raw_line in proc.stdout.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        pid_text, _, args = line.partition(' ')
        if not pid_text.isdigit():
            continue
        if 'server.js' not in args or 'node' not in args:
            continue
        if 'SynologyPhotos' in args:
            continue
        pids.append(int(pid_text))
    return sorted(set(pids))

def wait_until_down(timeout_seconds):
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if not listener_pids() and public_config() is None:
            return True
        time.sleep(0.5)
    return False

def stop_existing():
    killed = []
    pids = listener_pids()
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
            killed.append({'pid': pid, 'signal': 'TERM'})
        except ProcessLookupError:
            pass
    if not wait_until_down(20):
        for pid in listener_pids():
            try:
                os.kill(pid, signal.SIGKILL)
                killed.append({'pid': pid, 'signal': 'KILL'})
            except ProcessLookupError:
                pass
        if not wait_until_down(10):
            raise RuntimeError('nas_listener_restart_port_still_busy')
    return killed

def start_listener():
    if not launcher.exists():
        raise RuntimeError('nas_listener_launcher_missing')
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log = open(log_path, 'ab')
    try:
        return subprocess.Popen(
            [str(launcher)],
            cwd=str(app_root),
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    except Exception:
        log.close()
        raise

def wait_until_ready(proc, timeout_seconds):
    deadline = time.time() + timeout_seconds
    last_error = None
    while time.time() < deadline:
        cfg = public_config()
        if cfg is not None:
            return cfg
        if proc.poll() is not None:
            last_error = f'process_exited:{proc.returncode}'
        time.sleep(0.5)
    raise RuntimeError(last_error or 'nas_listener_restart_timeout')

killed = stop_existing()
proc = start_listener()
cfg = wait_until_ready(proc, 60)
if cfg.get('setupRequired') is not False:
    raise RuntimeError('nas_listener_restart_setup_required')
if cfg.get('ownerKeyConfigured') is not True:
    raise RuntimeError('nas_listener_restart_owner_key_unconfigured')
if cfg.get('ownerKeySource') != 'file':
    raise RuntimeError('nas_listener_restart_owner_key_not_file')

print(json.dumps({
    'ok': True,
    'killed': killed,
    'startedPid': proc.pid,
    'setupRequired': cfg.get('setupRequired'),
    'ownerKeyConfigured': cfg.get('ownerKeyConfigured'),
    'ownerKeySource': cfg.get('ownerKeySource'),
}, ensure_ascii=False))
"@
  $output = Invoke-NasPython $python
  Write-Host ("NAS listener restart: " + ($output -join " "))
  Invoke-NasSsh "if [ -x '$RemoteRoot/config/start-nas-gateway-pool.sh' ]; then '$RemoteRoot/config/start-nas-gateway-pool.sh' --start-profiles nasgw1 --no-stop-existing; fi"
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
Sync-NasRuntimeConfigScripts
if ($RestartListener) {
  Restart-NasListener
}
$smoke = Invoke-NasVersionSmoke -Version $version
Write-Host ("NAS version smoke: " + ($smoke -join " "))
$preAfter = Invoke-NasFirstStartPreflight -ExpectedVersion $version
Write-Host ("NAS first-start preflight after deploy warning count: " + (($preAfter.warnings | Measure-Object).Count))
Invoke-PublicOriginSmoke -Version $version
Write-Host "NAS tracked-source deploy completed."
