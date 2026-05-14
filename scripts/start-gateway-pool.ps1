param(
  [string]$GatewayWorkerRoot = "C:\ProgramData\HermesMobile\gateway-worker",
  [string]$ManifestPath = "C:\ProgramData\HermesMobile\data\gateway-pool-manifest.json",
  [string]$OfficialDistro = "Ubuntu-24.04",
  [string]$OfficialUser = "xuxin",
  [string]$GoogleTokenPath = "",
  [string]$GoogleClientSecretPath = "",
  [string]$OutlookGraphTokenPath = "",
  [string]$OutlookGraphEnvPath = "",
  [string]$OutlookGraphMcpPath = "",
  [int]$HealthTimeoutSeconds = 45
)

$ErrorActionPreference = "Stop"

$logDir = Join-Path $GatewayWorkerRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logPath = Join-Path $logDir "start-gateway-pool.log"

function Write-GatewayPoolLog {
  param([string]$Message)
  $line = "{0} {1}" -f (Get-Date).ToString("s"), $Message
  Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}

function Test-HttpHealth {
  param([int]$Port)
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri ("http://127.0.0.1:{0}/health" -f $Port) -TimeoutSec 2 -ErrorAction Stop
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Wait-HealthPorts {
  param([int[]]$Ports)
  $deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
  $pending = @($Ports)
  while ((Get-Date) -lt $deadline -and $pending.Count -gt 0) {
    $next = @()
    foreach ($port in $pending) {
      if (-not (Test-HttpHealth -Port $port)) { $next += $port }
    }
    $pending = $next
    if ($pending.Count -gt 0) { Start-Sleep -Milliseconds 500 }
  }
  if ($pending.Count -gt 0) {
    throw "Gateway pool ports did not become healthy: $($pending -join ', ')"
  }
}

function Resolve-ConnectorPath {
  param(
    [string]$ExplicitPath,
    [string]$EnvName,
    [string]$RelativePath
  )
  if ($ExplicitPath) { return $ExplicitPath }
  $envValue = [Environment]::GetEnvironmentVariable($EnvName)
  if ($envValue) { return $envValue }
  $officialHermesHome = "\\wsl.localhost\$OfficialDistro\home\$OfficialUser\.hermes"
  return Join-Path $officialHermesHome $RelativePath
}

function Assert-SafeGatewayProfileName {
  param([string]$Profile)
  if (-not $Profile -or $Profile -notmatch '^[A-Za-z0-9][A-Za-z0-9_-]*$') {
    throw "Unsafe Gateway profile name in manifest: $Profile"
  }
}

function Assert-SafeLinuxUserName {
  param([string]$UserName)
  if (-not $UserName -or $UserName -notmatch '^[A-Za-z_][A-Za-z0-9_-]*$') {
    throw "Unsafe WSL user name: $UserName"
  }
}

function Is-OwnerMaintenanceWorker {
  param($Worker)
  if (-not $Worker.enabled -or -not $Worker.allowMaintenance -or -not $Worker.profile -or -not $Worker.port) { return $false }
  if ([string]$Worker.securityLevel -ne "owner-maintenance") { return $false }
  return [string]$Worker.profile -match '^officialclean[0-9]+$'
}

function OwnerMaintenanceSharedMemoryEnabled {
  $value = [Environment]::GetEnvironmentVariable("HERMES_MOBILE_OWNER_MAINTENANCE_SHARED_MEMORY_MODE")
  if (-not $value) { $value = [Environment]::GetEnvironmentVariable("HERMES_WEB_OWNER_MAINTENANCE_SHARED_MEMORY_MODE") }
  if (-not $value) { return $true }
  $value = $value.Trim()
  if (-not $value) { return $true }
  return $value -notmatch '^(0|false|no|off|profile-local)$'
}

function Add-OwnerMaintenanceSharedMemoryCommands {
  param(
    [System.Collections.ArrayList]$Commands,
    [string]$ProfileRoot,
    [string]$ProfileMemoryPath,
    [string]$SharedMemoryPath
  )
  $backupDir = "{0}/memories.profile-local-markdown-backup-{1}" -f $ProfileRoot, (Get-Date).ToString("yyyyMMddHHmmss")
  [void]$Commands.Add("if [ -L $ProfileMemoryPath ]; then rm -f $ProfileMemoryPath; elif [ -d $ProfileMemoryPath ]; then mkdir -p $backupDir; find $ProfileMemoryPath -maxdepth 1 -type f -name \*.md -exec cp -n {} $SharedMemoryPath/ \; -exec cp -n {} $backupDir/ \; -delete; find $ProfileMemoryPath -maxdepth 1 -type f -name \*.md.lock -size 0 -delete; if ! rmdir $ProfileMemoryPath 2>/dev/null; then echo profile_memories_contains_non_markdown_files_keeping_profile_local_directory:$ProfileMemoryPath >&2; fi; elif [ -e $ProfileMemoryPath ]; then echo profile_memories_path_is_not_directory_or_symlink:$ProfileMemoryPath >&2; fi; if [ ! -e $ProfileMemoryPath ]; then ln -sfn $SharedMemoryPath $ProfileMemoryPath; fi")
}

function Ensure-LowGatewayProfileEnv {
  $scriptPath = Join-Path $GatewayWorkerRoot "start-low-gateways.sh"
  if (-not (Test-Path -LiteralPath $scriptPath)) { return }
  $text = Get-Content -Raw -LiteralPath $scriptPath
  $updated = $text
  if ($updated -notmatch "configure-low-gateways\.sh") {
    $bootstrapNeedle = "cd /home/hermes"
    $bootstrap = @'
cd /home/hermes
configure_low_gateway_script="/mnt/c/ProgramData/HermesMobile/gateway-worker/configure-low-gateways.sh"
if [ ! -f "$configure_low_gateway_script" ]; then
  echo "missing low gateway configure script: $configure_low_gateway_script" >&2
  exit 1
fi
bash "$configure_low_gateway_script"
'@
    if (-not $updated.Contains($bootstrapNeedle)) {
      Write-GatewayPoolLog "Low gateway configure patch skipped; start script shape is unknown."
      return
    }
    $updated = $updated.Replace($bootstrapNeedle, $bootstrap)
  }
  if ($updated -notmatch "HERMES_GOOGLE_PROFILE_HOME") {
    $needle = 'HERMES_ACCEPT_HOOKS=1 API_SERVER_KEY="$api_key"'
    $replacement = 'HERMES_PROFILE="$profile" HERMES_GOOGLE_PROFILE_HOME="/home/hermes/.hermes/profiles/$profile" HERMES_ACCEPT_HOOKS=1 API_SERVER_KEY="$api_key"'
    if (-not $updated.Contains($needle)) {
      Write-GatewayPoolLog "Low gateway profile env patch skipped; start script shape is unknown."
      return
    }
    $updated = $updated.Replace($needle, $replacement)
  }
  if ($updated -notmatch "HERMES_GATEWAY_RUNTIME_BIN") {
    $bootstrapNeedle = 'low_gateway_count="${HERMES_LOW_GATEWAY_COUNT:-10}"'
    $bootstrap = @'
runtime_root="${HERMES_GATEWAY_RUNTIME_ROOT:-/opt/hermes-gateway-runtime}"
runtime_python="${HERMES_GATEWAY_RUNTIME_PYTHON:-$runtime_root/venv/bin/python}"
runtime_source="${HERMES_GATEWAY_RUNTIME_SOURCE:-$runtime_root/official-clean}"
runtime_bin="${HERMES_GATEWAY_RUNTIME_BIN:-$runtime_root/bin}"
install -d -m 755 "$runtime_bin"
cat > "$runtime_bin/hermes" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export PYTHONPATH="$runtime_source\${PYTHONPATH:+:\$PYTHONPATH}"
exec "$runtime_python" -m hermes_cli.main "\$@"
EOF
chmod 755 "$runtime_bin/hermes"

low_gateway_path="$runtime_bin:$runtime_root/venv/bin:/usr/local/bin:/usr/bin:/bin"
runtime_hermes="$runtime_bin/hermes"

'@
    if (-not $updated.Contains($bootstrapNeedle)) {
      Write-GatewayPoolLog "Low gateway hermes shim patch skipped; start script shape is unknown."
      return
    }
    $updated = $updated.Replace($bootstrapNeedle, $bootstrap + $bootstrapNeedle)
  }
  if ($updated -notmatch 'PATH="\$low_gateway_path"') {
    $updated = $updated.Replace('HERMES_ACCEPT_HOOKS=1 API_SERVER_KEY="$api_key"', 'PATH="$low_gateway_path" HERMES_ACCEPT_HOOKS=1 API_SERVER_KEY="$api_key"')
  }
  if ($updated -notmatch 'runtime_hermes="\$runtime_bin/hermes"') {
    $needle = 'low_gateway_path="$runtime_bin:$runtime_root/venv/bin:/usr/local/bin:/usr/bin:/bin"'
    $replacement = @'
low_gateway_path="$runtime_bin:$runtime_root/venv/bin:/usr/local/bin:/usr/bin:/bin"
runtime_hermes="$runtime_bin/hermes"
'@
    if ($updated.Contains($needle)) {
      $updated = $updated.Replace($needle, $replacement.TrimEnd())
    } else {
      Write-GatewayPoolLog "Low gateway runtime hermes shim variable patch skipped; start script shape is unknown."
    }
  }
  if ($updated -match '"\$runtime_python" -m hermes_cli\.main -p "\$profile" gateway run') {
    $updated = $updated.Replace('"$runtime_python" -m hermes_cli.main -p "$profile" gateway run', '"$runtime_hermes" -p "$profile" gateway run')
  }
  if ($updated -match 'gateway run --replace --accept-hooks > "\$log" 2>&1(?! < /dev/null)') {
    $updated = $updated -replace '(gateway run --replace --accept-hooks > "\$log" 2>&1)(?! < /dev/null)', '$1 < /dev/null'
  }
  if ($updated -eq $text) { return }
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($scriptPath, $updated, $encoding)
  Write-GatewayPoolLog "Low gateway start script patched for shared auth, profile env, and Kanban hermes shim."
}

function Stop-LowGateways {
  $runAsWorker = Join-Path $GatewayWorkerRoot "run-as-worker.ps1"
  if (-not (Test-Path -LiteralPath $runAsWorker)) { throw "Missing worker runner: $runAsWorker" }

  $stopShell = Join-Path $GatewayWorkerRoot "stop-low-gateways.sh"
  $stopChild = Join-Path $GatewayWorkerRoot "stop-low-gateways-child.ps1"
  $stopShellText = @'
#!/usr/bin/env bash
set -euo pipefail

low_gateway_count="${HERMES_LOW_GATEWAY_COUNT:-10}"

if command -v pkill >/dev/null 2>&1; then
  pkill -u hermes -f 'hermes_cli\.main -p lowgw[0-9]+ gateway run' || true
fi
sleep 1

for idx in $(seq 1 "$low_gateway_count"); do
  profile="lowgw${idx}"
  port=$((18750 + idx))
  pidfile="/home/hermes/.hermes/${profile}-gateway-${port}.pid"
  if [ -s "$pidfile" ]; then
    pid="$(cat "$pidfile" 2>/dev/null || true)"
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile" || true
  fi
done
sleep 1

if command -v pkill >/dev/null 2>&1; then
  pkill -9 -u hermes -f 'hermes_cli\.main -p lowgw[0-9]+ gateway run' || true
fi
'@
  $stopChildText = @'
$ErrorActionPreference = "Stop"
wsl.exe -d HermesGatewayWorker -u root -- bash /mnt/c/ProgramData/HermesMobile/gateway-worker/stop-low-gateways.sh
if ($LASTEXITCODE -ne 0) {
  throw "Low gateway stop failed with exit code $LASTEXITCODE"
}
'@
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($stopShell, $stopShellText, $encoding)
  [System.IO.File]::WriteAllText($stopChild, $stopChildText, $encoding)

  Write-GatewayPoolLog "Stopping existing low gateway processes before pool start."
  $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runAsWorker -ChildScript $stopChild 2>&1
  foreach ($line in $output) { Write-GatewayPoolLog ("lowgw-stop: {0}" -f $line) }
  if ($LASTEXITCODE -ne 0) { throw "Low gateway stop failed with exit code $LASTEXITCODE" }

  $legacyStopScript = @'
set -euo pipefail

if command -v pkill >/dev/null 2>&1; then
  pkill -u hermes -f 'hermes_cli\.main -p lowgw[0-9]+ gateway run' || true
fi
sleep 1

if command -v pkill >/dev/null 2>&1; then
  pkill -9 -u hermes -f 'hermes_cli\.main -p lowgw[0-9]+ gateway run' || true
fi
'@

  Write-GatewayPoolLog "Stopping legacy official-distro low gateway processes before pool start."
  $legacyOutput = & wsl.exe -d $OfficialDistro -u root -- bash -lc $legacyStopScript 2>&1
  foreach ($line in $legacyOutput) { Write-GatewayPoolLog ("legacy-lowgw-stop: {0}" -f $line) }
  if ($LASTEXITCODE -ne 0) { throw "Legacy official-distro low gateway stop failed with exit code $LASTEXITCODE" }
}

function Start-LowGateways {
  $runAsWorker = Join-Path $GatewayWorkerRoot "run-as-worker.ps1"
  $child = Join-Path $GatewayWorkerRoot "start-low-gateways-child.ps1"
  if (-not (Test-Path -LiteralPath $runAsWorker)) { throw "Missing worker runner: $runAsWorker" }
  if (-not (Test-Path -LiteralPath $child)) { throw "Missing low gateway child script: $child" }
  Ensure-LowGatewayProfileEnv
  Stop-LowGateways
  Write-GatewayPoolLog "Starting low gateway pool."
  $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runAsWorker -ChildScript $child 2>&1
  foreach ($line in $output) { Write-GatewayPoolLog ("lowgw: {0}" -f $line) }
  if ($LASTEXITCODE -ne 0) { throw "Low gateway pool start failed with exit code $LASTEXITCODE" }
}

function Check-LowGatewayCodexAuth {
  $checkScript = Join-Path $GatewayWorkerRoot "check-worker-codex-auth.ps1"
  if (-not (Test-Path -LiteralPath $checkScript)) {
    Write-GatewayPoolLog "Low gateway Codex auth check skipped; check script missing."
    return
  }
  $args = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $checkScript,
    "-WorkerRunAsScript", (Join-Path $GatewayWorkerRoot "run-as-worker.ps1"),
    "-WorkerDirectory", $GatewayWorkerRoot
  )
  $requireUnique = [Environment]::GetEnvironmentVariable("HERMES_LOW_GATEWAY_REQUIRE_UNIQUE_CODEX_AUTH")
  if ($requireUnique -match "^(1|true|yes|on)$") { $args += "-RequireUniqueRefreshTokens" }
  Write-GatewayPoolLog "Checking low gateway Codex auth fingerprints."
  $output = & powershell.exe @args 2>&1
  foreach ($line in $output) { Write-GatewayPoolLog ("codex-auth: {0}" -f $line) }
  if ($LASTEXITCODE -ne 0) {
    if ($requireUnique -match "^(1|true|yes|on)$") {
      throw "Low gateway Codex auth check failed with exit code $LASTEXITCODE"
    }
    Write-GatewayPoolLog "Low gateway Codex auth check reported warnings; continuing because strict uniqueness is not enabled."
  }
}

function Provision-OwnerExternalConnectors {
  $provisionScript = Join-Path $GatewayWorkerRoot "provision-worker-external-connectors.ps1"
  $runAsWorker = Join-Path $GatewayWorkerRoot "run-as-worker.ps1"
  if (-not (Test-Path -LiteralPath $provisionScript)) {
    Write-GatewayPoolLog "Owner external connector provisioning skipped; provision script missing."
    return
  }
  if (-not (Test-Path -LiteralPath $runAsWorker)) {
    Write-GatewayPoolLog "Owner external connector provisioning skipped; worker runner missing."
    return
  }
  $args = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $provisionScript,
    "-WorkerRunAsScript", $runAsWorker,
    "-WorkerDirectory", $GatewayWorkerRoot
  )
  $hasCredential = $false
  $resolvedGoogleTokenPath = Resolve-ConnectorPath -ExplicitPath $GoogleTokenPath -EnvName "HERMES_WEB_GOOGLE_TOKEN_PATH" -RelativePath "google_token.json"
  $resolvedGoogleClientSecretPath = Resolve-ConnectorPath -ExplicitPath $GoogleClientSecretPath -EnvName "HERMES_WEB_GOOGLE_CLIENT_SECRET_PATH" -RelativePath "google_client_secret.json"
  $resolvedOutlookGraphTokenPath = Resolve-ConnectorPath -ExplicitPath $OutlookGraphTokenPath -EnvName "HERMES_WEB_OUTLOOK_GRAPH_TOKEN_PATH" -RelativePath "microsoft-graph-outlook-mail\token.json"
  $resolvedOutlookGraphEnvPath = Resolve-ConnectorPath -ExplicitPath $OutlookGraphEnvPath -EnvName "HERMES_WEB_OUTLOOK_GRAPH_ENV_PATH" -RelativePath ".env"
  $resolvedOutlookGraphMcpPath = $OutlookGraphMcpPath
  if (-not $resolvedOutlookGraphMcpPath) {
    $candidate = Join-Path $GatewayWorkerRoot "outlook_graph_mcp.py"
    if (Test-Path -LiteralPath $candidate) { $resolvedOutlookGraphMcpPath = $candidate }
  }
  if (-not $resolvedOutlookGraphMcpPath) {
    $candidate = Join-Path $GatewayWorkerRoot "scripts\python\outlook_graph_mcp.py"
    if (Test-Path -LiteralPath $candidate) { $resolvedOutlookGraphMcpPath = $candidate }
  }
  if ($resolvedGoogleTokenPath -and (Test-Path -LiteralPath $resolvedGoogleTokenPath)) {
    $args += @("-GoogleTokenPath", $resolvedGoogleTokenPath)
    $hasCredential = $true
  }
  if ($resolvedGoogleClientSecretPath -and (Test-Path -LiteralPath $resolvedGoogleClientSecretPath)) {
    $args += @("-GoogleClientSecretPath", $resolvedGoogleClientSecretPath)
    $hasCredential = $true
  }
  if ($resolvedOutlookGraphTokenPath -and (Test-Path -LiteralPath $resolvedOutlookGraphTokenPath)) {
    $args += @("-OutlookGraphTokenPath", $resolvedOutlookGraphTokenPath)
    $hasCredential = $true
  }
  if ($resolvedOutlookGraphEnvPath -and (Test-Path -LiteralPath $resolvedOutlookGraphEnvPath)) {
    $args += @("-OutlookGraphEnvPath", $resolvedOutlookGraphEnvPath)
  }
  if ($resolvedOutlookGraphMcpPath -and (Test-Path -LiteralPath $resolvedOutlookGraphMcpPath)) {
    $args += @("-OutlookGraphMcpPath", $resolvedOutlookGraphMcpPath)
  }
  if (-not $hasCredential) {
    Write-GatewayPoolLog "Owner external connector provisioning skipped; no credential paths are available."
    return
  }
  Write-GatewayPoolLog "Provisioning owner external connector credentials into owner low gateway profiles."
  $output = & powershell.exe @args 2>&1
  foreach ($line in $output) { Write-GatewayPoolLog ("external-connectors: {0}" -f $line) }
  if ($LASTEXITCODE -ne 0) { throw "Owner external connector provisioning failed with exit code $LASTEXITCODE" }
}

function Start-OwnerMaintenanceGateways {
  if (-not (Test-Path -LiteralPath $ManifestPath)) { throw "Missing gateway pool manifest: $ManifestPath" }
  $manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
  Assert-SafeLinuxUserName -UserName $OfficialUser
  $workers = @($manifest.workers | Where-Object { Is-OwnerMaintenanceWorker -Worker $_ })
  if ($workers.Count -eq 0) {
    Write-GatewayPoolLog "No owner-maintenance workers in manifest."
    return @()
  }
  $apiKey = [string]($workers | Where-Object { $_.api_key } | Select-Object -First 1).api_key
  if (-not $apiKey) { throw "Owner-maintenance gateway API key missing from manifest." }

  $runtimeRoot = "/opt/hermes-gateway-runtime"
  $officialCleanRoot = "$runtimeRoot/official-clean"
  $officialPython = "$runtimeRoot/venv/bin/python"
  $sharedAuthPath = "/home/$OfficialUser/.hermes/auth.json"
  $sharedAuthLockPath = "/home/$OfficialUser/.hermes/auth.lock"
  $sharedMemoryEnabled = OwnerMaintenanceSharedMemoryEnabled
  $sharedMemoryPath = "/home/$OfficialUser/.hermes/memories"
  $ownerMaintenanceLockPath = "/tmp/hermes-mobile-owner-maintenance-memory.lock"
  $commands = [System.Collections.ArrayList]@(
    "if [ -d $ownerMaintenanceLockPath ]; then rmdir $ownerMaintenanceLockPath 2>/dev/null || { echo owner_maintenance_memory_lock_busy >&2; exit 42; }; fi",
    "exec 9>$ownerMaintenanceLockPath",
    "flock -w 60 9 || { echo owner_maintenance_memory_lock_timeout >&2; exit 42; }",
    "trap 'flock -u 9' EXIT",
    "test -x $officialPython",
    "test -d $officialCleanRoot",
    "mkdir -p /home/$OfficialUser/.hermes/logs",
    "test -s $sharedAuthPath"
  )
  if ($sharedMemoryEnabled) {
    [void]$commands.Add("mkdir -p $sharedMemoryPath")
  }
  foreach ($worker in $workers) {
    $profile = [string]$worker.profile
    Assert-SafeGatewayProfileName -Profile $profile
    $profileRoot = "/home/$OfficialUser/.hermes/profiles/$profile"
    $profileMemoryPath = "$profileRoot/memories"
    [void]$commands.Add("mkdir -p /home/$OfficialUser/.hermes/profiles/$profile/logs")
    [void]$commands.Add("rm -f /home/$OfficialUser/.hermes/profiles/$profile/auth.json /home/$OfficialUser/.hermes/profiles/$profile/auth.lock")
    [void]$commands.Add("ln -sfn $sharedAuthPath /home/$OfficialUser/.hermes/profiles/$profile/auth.json")
    [void]$commands.Add("ln -sfn $sharedAuthLockPath /home/$OfficialUser/.hermes/profiles/$profile/auth.lock")
    if ($sharedMemoryEnabled) {
      Add-OwnerMaintenanceSharedMemoryCommands -Commands $commands -ProfileRoot $profileRoot -ProfileMemoryPath $profileMemoryPath -SharedMemoryPath $sharedMemoryPath
    }
    [void]$commands.Add("setsid -f env HOME=/home/$OfficialUser HERMES_HOME=/home/$OfficialUser/.hermes PYTHONPATH=$officialCleanRoot HERMES_ACCEPT_HOOKS=1 $officialPython -m hermes_cli.main -p $profile gateway run --replace > /home/$OfficialUser/.hermes/profiles/$profile/logs/start-gateway-pool.log 2>&1")
  }
  $bash = $commands -join "; "

  Write-GatewayPoolLog "Starting owner-maintenance gateway pool."
  $env:API_SERVER_KEY = $apiKey
  $env:WSLENV = "API_SERVER_KEY/u"
  try {
    & wsl.exe -d $OfficialDistro -u $OfficialUser -- bash -lc $bash
    if ($LASTEXITCODE -ne 0) { throw "Owner-maintenance gateway start failed with exit code $LASTEXITCODE" }
  } finally {
    Remove-Item Env:\API_SERVER_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:\WSLENV -ErrorAction SilentlyContinue
  }
  return @($workers | ForEach-Object { [int]$_.port })
}

Write-GatewayPoolLog "Gateway pool startup begin."
Provision-OwnerExternalConnectors
Start-LowGateways
Check-LowGatewayCodexAuth
Start-OwnerMaintenanceGateways | Out-Null

$manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
$ports = @($manifest.workers | Where-Object { $_.enabled -and $_.port } | ForEach-Object { [int]$_.port })
Wait-HealthPorts -Ports $ports
Write-GatewayPoolLog "Gateway pool startup OK; healthy ports: $($ports -join ', ')."
