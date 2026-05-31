param(
  [string]$GatewayWorkerRoot = "C:\ProgramData\HermesMobile\gateway-worker",
  [string]$ManifestPath = "C:\ProgramData\HermesMobile\data\gateway-pool-manifest.json",
  [string]$OfficialDistro = "Ubuntu-24.04",
  [string]$OfficialUser = "xuxin",
  [string]$LowGatewayDistroName = "Ubuntu-24.04",
  [string]$GoogleTokenPath = "",
  [string]$GoogleClientSecretPath = "",
  [string]$OutlookGraphTokenPath = "",
  [string]$OutlookGraphEnvPath = "",
  [string]$OutlookGraphMcpPath = "",
  [int]$HealthTimeoutSeconds = 45,
  [int]$OwnerMaintenanceBusyGraceMinutes = 45,
  [switch]$OwnerMaintenanceOnly,
  [switch]$OnlyWhenOwnerMaintenanceUnhealthy
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

function Acquire-GatewayPoolRunMutex {
  $script:GatewayPoolRunMutex = [System.Threading.Mutex]::new($false, "Local\HermesMobileGatewayPoolStart")
  try {
    $script:GatewayPoolRunMutexAcquired = $script:GatewayPoolRunMutex.WaitOne(0)
  } catch [System.Threading.AbandonedMutexException] {
    $script:GatewayPoolRunMutexAcquired = $true
  }
  if (-not $script:GatewayPoolRunMutexAcquired) {
    Write-GatewayPoolLog "Gateway Pool startup skipped; another start-gateway-pool.ps1 instance is already running."
    exit 0
  }
}

function Release-GatewayPoolRunMutex {
  if ($script:GatewayPoolRunMutexAcquired -and $script:GatewayPoolRunMutex) {
    $script:GatewayPoolRunMutex.ReleaseMutex()
  }
  if ($script:GatewayPoolRunMutex) {
    $script:GatewayPoolRunMutex.Dispose()
  }
}

function Convert-GatewayPoolWindowsPathToWslPath {
  param(
    [string]$Distro,
    [string]$User,
    [string]$WindowsPath
  )
  $resolved = (Resolve-Path -LiteralPath $WindowsPath).Path
  $portable = $resolved.Replace([string][char]92, "/")
  $output = & wsl.exe -d $Distro -u $User -- wslpath -a $portable 2>&1 | ForEach-Object { $_.ToString() }
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to convert Windows path to WSL path: $resolved"
  }
  return ($output | Select-Object -First 1)
}

function Convert-GatewayPoolBashSingleQuotedLiteral {
  param([string]$Value)
  return "'" + $Value.Replace("'", "'\''") + "'"
}

function Invoke-GatewayPoolWslBashFile {
  param(
    [string]$Distro,
    [string]$User,
    [string]$ScriptPath
  )
  $wslScriptPath = Convert-GatewayPoolWindowsPathToWslPath -Distro $Distro -User $User -WindowsPath $ScriptPath
  $output = & wsl.exe -d $Distro -u $User -- bash $wslScriptPath 2>&1 | ForEach-Object { $_.ToString() }
  return [pscustomobject]@{
    ExitCode = $LASTEXITCODE
    Output = @($output)
  }
}

function Invoke-GatewayPoolPhase {
  param(
    [string]$Name,
    [scriptblock]$ScriptBlock
  )
  $started = Get-Date
  Write-GatewayPoolLog ("phase-start {0}" -f $Name)
  try {
    & $ScriptBlock
    $elapsedMs = [int]((Get-Date) - $started).TotalMilliseconds
    Write-GatewayPoolLog ("phase-done {0} elapsedMs={1}" -f $Name, $elapsedMs)
  } catch {
    $elapsedMs = [int]((Get-Date) - $started).TotalMilliseconds
    Write-GatewayPoolLog ("phase-failed {0} elapsedMs={1} error={2}" -f $Name, $elapsedMs, $_.Exception.Message)
    throw
  }
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

function Test-TcpPortOpen {
  param([int]$Port)
  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
      $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
      if (-not $async.AsyncWaitHandle.WaitOne(1000, $false)) { return $false }
      $client.EndConnect($async)
      return $true
    } finally {
      $client.Close()
    }
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

function Get-OwnerMaintenanceWatchdogStatePath {
  return (Join-Path $GatewayWorkerRoot "owner-maintenance-watchdog-state.json")
}

function Read-OwnerMaintenanceWatchdogState {
  $path = Get-OwnerMaintenanceWatchdogStatePath
  if (-not (Test-Path -LiteralPath $path)) { return @{} }
  try {
    $raw = Get-Content -Raw -LiteralPath $path
    if (-not $raw) { return @{} }
    $parsed = $raw | ConvertFrom-Json
    $state = @{}
    foreach ($property in $parsed.PSObject.Properties) {
      $state[$property.Name] = $property.Value
    }
    return $state
  } catch {
    Write-GatewayPoolLog "Owner-maintenance watchdog state unreadable; resetting state."
    return @{}
  }
}

function Write-OwnerMaintenanceWatchdogState {
  param([hashtable]$State)
  $path = Get-OwnerMaintenanceWatchdogStatePath
  $State | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $path -Encoding UTF8
}

function Update-OwnerMaintenanceUnhealthyState {
  param(
    [hashtable]$State,
    [object]$Worker,
    [bool]$Unhealthy
  )
  $profile = [string]$Worker.profile
  $now = (Get-Date).ToUniversalTime()
  if (-not $Unhealthy) {
    if ($State.ContainsKey($profile)) { $State.Remove($profile) }
    return $null
  }
  $entry = $State[$profile]
  if (-not $entry) {
    $entry = [pscustomobject]@{
      firstUnhealthyAt = $now.ToString("o")
      lastUnhealthyAt = $now.ToString("o")
      count = 1
    }
  } else {
    $entry.lastUnhealthyAt = $now.ToString("o")
    $entry.count = [int]$entry.count + 1
  }
  $State[$profile] = $entry
  return $entry
}

function Select-OwnerMaintenanceWorkersNeedingRepair {
  param([object[]]$Workers)
  $state = Read-OwnerMaintenanceWatchdogState
  $needsRepair = @()
  $graceMs = [Math]::Max(1, $OwnerMaintenanceBusyGraceMinutes) * 60 * 1000
  foreach ($worker in $Workers) {
    $port = [int]$worker.port
    $profile = [string]$worker.profile
    $healthy = Test-HttpHealth -Port $port
    $entry = Update-OwnerMaintenanceUnhealthyState -State $state -Worker $worker -Unhealthy (-not $healthy)
    if ($healthy) { continue }

    $tcpOpen = Test-TcpPortOpen -Port $port
    if (-not $tcpOpen) {
      Write-GatewayPoolLog "Owner-maintenance repair required for $profile; HTTP health failed and TCP port $port is closed."
      $needsRepair += $worker
      continue
    }

    $firstSeen = $null
    if ($entry -and $entry.firstUnhealthyAt) {
      try { $firstSeen = [DateTime]::Parse($entry.firstUnhealthyAt).ToUniversalTime() } catch { $firstSeen = (Get-Date).ToUniversalTime() }
    } else {
      $firstSeen = (Get-Date).ToUniversalTime()
    }
    $elapsedMs = ((Get-Date).ToUniversalTime() - $firstSeen).TotalMilliseconds
    if ($elapsedMs -ge $graceMs) {
      Write-GatewayPoolLog "Owner-maintenance repair required for $profile; HTTP health failed for $([Math]::Round($elapsedMs / 60000, 1)) minutes while TCP port remained open."
      $needsRepair += $worker
    } else {
      Write-GatewayPoolLog "Owner-maintenance repair deferred for $profile; HTTP health failed but TCP port $port is open, likely busy with a long tool call. graceMinutes=$OwnerMaintenanceBusyGraceMinutes count=$($entry.count)"
    }
  }
  Write-OwnerMaintenanceWatchdogState -State $state
  return $needsRepair
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

function Assert-SafeWslDistroName {
  param([string]$DistroName)
  if (-not $DistroName -or $DistroName -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]*$') {
    throw "Unsafe WSL distro name: $DistroName"
  }
}

function Is-OwnerMaintenanceWorker {
  param($Worker)
  if (-not $Worker.enabled -or -not $Worker.allowMaintenance -or -not $Worker.profile -or -not $Worker.port) { return $false }
  if ([string]$Worker.securityLevel -ne "owner-maintenance") { return $false }
  return [string]$Worker.profile -match '^(officialclean|deepseekmaint)[0-9]+$'
}

function Get-OwnerMaintenanceWorkers {
  if (-not (Test-Path -LiteralPath $ManifestPath)) { throw "Missing gateway pool manifest: $ManifestPath" }
  $manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
  return @($manifest.workers | Where-Object { Is-OwnerMaintenanceWorker -Worker $_ })
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

function Ensure-ProfilePluginEnabled {
  param(
    [string]$ConfigPath,
    [string]$PluginName
  )
  if (-not (Test-Path -LiteralPath $ConfigPath)) { return }
  $text = [System.IO.File]::ReadAllText($ConfigPath, [System.Text.Encoding]::UTF8)
  if ($text -match "(?m)^\s*-\s*$([Regex]::Escape($PluginName))\s*$") { return }
  if ($text -match "(?ms)^plugins:\s*\r?\n\s*enabled:\s*\[\]\s*$") {
    $text = [Regex]::Replace($text, "(?ms)^plugins:\s*\r?\n\s*enabled:\s*\[\]\s*$", "plugins:`n  enabled:`n    - $PluginName")
  } elseif ($text -match "(?m)^plugins:\s*$" -and $text -match "(?m)^\s*enabled:\s*$") {
    $text = [Regex]::Replace($text, "(?m)^(\s*enabled:\s*)$", "`$1`n    - $PluginName", 1)
  } elseif ($text -match "(?m)^plugins:\s*$") {
    $text = [Regex]::Replace($text, "(?m)^plugins:\s*$", "plugins:`n  enabled:`n    - $PluginName", 1)
  } else {
    $text = $text.TrimEnd() + "`nplugins:`n  enabled:`n    - $PluginName`n"
  }
  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($ConfigPath, $text, $utf8NoBom)
}

function Ensure-ProfileToolsetEnabled {
  param(
    [string]$ConfigPath,
    [string]$ToolsetName
  )
  if (-not (Test-Path -LiteralPath $ConfigPath)) { return }
  $text = [System.IO.File]::ReadAllText($ConfigPath, [System.Text.Encoding]::UTF8)
  if ($text -match "(?m)^\s*-\s*$([Regex]::Escape($ToolsetName))\s*$") { return }
  if ($text -match "(?m)^toolsets:\s*$") {
    $text = [Regex]::Replace($text, "(?m)^toolsets:\s*$", "toolsets:`n  - $ToolsetName", 1)
  } else {
    $text = $text.TrimEnd() + "`ntoolsets:`n  - $ToolsetName`n"
  }
  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($ConfigPath, $text, $utf8NoBom)
}

function Ensure-OwnerMaintenanceProfileConfig {
  param(
    [string]$ConfigPath,
    [int]$Port,
    [string]$Provider
  )
  $parent = Split-Path -Parent $ConfigPath
  if ($parent -and -not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }
  $normalizedProvider = ([string]$Provider).Trim().ToLowerInvariant()
  if ($normalizedProvider -eq "deepseek") {
    $modelBlock = "model:`n  default: deepseek-chat`n  provider: deepseek"
    $skillsToolset = "`n  - skills"
  } else {
    $modelBlock = "model:`n  default: gpt-5.5`n  provider: openai-codex`n  base_url: https://chatgpt.com/backend-api/codex"
    $skillsToolset = ""
  }
  $text = @"
$modelBlock
toolsets:
  - chatgpt_pro
  - hermes-cli
$skillsToolset
agent:
  max_turns: 60
  reasoning_effort: medium
terminal:
  backend: local
  cwd: .
  timeout: 180
platforms:
  api_server:
    enabled: true
    extra:
      host: 127.0.0.1
      port: $Port
plugins:
  enabled:
    - hermes-mobile-chatgpt-pro
worker_pool:
  enabled: false
cron:
  enabled: false
"@
  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($ConfigPath, $text, $utf8NoBom)
}

function Install-OwnerMaintenanceChatGptProPlugin {
  if (-not (Test-Path -LiteralPath $ManifestPath)) { return }
  $manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
  $workers = @($manifest.workers | Where-Object { Is-OwnerMaintenanceWorker -Worker $_ })
  if ($workers.Count -eq 0) { return }
  $pluginName = "hermes-mobile-chatgpt-pro"
  $programRoot = Split-Path -Parent $PSScriptRoot
  $sourceCandidates = @(
    (Join-Path $programRoot "app\gateway-plugins\$pluginName"),
    (Join-Path $programRoot "gateway-plugins\$pluginName"),
    (Join-Path (Split-Path -Parent $programRoot) "gateway-plugins\$pluginName")
  )
  $source = [string]($sourceCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1)
  if (-not (Test-Path -LiteralPath $source)) { throw "Missing ChatGPT Pro plugin source: $source" }
  $pluginsRoot = "\\wsl.localhost\$OfficialDistro\home\$OfficialUser\.hermes\plugins"
  if (-not (Test-Path -LiteralPath $pluginsRoot)) {
    New-Item -ItemType Directory -Force -Path $pluginsRoot | Out-Null
  }
  $target = Join-Path $pluginsRoot $pluginName
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
  Copy-Item -LiteralPath $source -Destination $target -Recurse -Force
  foreach ($worker in $workers) {
    $profile = [string]$worker.profile
    Assert-SafeGatewayProfileName -Profile $profile
    $configPath = "\\wsl.localhost\$OfficialDistro\home\$OfficialUser\.hermes\profiles\$profile\config.yaml"
    $profilePluginRoot = "\\wsl.localhost\$OfficialDistro\home\$OfficialUser\.hermes\profiles\$profile\plugins"
    if (-not (Test-Path -LiteralPath $profilePluginRoot)) {
      New-Item -ItemType Directory -Force -Path $profilePluginRoot | Out-Null
    }
    $profilePluginTarget = Join-Path $profilePluginRoot $pluginName
    if (Test-Path -LiteralPath $profilePluginTarget) { Remove-Item -LiteralPath $profilePluginTarget -Recurse -Force }
    Copy-Item -LiteralPath $source -Destination $profilePluginTarget -Recurse -Force
    Ensure-ProfilePluginEnabled -ConfigPath $configPath -PluginName $pluginName
    Ensure-ProfileToolsetEnabled -ConfigPath $configPath -ToolsetName "chatgpt_pro"
  }
  Write-GatewayPoolLog "Installed ChatGPT Pro plugin for owner-maintenance profiles."
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
runtime_overrides="${HERMES_GATEWAY_RUNTIME_OVERRIDES:-$runtime_root/runtime-overrides}"
runtime_bin="${HERMES_GATEWAY_RUNTIME_BIN:-$runtime_root/bin}"
install -d -m 755 "$runtime_bin"
cat > "$runtime_bin/hermes" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export PYTHONPATH="$runtime_overrides:$runtime_source\${PYTHONPATH:+:\$PYTHONPATH}"
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
    $updated = $updated.Replace('"$runtime_python" -m hermes_cli.main -p "$profile" gateway run', '"$runtime_hermes" gateway run')
  }
  if ($updated -match 'HERMES_HOME="\$worker_home_dir"') {
    $updated = $updated.Replace('HERMES_HOME="$worker_home_dir"', 'HERMES_HOME="$worker_home_dir/profiles/$profile"')
  }
  if ($updated -match '"\$runtime_hermes" -p "\$profile" gateway run') {
    $updated = $updated.Replace('"$runtime_hermes" -p "$profile" gateway run', '"$runtime_hermes" gateway run')
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
  Assert-SafeWslDistroName -DistroName $LowGatewayDistroName

  $stopShell = Join-Path $GatewayWorkerRoot "stop-low-gateways.sh"
  $stopChild = Join-Path $GatewayWorkerRoot "stop-low-gateways-child.ps1"
  $stopShellText = @'
#!/usr/bin/env bash
set -euo pipefail

low_gateway_count="${HERMES_LOW_GATEWAY_COUNT:-10}"

if command -v pkill >/dev/null 2>&1; then
  pkill -u hermes -f 'hermes_cli\.main .*gateway run' || true
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
  pkill -9 -u hermes -f 'hermes_cli\.main .*gateway run' || true
fi
'@
  $stopChildText = @"
`$ErrorActionPreference = "Stop"
`$distroName = "$LowGatewayDistroName"
wsl.exe -d `$distroName -u root -- bash /mnt/c/ProgramData/HermesMobile/gateway-worker/stop-low-gateways.sh
if (`$LASTEXITCODE -ne 0) {
  throw "Low gateway stop failed with exit code `$LASTEXITCODE"
}
"@
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($stopShell, $stopShellText, $encoding)
  [System.IO.File]::WriteAllText($stopChild, $stopChildText, $encoding)

  Write-GatewayPoolLog "Stopping existing low gateway processes before pool start."
  $output = & powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File $stopChild 2>&1
  foreach ($line in $output) { Write-GatewayPoolLog ("lowgw-stop: {0}" -f $line) }
  if ($LASTEXITCODE -ne 0) { throw "Low gateway stop failed with exit code $LASTEXITCODE" }

  $legacyStopScript = @'
set -euo pipefail

if command -v pkill >/dev/null 2>&1; then
  pkill -u hermes -f 'hermes_cli\.main .*gateway run' || true
fi
sleep 1

  if command -v pkill >/dev/null 2>&1; then
    pkill -9 -u hermes -f 'hermes_cli\.main .*gateway run' || true
  fi
'@
  $legacyStopShell = Join-Path $GatewayWorkerRoot "stop-legacy-official-low-gateways.sh"
  [System.IO.File]::WriteAllText($legacyStopShell, $legacyStopScript, $encoding)

  Write-GatewayPoolLog "Stopping legacy official-distro low gateway processes before pool start."
  $legacyResult = Invoke-GatewayPoolWslBashFile -Distro $OfficialDistro -User "root" -ScriptPath $legacyStopShell
  foreach ($line in $legacyResult.Output) { Write-GatewayPoolLog ("legacy-lowgw-stop: {0}" -f $line) }
  if ($legacyResult.ExitCode -ne 0) { throw "Legacy official-distro low gateway stop failed with exit code $($legacyResult.ExitCode)" }
}

function Start-LowGateways {
  $child = Join-Path $GatewayWorkerRoot "start-low-gateways-child.ps1"
  if (-not (Test-Path -LiteralPath $child)) { throw "Missing low gateway child script: $child" }
  Ensure-LowGatewayProfileEnv
  Stop-LowGateways
  Write-GatewayPoolLog "Starting low gateway pool."
  $output = & powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File $child -DistroName $LowGatewayDistroName 2>&1
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
    "-WindowStyle", "Hidden",
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
    "-WindowStyle", "Hidden",
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
  param([object[]]$TargetWorkers = @())
  Assert-SafeLinuxUserName -UserName $OfficialUser
  $allWorkers = Get-OwnerMaintenanceWorkers
  $workers = @($TargetWorkers)
  if ($workers.Count -eq 0) { $workers = $allWorkers }
  if ($workers.Count -eq 0) {
    Write-GatewayPoolLog "No owner-maintenance workers in manifest."
    return @()
  }

  $runtimeRoot = "/opt/hermes-gateway-runtime"
  $officialCleanRoot = "$runtimeRoot/official-clean"
  $runtimeOverridesRoot = "$runtimeRoot/runtime-overrides"
  $officialPython = "$runtimeRoot/venv/bin/python"
  $sharedAuthPath = "/home/$OfficialUser/.hermes/auth.json"
  $sharedAuthLockPath = "/home/$OfficialUser/.hermes/auth.lock"
  $sharedMemoryEnabled = OwnerMaintenanceSharedMemoryEnabled
  $sharedMemoryPath = "/home/$OfficialUser/.hermes/memories"
  $ownerSkillStore = "/mnt/c/ProgramData/HermesMobile/data/skill-profiles/owner-full/skills"
  $ownerMaintenanceLockPath = "/tmp/hermes-mobile-owner-maintenance-memory.lock"
  $bridgeKeyPath = "/mnt/c/ProgramData/HermesMobile/data/secrets/bridge-host.secret"
  $deepseekApiKeyPath = "/mnt/c/ProgramData/HermesMobile/data/secrets/deepseek-api-key.secret"
  $manifestPathWsl = Convert-GatewayPoolWindowsPathToWslPath -Distro $OfficialDistro -User $OfficialUser -WindowsPath $ManifestPath
  $manifestPathArg = Convert-GatewayPoolBashSingleQuotedLiteral -Value $manifestPathWsl
  $commands = [System.Collections.ArrayList]@(
    "if [ -d $ownerMaintenanceLockPath ]; then rmdir $ownerMaintenanceLockPath 2>/dev/null || { echo owner_maintenance_memory_lock_busy >&2; exit 42; }; fi",
    "exec 9>$ownerMaintenanceLockPath",
    "flock -w 60 9 || { echo owner_maintenance_memory_lock_timeout >&2; exit 42; }",
    "trap 'flock -u 9' EXIT",
    "windows_host_gateway=`$(ip route 2>/dev/null | awk '/^default[[:space:]]/ { print `$3; exit }')",
    "if [ -n `"`${HERMES_MOBILE_BRIDGE_HOST_URL:-}`" ]; then mobile_bridge_host_url=`"$HERMES_MOBILE_BRIDGE_HOST_URL`"; elif [ -n `"`$windows_host_gateway`" ]; then mobile_bridge_host_url=`"http://`$windows_host_gateway`:8798`"; else mobile_bridge_host_url=`"http://127.0.0.1:8798`"; fi",
    "test -x $officialPython",
    "test -d $officialCleanRoot",
    "mkdir -p /home/$OfficialUser/.hermes/logs",
    "test -s $sharedAuthPath"
  )
  [void]$commands.Add("gateway_pool_manifest_path=$manifestPathArg")
  [void]$commands.Add(@'
manifest_api_key() {
  local profile="$1"
  python3 - "$gateway_pool_manifest_path" "$profile" <<'PY' 2>/dev/null || true
import json, sys
try:
    data = json.load(open(sys.argv[1], encoding="utf-8-sig"))
except Exception:
    raise SystemExit(0)
profile = str(sys.argv[2]).strip()
for worker in data.get("workers") or []:
    candidate = str(worker.get("profile") or worker.get("name") or "").strip()
    if candidate != profile:
        continue
    key = str(worker.get("api_key") or worker.get("apiKey") or "").strip()
    if key:
        print(key)
    break
PY
}
'@.TrimEnd())
  [void]$commands.Add("deepseek_api_key=''; if [ -s $deepseekApiKeyPath ]; then deepseek_api_key=`$(tr -d '\r\n' < $deepseekApiKeyPath); fi")
  if ($sharedMemoryEnabled) {
    [void]$commands.Add("mkdir -p $sharedMemoryPath")
  }
  foreach ($worker in $workers) {
    $profile = [string]$worker.profile
    Assert-SafeGatewayProfileName -Profile $profile
    if (-not [string]$worker.api_key) {
      throw "Owner-maintenance gateway API key missing from manifest for profile $profile."
    }
    $provider = ([string]$worker.provider).Trim().ToLowerInvariant()
    $configPath = "\\wsl.localhost\$OfficialDistro\home\$OfficialUser\.hermes\profiles\$profile\config.yaml"
    Ensure-OwnerMaintenanceProfileConfig -ConfigPath $configPath -Port ([int]$worker.port) -Provider $provider
    $profileRoot = "/home/$OfficialUser/.hermes/profiles/$profile"
    $profileMemoryPath = "$profileRoot/memories"
    [void]$commands.Add("mkdir -p /home/$OfficialUser/.hermes/profiles/$profile/logs")
    [void]$commands.Add("rm -f /home/$OfficialUser/.hermes/profiles/$profile/auth.json /home/$OfficialUser/.hermes/profiles/$profile/auth.lock")
    [void]$commands.Add("ln -sfn $sharedAuthPath /home/$OfficialUser/.hermes/profiles/$profile/auth.json")
    [void]$commands.Add("ln -sfn $sharedAuthLockPath /home/$OfficialUser/.hermes/profiles/$profile/auth.lock")
    if ($sharedMemoryEnabled) {
      Add-OwnerMaintenanceSharedMemoryCommands -Commands $commands -ProfileRoot $profileRoot -ProfileMemoryPath $profileMemoryPath -SharedMemoryPath $sharedMemoryPath
    }
    if ($provider -eq "deepseek") {
      [void]$commands.Add("if [ -z `"`$deepseek_api_key`" ]; then echo missing DeepSeek API key for $profile >&2; exit 1; fi")
      [void]$commands.Add("mkdir -p $ownerSkillStore")
      [void]$commands.Add("if [ -L $profileRoot/skills ]; then rm -f $profileRoot/skills; fi; if [ ! -e $profileRoot/skills ]; then ln -sfn $ownerSkillStore $profileRoot/skills; elif [ ! -L $profileRoot/skills ]; then echo owner_maintenance_skills_directory_exists_keeping_profile_local:$profileRoot/skills >&2; fi")
    }
    [void]$commands.Add("api_server_key=`$(manifest_api_key $profile)")
    [void]$commands.Add("if [ -z `"`$api_server_key`" ]; then echo owner-maintenance gateway API key missing for $profile >&2; exit 1; fi")
    [void]$commands.Add("setsid -f env HOME=/home/$OfficialUser HERMES_HOME=$profileRoot HERMES_PROFILE=$profile PYTHONPATH=${runtimeOverridesRoot}:${officialCleanRoot} HERMES_ACCEPT_HOOKS=1 API_SERVER_KEY=`"`$api_server_key`" HERMES_MOBILE_CHATGPT_PRO_BRIDGE_URL=`"`$mobile_bridge_host_url/bridge/chatgpt-pro`" HERMES_WEB_CHATGPT_PRO_BRIDGE_URL=`"`$mobile_bridge_host_url/bridge/chatgpt-pro`" HERMES_MOBILE_CHATGPT_PRO_BRIDGE_KEY_PATH=$bridgeKeyPath HERMES_WEB_CHATGPT_PRO_BRIDGE_KEY_PATH=$bridgeKeyPath HERMES_MOBILE_CHATGPT_PRO_TIMEOUT_SECONDS=1800 HERMES_WEB_CHATGPT_PRO_TIMEOUT_SECONDS=1800 DEEPSEEK_API_KEY=`"`$deepseek_api_key`" $officialPython -m hermes_cli.main gateway run --replace > /home/$OfficialUser/.hermes/profiles/$profile/logs/start-gateway-pool.log 2>&1")
  }
  $ownerMaintenanceStartShell = Join-Path $GatewayWorkerRoot "start-owner-maintenance-gateways.sh"
  $bash = "set -euo pipefail`n" + ($commands -join "`n") + "`n"
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($ownerMaintenanceStartShell, $bash, $encoding)

  Write-GatewayPoolLog "Starting owner-maintenance gateway pool."
  try {
    $ownerMaintenanceResult = Invoke-GatewayPoolWslBashFile -Distro $OfficialDistro -User $OfficialUser -ScriptPath $ownerMaintenanceStartShell
    foreach ($line in $ownerMaintenanceResult.Output) { Write-GatewayPoolLog ("owner-maintenance-start: {0}" -f $line) }
    if ($ownerMaintenanceResult.ExitCode -ne 0) { throw "Owner-maintenance gateway start failed with exit code $($ownerMaintenanceResult.ExitCode)" }
  } finally {
  }
  return @($workers | ForEach-Object { [int]$_.port })
}

function Repair-OwnerMaintenanceGateways {
  $workers = Get-OwnerMaintenanceWorkers
  if ($workers.Count -eq 0) {
    Write-GatewayPoolLog "Owner-maintenance repair skipped; no owner-maintenance workers in manifest."
    return
  }
  $unhealthyWorkers = @($workers | Where-Object { -not (Test-HttpHealth -Port ([int]$_.port)) })
  if ($OnlyWhenOwnerMaintenanceUnhealthy) {
    $unhealthyWorkers = @(Select-OwnerMaintenanceWorkersNeedingRepair -Workers $workers)
  }
  if ($OnlyWhenOwnerMaintenanceUnhealthy -and $unhealthyWorkers.Count -eq 0) {
    Write-GatewayPoolLog "Owner-maintenance repair skipped; all owner-maintenance ports are healthy."
    return
  }
  if ($unhealthyWorkers.Count -eq 0) { $unhealthyWorkers = $workers }
  Write-GatewayPoolLog ("Owner-maintenance repair starting profiles: {0}" -f (($unhealthyWorkers | ForEach-Object { [string]$_.profile }) -join ', '))
  Invoke-GatewayPoolPhase -Name "install-owner-maintenance-chatgpt-pro-plugin" -ScriptBlock { Install-OwnerMaintenanceChatGptProPlugin }
  $repairPorts = @()
  Invoke-GatewayPoolPhase -Name "start-owner-maintenance-gateways" -ScriptBlock { $script:repairPorts = @(Start-OwnerMaintenanceGateways -TargetWorkers $unhealthyWorkers) }
  Invoke-GatewayPoolPhase -Name "wait-owner-maintenance-health" -ScriptBlock { Wait-HealthPorts -Ports $script:repairPorts }
  Write-GatewayPoolLog "Owner-maintenance gateway repair OK; healthy ports: $($script:repairPorts -join ', ')."
}

Acquire-GatewayPoolRunMutex
try {
  if ($OwnerMaintenanceOnly) {
    Write-GatewayPoolLog "Owner-maintenance gateway repair begin."
    Repair-OwnerMaintenanceGateways
    exit 0
  }

  Write-GatewayPoolLog "Gateway pool startup begin."
  Invoke-GatewayPoolPhase -Name "provision-owner-external-connectors" -ScriptBlock { Provision-OwnerExternalConnectors }
  Invoke-GatewayPoolPhase -Name "start-low-gateways" -ScriptBlock { Start-LowGateways }
  Invoke-GatewayPoolPhase -Name "check-low-gateway-codex-auth" -ScriptBlock { Check-LowGatewayCodexAuth }
  Invoke-GatewayPoolPhase -Name "install-owner-maintenance-chatgpt-pro-plugin" -ScriptBlock { Install-OwnerMaintenanceChatGptProPlugin }
  Invoke-GatewayPoolPhase -Name "start-owner-maintenance-gateways" -ScriptBlock { Start-OwnerMaintenanceGateways | Out-Null }

  $manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
  $ports = @($manifest.workers | Where-Object { $_.enabled -and $_.port } | ForEach-Object { [int]$_.port })
  Invoke-GatewayPoolPhase -Name "wait-gateway-health" -ScriptBlock { Wait-HealthPorts -Ports $ports }
  Write-GatewayPoolLog "Gateway pool startup OK; healthy ports: $($ports -join ', ')."
} finally {
  Release-GatewayPoolRunMutex
}
