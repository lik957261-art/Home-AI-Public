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
  [string]$ElasticRequestRoot = $(if ($env:HERMES_MOBILE_GATEWAY_LAUNCH_REQUEST_ROOT) { $env:HERMES_MOBILE_GATEWAY_LAUNCH_REQUEST_ROOT } elseif ($env:HERMES_WEB_GATEWAY_LAUNCH_REQUEST_ROOT) { $env:HERMES_WEB_GATEWAY_LAUNCH_REQUEST_ROOT } else { "" }),
  [ValidateSet("eager", "hybrid")]
  [string]$StartMode = $(if ($env:HERMES_MOBILE_GATEWAY_POOL_START_MODE) { $env:HERMES_MOBILE_GATEWAY_POOL_START_MODE } elseif ($env:HERMES_WEB_GATEWAY_POOL_START_MODE) { $env:HERMES_WEB_GATEWAY_POOL_START_MODE } else { "eager" }),
  [string[]]$StartProfiles = @(),
  [string[]]$StopProfiles = @(),
  [string[]]$StartReplicas = @(),
  [string[]]$StopReplicas = @(),
  [switch]$NoStopExisting,
  [switch]$ForceConfigure,
  [switch]$OwnerMaintenanceOnly,
  [string]$PoolKey = "",
  [string]$ProfileTemplateKey = "",
  [string]$TemplateKey = "",
  [string]$ReplicaId = "",
  [string]$ProfileAlias = "",
  [string]$WorkspaceId = "",
  [string]$PermissionTier = "",
  [string]$Provider = "",
  [string]$CapabilityHash = "",
  [string]$ToolSchemaEpoch = "",
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

function Get-GatewayPoolElasticRequestRoot {
  if ($ElasticRequestRoot) { return $ElasticRequestRoot }
  return (Join-Path $GatewayWorkerRoot "elastic-requests")
}

function Limit-GatewayPoolPublicText {
  param([string]$Value)
  $text = ([string]$Value).Trim()
  if (-not $text) { return "" }
  $text = [Regex]::Replace($text, '[A-Za-z0-9+/=_-]{24,}', '[redacted]')
  $text = [Regex]::Replace($text, 'Bearer\s+[^\s]+', 'Bearer [redacted]', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $text = [Regex]::Replace($text, '\b(access|refresh|owner|workspace|api)?_?key\s*[:=]?\s+[^\s;,.]+', '$1_key [redacted]', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($text.Length -gt 800) { return $text.Substring($text.Length - 800) }
  return $text
}

function Write-GatewayPoolElasticResult {
  param(
    [object]$Request,
    [bool]$Ok,
    [string]$Code = "",
    [string]$Message = "",
    [string]$Stdout = "",
    [string]$Stderr = "",
    [datetime]$StartedAt
  )
  $root = Get-GatewayPoolElasticRequestRoot
  $resultDir = Join-Path $root "results"
  New-Item -ItemType Directory -Force -Path $resultDir | Out-Null
  $requestId = ([string]$Request.requestId).Trim()
  if (-not $requestId -or $requestId -notmatch '^[A-Za-z0-9][A-Za-z0-9_-]{0,140}$') {
    $requestId = "invalid-request"
  }
  $durationMs = 0
  if ($StartedAt) { $durationMs = [int]((Get-Date) - $StartedAt).TotalMilliseconds }
  $payload = [ordered]@{
    ok = $Ok
    requestId = $requestId
    action = ([string]$Request.action).Trim()
    profiles = @($Request.profiles)
    replicas = @($Request.replicas)
    code = $Code
    message = Limit-GatewayPoolPublicText -Value $Message
    stdout = Limit-GatewayPoolPublicText -Value $Stdout
    stderr = Limit-GatewayPoolPublicText -Value $Stderr
    completedAt = (Get-Date).ToUniversalTime().ToString("o")
    durationMs = $durationMs
  }
  $path = Join-Path $resultDir "$requestId.json"
  $tmp = "$path.tmp"
  $payload | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $tmp -Encoding UTF8
  Move-Item -LiteralPath $tmp -Destination $path -Force
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

function Resolve-GatewayPoolWslHostApiBaseUrl {
  param([int]$Port)
  $addresses = @()
  try {
    $addresses = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object {
        $_.IPAddress -and
        $_.IPAddress -ne "127.0.0.1" -and
        $_.IPAddress -notmatch "^169\.254\." -and
        ($_.AddressState -eq "Preferred" -or -not $_.AddressState)
      } |
      Select-Object InterfaceAlias, IPAddress)
  } catch {
    $addresses = @()
  }
  $preferred = @($addresses |
    Where-Object {
      $_.InterfaceAlias -match "WSL" -and
      $_.IPAddress -match "^172\.(1[6-9]|2[0-9]|3[0-1])\."
    } |
    Select-Object -First 1)
  if ($preferred.Count -eq 0) { return "" }
  return "http://$($preferred[0].IPAddress):$Port"
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

function Normalize-GatewayTemplateMetadataValue {
  param(
    [string]$Value,
    [int]$MaxLength = 160
  )
  $text = ([string]$Value).Trim()
  if (-not $text) { return "" }
  if ($text.Length -gt $MaxLength) { throw "Gateway template metadata value is too long." }
  if ($text -notmatch '^[A-Za-z0-9_.|:+-]+$') { throw "Unsafe Gateway template metadata value." }
  return $text
}

function Is-OwnerMaintenanceWorker {
  param($Worker)
  if (-not $Worker.enabled -or -not $Worker.allowMaintenance -or -not $Worker.profile -or -not $Worker.port) { return $false }
  if ([string]$Worker.securityLevel -ne "owner-maintenance") { return $false }
  return [string]$Worker.profile -match '^(officialclean|deepseekmaint)[0-9]+$'
}

function Normalize-GatewayProfileList {
  param([string[]]$Profiles)
  $items = @()
  foreach ($profile in @($Profiles)) {
    foreach ($part in ([string]$profile -split ",")) {
      $text = $part.Trim()
      if (-not $text) { continue }
      Assert-SafeGatewayProfileName -Profile $text
      $items += $text
    }
  }
  return @($items | Select-Object -Unique)
}

function Normalize-GatewayReplicaList {
  param([string[]]$Replicas)
  $items = @()
  foreach ($replica in @($Replicas)) {
    foreach ($part in ([string]$replica -split ",")) {
      $text = Normalize-GatewayTemplateMetadataValue -Value $part -MaxLength 80
      if (-not $text) { continue }
      $items += $text
    }
  }
  return @($items | Select-Object -Unique)
}

function Read-GatewayPoolManifest {
  if (-not (Test-Path -LiteralPath $ManifestPath)) { throw "Missing gateway pool manifest: $ManifestPath" }
  return (Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json)
}

function Gateway-WorkerIdentityValues {
  param($Worker)
  $values = @()
  foreach ($key in @("replicaId", "replica_id", "profileAlias", "profile_alias", "profile", "name", "id")) {
    $value = ""
    if ($Worker.PSObject.Properties.Name -contains $key) { $value = ([string]$Worker.$key).Trim() }
    if ($value) { $values += $value }
  }
  return @($values | Select-Object -Unique)
}

function Resolve-GatewayReplicasToProfiles {
  param([string[]]$Replicas)
  $normalized = Normalize-GatewayReplicaList -Replicas $Replicas
  if ($normalized.Count -eq 0) { return @() }
  $manifest = Read-GatewayPoolManifest
  $profiles = @()
  foreach ($replica in $normalized) {
    $matches = @($manifest.workers | Where-Object {
      ($_.enabled -ne $false) -and (@(Gateway-WorkerIdentityValues -Worker $_) -contains $replica)
    })
    if ($matches.Count -eq 0) { throw "Gateway replica not found in manifest: $replica" }
    if ($matches.Count -gt 1) { throw "Gateway replica is ambiguous in manifest: $replica" }
    $profile = ([string]$matches[0].profile).Trim()
    if (-not $profile) { $profile = ([string]$matches[0].name).Trim() }
    Assert-SafeGatewayProfileName -Profile $profile
    $profiles += $profile
  }
  return @($profiles | Select-Object -Unique)
}

function Resolve-GatewayProfileOrReplicaList {
  param(
    [string[]]$Profiles = @(),
    [string[]]$Replicas = @()
  )
  $resolvedReplicas = @(Resolve-GatewayReplicasToProfiles -Replicas $Replicas)
  if ($resolvedReplicas.Count -gt 0) { return $resolvedReplicas }
  return @(Normalize-GatewayProfileList -Profiles $Profiles)
}

function Get-HybridOwnerWarmProfiles {
  $manifest = Read-GatewayPoolManifest
  $limit = 1
  $envLimit = [Environment]::GetEnvironmentVariable("HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM")
  if (-not $envLimit) { $envLimit = [Environment]::GetEnvironmentVariable("HERMES_WEB_GATEWAY_OWNER_MIN_WARM") }
  if ($envLimit -and $envLimit -match '^\d+$') { $limit = [Math]::Max(0, [int]$envLimit) }
  if ($limit -le 0) { return @() }
  $profiles = @()
  foreach ($worker in @($manifest.workers)) {
    if ($worker.enabled -eq $false) { continue }
    if ([string]$worker.securityLevel -eq "owner-maintenance") { continue }
    $profile = ([string]$worker.profile).Trim()
    if (-not $profile) { $profile = ([string]$worker.name).Trim() }
    if (-not $profile) { continue }
    $allowed = @($worker.allowedWorkspaceIds) + @($worker.allowed_workspace_ids) + @($worker.skillWorkspaceIds) + @($worker.skill_workspace_ids)
    $allowedText = ($allowed | ForEach-Object { [string]$_ }) -join ","
    if ($allowedText -match '(^|,)\s*owner\s*(,|$)' -or $profile -eq "lowgw1") {
      Assert-SafeGatewayProfileName -Profile $profile
      $profiles += $profile
    }
    if ($profiles.Count -ge $limit) { break }
  }
  return @($profiles)
}

function Get-OwnerMaintenanceWorkers {
  $manifest = Read-GatewayPoolManifest
  return @($manifest.workers | Where-Object { Is-OwnerMaintenanceWorker -Worker $_ })
}

function Get-OwnerMaintenanceMinWarm {
  $envLimit = [Environment]::GetEnvironmentVariable("HERMES_MOBILE_GATEWAY_OWNER_MAINTENANCE_MIN_WARM")
  if (-not $envLimit) { $envLimit = [Environment]::GetEnvironmentVariable("HERMES_WEB_GATEWAY_OWNER_MAINTENANCE_MIN_WARM") }
  if ($envLimit -and $envLimit -match '^\d+$') { return [Math]::Max(0, [int]$envLimit) }
  if ($StartMode -eq "hybrid") { return 0 }
  return -1
}

function Get-OwnerMaintenanceWatchdogTargetWorkers {
  param([object[]]$Workers)
  $limit = Get-OwnerMaintenanceMinWarm
  if ($limit -lt 0) { return @($Workers) }
  if ($limit -le 0) { return @() }
  return @($Workers | Select-Object -First $limit)
}

function Get-OwnerMaintenanceWorkersByProfile {
  param([string[]]$Profiles)
  $normalized = Normalize-GatewayProfileList -Profiles $Profiles
  if ($normalized.Count -eq 0) { return @() }
  $selected = @()
  $workers = Get-OwnerMaintenanceWorkers
  foreach ($profile in $normalized) {
    $match = @($workers | Where-Object { [string]$_.profile -eq $profile })
    if ($match.Count -eq 0) { throw "Owner-maintenance profile not found or not allowed: $profile" }
    $selected += $match[0]
  }
  return @($selected)
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

function Add-OwnerMaintenanceSkillStoreCommands {
  param(
    [System.Collections.ArrayList]$Commands,
    [string]$ProfileRoot,
    [string]$OwnerSkillStore
  )
  $profileSkillsPath = "$ProfileRoot/skills"
  [void]$Commands.Add("mkdir -p $OwnerSkillStore")
  [void]$Commands.Add("resolved_profile_skills=`$(readlink -f $profileSkillsPath 2>/dev/null || true); resolved_owner_skills=`$(readlink -f $OwnerSkillStore 2>/dev/null || true); if [ -z `"`$resolved_profile_skills`" ] || [ `"`$resolved_profile_skills`" != `"`$resolved_owner_skills`" ]; then backup_root=$ProfileRoot/skill-store-backups; stamp=`$(date +%Y%m%d-%H%M%S); mkdir -p `"`$backup_root`"; if [ -e $profileSkillsPath ] || [ -L $profileSkillsPath ]; then mv $profileSkillsPath `"`$backup_root/skills-before-owner-link-`$stamp`"; fi; ln -sfn $OwnerSkillStore $profileSkillsPath; fi")
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
  $profile = Split-Path -Leaf $parent
  if (-not $profile) { $profile = "owner-maintenance" }
  $profileRoot = "/home/$OfficialUser/.hermes/profiles/$profile"
  try {
    $gatewayWorkerRootWsl = Convert-GatewayPoolWindowsPathToWslPath -Distro $OfficialDistro -User $OfficialUser -WindowsPath $GatewayWorkerRoot
  } catch {
    $gatewayWorkerRootWsl = "/mnt/c/ProgramData/HermesMobile/gateway-worker"
  }
  $programDataRoot = Split-Path -Parent $GatewayWorkerRoot
  $ownerWorkspaceWindows = Join-Path $programDataRoot "data\drive\users\owner"
  try {
    $ownerWorkspace = Convert-GatewayPoolWindowsPathToWslPath -Distro $OfficialDistro -User $OfficialUser -WindowsPath $ownerWorkspaceWindows
  } catch {
    $ownerWorkspace = "/mnt/c/ProgramData/HermesMobile/data/drive/users/owner"
  }
  $financeApiBaseUrl = [Environment]::GetEnvironmentVariable("HERMES_MOBILE_FINANCE_MCP_API_BASE_URL")
  if (-not $financeApiBaseUrl) { $financeApiBaseUrl = [Environment]::GetEnvironmentVariable("HERMES_WEB_FINANCE_MCP_API_BASE_URL") }
  if (-not $financeApiBaseUrl) { $financeApiBaseUrl = "http://127.0.0.1:8791" }
  $noteApiBaseUrl = [Environment]::GetEnvironmentVariable("HERMES_MOBILE_NOTE_MCP_API_BASE_URL")
  if (-not $noteApiBaseUrl) { $noteApiBaseUrl = [Environment]::GetEnvironmentVariable("HERMES_WEB_NOTE_MCP_API_BASE_URL") }
  if (-not $noteApiBaseUrl) { $noteApiBaseUrl = Resolve-GatewayPoolWslHostApiBaseUrl -Port 4181 }
  if (-not $noteApiBaseUrl) { $noteApiBaseUrl = "http://127.0.0.1:4181" }
  $healthApiBaseUrl = [Environment]::GetEnvironmentVariable("HERMES_MOBILE_HEALTH_MCP_API_BASE_URL")
  if (-not $healthApiBaseUrl) { $healthApiBaseUrl = [Environment]::GetEnvironmentVariable("HERMES_WEB_HEALTH_MCP_API_BASE_URL") }
  if (-not $healthApiBaseUrl) { $healthApiBaseUrl = Resolve-GatewayPoolWslHostApiBaseUrl -Port 4877 }
  if (-not $healthApiBaseUrl) { $healthApiBaseUrl = "http://127.0.0.1:4877" }
  $emailApiBaseUrl = [Environment]::GetEnvironmentVariable("HERMES_MOBILE_EMAIL_MCP_API_BASE_URL")
  if (-not $emailApiBaseUrl) { $emailApiBaseUrl = [Environment]::GetEnvironmentVariable("HERMES_WEB_EMAIL_MCP_API_BASE_URL") }
  if (-not $emailApiBaseUrl) { $emailApiBaseUrl = Resolve-GatewayPoolWslHostApiBaseUrl -Port 5175 }
  if (-not $emailApiBaseUrl) { $emailApiBaseUrl = "http://127.0.0.1:5175" }
  $moiraApiBaseUrl = [Environment]::GetEnvironmentVariable("HERMES_MOBILE_MOIRA_MCP_API_BASE_URL")
  if (-not $moiraApiBaseUrl) { $moiraApiBaseUrl = [Environment]::GetEnvironmentVariable("HERMES_WEB_MOIRA_MCP_API_BASE_URL") }
  if (-not $moiraApiBaseUrl) { $moiraApiBaseUrl = Resolve-GatewayPoolWslHostApiBaseUrl -Port 4174 }
  if (-not $moiraApiBaseUrl) { $moiraApiBaseUrl = "http://127.0.0.1:4174" }
  $normalizedProvider = ([string]$Provider).Trim().ToLowerInvariant()
  if ($normalizedProvider -eq "deepseek") {
    $modelBlock = "model:`n  default: deepseek-chat`n  provider: deepseek"
  } else {
    $modelBlock = "model:`n  default: gpt-5.5`n  provider: openai-codex`n  base_url: https://chatgpt.com/backend-api/codex"
  }
  $text = @"
$modelBlock
toolsets:
  - web
  - search
  - x_search
  - browser
  - file
  - vision
  - video
  - image_gen
  - messaging
  - tts
  - skills
  - todo
  - kanban
  - cronjob
  - memory
  - session_search
  - clarify
  - weather
  - http
  - cronjob_mobile
  - wardrobe
  - finance
  - note
  - health
  - moira
  - email
  - chatgpt_pro
  - hermes-cli
platform_toolsets:
  api_server:
    - web
    - search
    - x_search
    - browser
    - file
    - vision
    - video
    - image_gen
    - messaging
    - tts
    - skills
    - todo
    - kanban
    - cronjob
    - memory
    - session_search
    - clarify
    - weather
    - http
    - cronjob_mobile
    - wardrobe
    - finance
    - note
    - health
    - moira
    - email
    - chatgpt_pro
    - hermes-cli
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
    - hermes-mobile-weather
    - hermes-mobile-web
    - hermes-mobile-http
    - hermes-mobile-docx
    - hermes-mobile-audio
    - hermes-mobile-image
    - hermes-mobile-cronjob
    - hermes-mobile-chatgpt-pro
worker_pool:
  enabled: false
cron:
  enabled: false
mcp_servers:
  wardrobe:
    command: /opt/hermes-gateway-runtime/venv/bin/python
    args:
      - $gatewayWorkerRootWsl/wardrobe-mcp/scripts/wardrobe-mcp.py
      - --workspace
      - $ownerWorkspace
      - --no-workspace-override
    env:
      HERMES_HOME: $profileRoot
      PYTHONPATH: /opt/hermes-gateway-runtime/official-clean
    enabled: true
    timeout: 180
    connect_timeout: 60
  finance:
    command: /opt/hermes-gateway-runtime/venv/bin/python
    args:
      - $gatewayWorkerRootWsl/finance-mcp/scripts/finance_mcp_stdio.py
      - --workspace
      - $ownerWorkspace
      - --no-workspace-override
      - --api-base-url
      - $financeApiBaseUrl
    env:
      HERMES_HOME: $profileRoot
    enabled: true
    timeout: 180
    connect_timeout: 60
  note:
    command: /opt/hermes-gateway-runtime/venv/bin/python
    args:
      - $gatewayWorkerRootWsl/note-mcp/scripts/note_mcp_stdio.py
      - --workspace
      - $ownerWorkspace
      - --no-workspace-override
      - --api-base-url
      - $noteApiBaseUrl
    env:
      HERMES_HOME: $profileRoot
      HERMES_PROFILE: $profile
    startup_timeout: 60
    connect_timeout: 60
  health:
    command: node
    args:
      - $gatewayWorkerRootWsl/health-mcp/scripts/mcp-health-wrapper.js
      - --workspace
      - $ownerWorkspace
      - --no-workspace-override
      - --gateway-tool-names
      - --api-base-url
      - $healthApiBaseUrl
    env:
      HERMES_HOME: $profileRoot
      HERMES_PROFILE: $profile
    startup_timeout: 60
    connect_timeout: 60
  moira:
    command: node
    args:
      - $gatewayWorkerRootWsl/moira-mcp/scripts/moira-mcp-stdio.mjs
      - --workspace
      - $ownerWorkspace
      - --no-workspace-override
      - --api-base-url
      - $moiraApiBaseUrl
    env:
      HERMES_HOME: $profileRoot
      HERMES_PROFILE: $profile
    startup_timeout: 60
    connect_timeout: 60
  email:
    command: /opt/hermes-gateway-runtime/venv/bin/python
    args:
      - $gatewayWorkerRootWsl/email-mcp/scripts/email-mcp-wrapper.py
      - --workspace
      - $ownerWorkspace
      - --no-workspace-override
      - --api-base-url
      - $emailApiBaseUrl
    env:
      HERMES_HOME: $profileRoot
      HERMES_PROFILE: $profile
    startup_timeout: 60
    connect_timeout: 60
"@
  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($ConfigPath, $text, $utf8NoBom)
}

function Install-OwnerMaintenanceChatGptProPlugin {
  if (-not (Test-Path -LiteralPath $ManifestPath)) { return }
  $manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
  $workers = @($manifest.workers | Where-Object { Is-OwnerMaintenanceWorker -Worker $_ })
  if ($workers.Count -eq 0) { return }
  $pluginNames = @(
    "hermes-mobile-weather",
    "hermes-mobile-web",
    "hermes-mobile-http",
    "hermes-mobile-docx",
    "hermes-mobile-audio",
    "hermes-mobile-image",
    "hermes-mobile-cronjob",
    "hermes-mobile-chatgpt-pro"
  )
  $programRoot = Split-Path -Parent $PSScriptRoot
  $pluginsRoot = "\\wsl.localhost\$OfficialDistro\home\$OfficialUser\.hermes\plugins"
  if (-not (Test-Path -LiteralPath $pluginsRoot)) {
    New-Item -ItemType Directory -Force -Path $pluginsRoot | Out-Null
  }
  foreach ($pluginName in $pluginNames) {
    $sourceCandidates = @(
      (Join-Path $programRoot "app\gateway-plugins\$pluginName"),
      (Join-Path $programRoot "gateway-plugins\$pluginName"),
      (Join-Path (Split-Path -Parent $programRoot) "gateway-plugins\$pluginName")
    )
    $source = [string]($sourceCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1)
    if (-not (Test-Path -LiteralPath $source)) { throw "Missing owner-maintenance plugin source: $pluginName" }
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
    }
  }
  foreach ($worker in $workers) {
    $profile = [string]$worker.profile
    Assert-SafeGatewayProfileName -Profile $profile
    $configPath = "\\wsl.localhost\$OfficialDistro\home\$OfficialUser\.hermes\profiles\$profile\config.yaml"
    Ensure-ProfileToolsetEnabled -ConfigPath $configPath -ToolsetName "chatgpt_pro"
  }
  Write-GatewayPoolLog "Installed owner-maintenance plugins."
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
  param(
    [string[]]$Profiles = @(),
    [string[]]$Replicas = @(),
    [switch]$NoStopExisting,
    [switch]$ForceConfigure,
    [string]$PoolKey = "",
    [string]$ProfileTemplateKey = "",
    [string]$TemplateKey = "",
    [string]$ReplicaId = "",
    [string]$ProfileAlias = "",
    [string]$WorkspaceId = "",
    [string]$PermissionTier = "",
    [string]$Provider = "",
    [string]$CapabilityHash = "",
    [string]$ToolSchemaEpoch = ""
  )
  $child = Join-Path $GatewayWorkerRoot "start-low-gateways-child.ps1"
  if (-not (Test-Path -LiteralPath $child)) { throw "Missing low gateway child script: $child" }
  Ensure-LowGatewayProfileEnv
  $replicas = Normalize-GatewayReplicaList -Replicas $Replicas
  $profiles = Resolve-GatewayProfileOrReplicaList -Profiles $Profiles -Replicas $replicas
  $safePoolKey = Normalize-GatewayTemplateMetadataValue -Value $PoolKey
  $safeProfileTemplateKey = Normalize-GatewayTemplateMetadataValue -Value $ProfileTemplateKey
  $safeTemplateKey = Normalize-GatewayTemplateMetadataValue -Value ($(if ($TemplateKey) { $TemplateKey } else { $ProfileTemplateKey }))
  $safeReplicaId = Normalize-GatewayTemplateMetadataValue -Value ($(if ($ReplicaId) { $ReplicaId } elseif ($replicas.Count -eq 1) { $replicas[0] } else { "" })) -MaxLength 80
  $safeProfileAlias = Normalize-GatewayTemplateMetadataValue -Value $ProfileAlias -MaxLength 80
  $safeWorkspaceId = Normalize-GatewayTemplateMetadataValue -Value $WorkspaceId -MaxLength 80
  $safePermissionTier = Normalize-GatewayTemplateMetadataValue -Value $PermissionTier -MaxLength 80
  $safeProvider = Normalize-GatewayTemplateMetadataValue -Value $Provider -MaxLength 80
  $safeCapabilityHash = Normalize-GatewayTemplateMetadataValue -Value $CapabilityHash -MaxLength 80
  $safeToolSchemaEpoch = Normalize-GatewayTemplateMetadataValue -Value $ToolSchemaEpoch -MaxLength 80
  if (-not $NoStopExisting) { Stop-LowGateways }
  $profileArgs = @()
  if ($profiles.Count -gt 0) { $profileArgs += @("-StartProfiles", ($profiles -join ",")) }
  if ($NoStopExisting) { $profileArgs += "-SkipConfigureIfReady" }
  if ($ForceConfigure) { $profileArgs += "-ForceConfigure" }
  if ($safePoolKey -or $safeTemplateKey -or $safeReplicaId -or $safeWorkspaceId) {
    if ($safePoolKey) { $profileArgs += @("-PoolKey", $safePoolKey) }
    if ($safeProfileTemplateKey) { $profileArgs += @("-ProfileTemplateKey", $safeProfileTemplateKey) }
    if ($safeTemplateKey) { $profileArgs += @("-TemplateKey", $safeTemplateKey) }
    if ($safeReplicaId) { $profileArgs += @("-ReplicaId", $safeReplicaId) }
    if ($safeProfileAlias) { $profileArgs += @("-ProfileAlias", $safeProfileAlias) }
    if ($safeWorkspaceId) { $profileArgs += @("-WorkspaceId", $safeWorkspaceId) }
    if ($safePermissionTier) { $profileArgs += @("-PermissionTier", $safePermissionTier) }
    if ($safeProvider) { $profileArgs += @("-Provider", $safeProvider) }
    if ($safeCapabilityHash) { $profileArgs += @("-CapabilityHash", $safeCapabilityHash) }
    if ($safeToolSchemaEpoch) { $profileArgs += @("-ToolSchemaEpoch", $safeToolSchemaEpoch) }
    Write-GatewayPoolLog ("Starting low gateway pool profiles: {0} replicas={1} pool={2} template={3} replica={4} workspace={5}" -f ($(if ($profiles.Count) { $profiles -join "," } else { "all" })), ($(if ($replicas.Count) { $replicas -join "," } else { "" })), $safePoolKey, $safeTemplateKey, $safeReplicaId, $safeWorkspaceId)
  } else {
    Write-GatewayPoolLog ("Starting low gateway pool profiles: {0}" -f ($(if ($profiles.Count) { $profiles -join "," } else { "all" })))
  }
  $output = & powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File $child -DistroName $LowGatewayDistroName @profileArgs 2>&1
  foreach ($line in $output) { Write-GatewayPoolLog ("lowgw: {0}" -f $line) }
  if ($LASTEXITCODE -ne 0) { throw "Low gateway pool start failed with exit code $LASTEXITCODE" }
}

function Stop-LowGatewayProfiles {
  param(
    [string[]]$Profiles = @(),
    [string[]]$Replicas = @()
  )
  $replicas = Normalize-GatewayReplicaList -Replicas $Replicas
  $profiles = Resolve-GatewayProfileOrReplicaList -Profiles $Profiles -Replicas $replicas
  if ($profiles.Count -eq 0) { return }
  $child = Join-Path $GatewayWorkerRoot "start-low-gateways-child.ps1"
  if (-not (Test-Path -LiteralPath $child)) { throw "Missing low gateway child script: $child" }
  Ensure-LowGatewayProfileEnv
  Write-GatewayPoolLog ("Stopping low gateway profiles: {0} replicas={1}" -f ($profiles -join ","), ($(if ($replicas.Count) { $replicas -join "," } else { "" })))
  $output = & powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File $child -DistroName $LowGatewayDistroName -StartProfiles ($profiles -join ",") -StopOnly 2>&1
  foreach ($line in $output) { Write-GatewayPoolLog ("lowgw-stop-profile: {0}" -f $line) }
  if ($LASTEXITCODE -ne 0) { throw "Low gateway profile stop failed with exit code $LASTEXITCODE" }
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
    $telemetryConfigPath = Join-Path (Join-Path (Join-Path $GatewayWorkerRoot "telemetry\profiles") $profile) "config.yaml"
    Ensure-OwnerMaintenanceProfileConfig -ConfigPath $telemetryConfigPath -Port ([int]$worker.port) -Provider $provider
    $profileRoot = "/home/$OfficialUser/.hermes/profiles/$profile"
    $profileMemoryPath = "$profileRoot/memories"
    [void]$commands.Add("mkdir -p /home/$OfficialUser/.hermes/profiles/$profile/logs")
    [void]$commands.Add("rm -f /home/$OfficialUser/.hermes/profiles/$profile/auth.json /home/$OfficialUser/.hermes/profiles/$profile/auth.lock")
    [void]$commands.Add("ln -sfn $sharedAuthPath /home/$OfficialUser/.hermes/profiles/$profile/auth.json")
    [void]$commands.Add("ln -sfn $sharedAuthLockPath /home/$OfficialUser/.hermes/profiles/$profile/auth.lock")
    if ($sharedMemoryEnabled) {
      Add-OwnerMaintenanceSharedMemoryCommands -Commands $commands -ProfileRoot $profileRoot -ProfileMemoryPath $profileMemoryPath -SharedMemoryPath $sharedMemoryPath
    }
    Add-OwnerMaintenanceSkillStoreCommands -Commands $commands -ProfileRoot $profileRoot -OwnerSkillStore $ownerSkillStore
    if ($provider -eq "deepseek") {
      [void]$commands.Add("if [ -z `"`$deepseek_api_key`" ]; then echo missing DeepSeek API key for $profile >&2; exit 1; fi")
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

function Start-OwnerMaintenanceProfiles {
  param([string[]]$Profiles)
  $targetWorkers = @(Get-OwnerMaintenanceWorkersByProfile -Profiles $Profiles)
  if ($targetWorkers.Count -eq 0) { throw "Owner-maintenance start request missing profile." }
  Write-GatewayPoolLog ("Owner-maintenance on-demand start profiles: {0}" -f (($targetWorkers | ForEach-Object { [string]$_.profile }) -join ', '))
  Invoke-GatewayPoolPhase -Name "install-owner-maintenance-chatgpt-pro-plugin" -ScriptBlock { Install-OwnerMaintenanceChatGptProPlugin }
  $targetPorts = @()
  Invoke-GatewayPoolPhase -Name "start-owner-maintenance-gateways" -ScriptBlock { $script:targetPorts = @(Start-OwnerMaintenanceGateways -TargetWorkers $targetWorkers) }
  Invoke-GatewayPoolPhase -Name "wait-owner-maintenance-health" -ScriptBlock { Wait-HealthPorts -Ports $script:targetPorts }
  Write-GatewayPoolLog "Owner-maintenance on-demand start OK; healthy ports: $($script:targetPorts -join ', ')."
}

function Stop-OwnerMaintenanceGateways {
  param([object[]]$TargetWorkers = @())
  Assert-SafeLinuxUserName -UserName $OfficialUser
  $workers = @($TargetWorkers)
  if ($workers.Count -eq 0) { $workers = Get-OwnerMaintenanceWorkers }
  if ($workers.Count -eq 0) {
    Write-GatewayPoolLog "No owner-maintenance workers to stop."
    return
  }
  $commands = [System.Collections.ArrayList]@()
  foreach ($worker in $workers) {
    $profile = [string]$worker.profile
    Assert-SafeGatewayProfileName -Profile $profile
    $port = [int]$worker.port
    [void]$commands.Add("profile=$profile")
    [void]$commands.Add("port=$port")
    [void]$commands.Add('pids="$(ss -ltnp "sport = :${port}" 2>/dev/null | sed -n ''s/.*pid=\([0-9]\+\).*/\1/p'' | sort -u | tr ''\n'' '' '' | xargs || true)"')
    [void]$commands.Add('if [ -n "$pids" ]; then echo "Stopping owner-maintenance ${profile} on port ${port}: ${pids}"; kill $pids 2>/dev/null || true; for _ in $(seq 1 20); do if ! ss -ltn "sport = :${port}" 2>/dev/null | grep -q ":${port}"; then break; fi; sleep 0.25; done; if ss -ltn "sport = :${port}" 2>/dev/null | grep -q ":${port}"; then kill -9 $pids 2>/dev/null || true; fi; fi')
  }
  $ownerMaintenanceStopShell = Join-Path $GatewayWorkerRoot "stop-owner-maintenance-gateways.sh"
  $bash = "set -euo pipefail`n" + ($commands -join "`n") + "`n"
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($ownerMaintenanceStopShell, $bash, $encoding)

  Write-GatewayPoolLog ("Stopping owner-maintenance gateway profiles: {0}" -f (($workers | ForEach-Object { [string]$_.profile }) -join ', '))
  $result = Invoke-GatewayPoolWslBashFile -Distro $OfficialDistro -User $OfficialUser -ScriptPath $ownerMaintenanceStopShell
  foreach ($line in $result.Output) { Write-GatewayPoolLog ("owner-maintenance-stop: {0}" -f $line) }
  if ($result.ExitCode -ne 0) { throw "Owner-maintenance gateway stop failed with exit code $($result.ExitCode)" }
}

function Stop-OwnerMaintenanceProfiles {
  param([string[]]$Profiles)
  $targetWorkers = @(Get-OwnerMaintenanceWorkersByProfile -Profiles $Profiles)
  if ($targetWorkers.Count -eq 0) { throw "Owner-maintenance stop request missing profile." }
  Stop-OwnerMaintenanceGateways -TargetWorkers $targetWorkers
}

function Repair-OwnerMaintenanceGateways {
  $workers = Get-OwnerMaintenanceWorkers
  if ($workers.Count -eq 0) {
    Write-GatewayPoolLog "Owner-maintenance repair skipped; no owner-maintenance workers in manifest."
    return
  }
  $unhealthyWorkers = @($workers | Where-Object { -not (Test-HttpHealth -Port ([int]$_.port)) })
  if ($OnlyWhenOwnerMaintenanceUnhealthy) {
    $watchdogWorkers = @(Get-OwnerMaintenanceWatchdogTargetWorkers -Workers $workers)
    if ($watchdogWorkers.Count -eq 0) {
      Write-GatewayPoolLog "Owner-maintenance watchdog skipped in hybrid on-demand mode; min warm is zero."
      return
    }
    $unhealthyWorkers = @(Select-OwnerMaintenanceWorkersNeedingRepair -Workers $watchdogWorkers)
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

function Invoke-GatewayPoolElasticRequests {
  $root = Get-GatewayPoolElasticRequestRoot
  $pendingDir = Join-Path $root "pending"
  $processingDir = Join-Path $root "processing"
  $archiveDir = Join-Path $root "archive"
  if (-not (Test-Path -LiteralPath $pendingDir)) { return $false }
  $requests = @(Get-ChildItem -LiteralPath $pendingDir -Filter "*.json" -File | Sort-Object LastWriteTimeUtc, Name)
  if ($requests.Count -eq 0) { return $false }
  New-Item -ItemType Directory -Force -Path $processingDir | Out-Null
  New-Item -ItemType Directory -Force -Path $archiveDir | Out-Null

  foreach ($file in $requests) {
    $started = Get-Date
    $request = $null
    $processingPath = Join-Path $processingDir $file.Name
    try {
      Move-Item -LiteralPath $file.FullName -Destination $processingPath -Force
      $request = Get-Content -Raw -LiteralPath $processingPath | ConvertFrom-Json
      $requestId = ([string]$request.requestId).Trim()
      if (-not $requestId -or $requestId -notmatch '^[A-Za-z0-9][A-Za-z0-9_-]{0,140}$') {
        throw "Invalid Gateway elastic request id."
      }
      $action = ([string]$request.action).Trim()
      $replicaInputs = @($request.replicas)
      if ($request.replicaId) { $replicaInputs += [string]$request.replicaId }
      $replicas = Normalize-GatewayReplicaList -Replicas $replicaInputs
      $profiles = Resolve-GatewayProfileOrReplicaList -Profiles @($request.profiles) -Replicas $replicas
      $requestPoolKey = Normalize-GatewayTemplateMetadataValue -Value ([string]$request.poolKey)
      $requestProfileTemplateKey = Normalize-GatewayTemplateMetadataValue -Value ([string]$request.profileTemplateKey)
      $requestTemplateKey = Normalize-GatewayTemplateMetadataValue -Value ($(if ($request.templateKey) { [string]$request.templateKey } else { [string]$request.profileTemplateKey }))
      $requestReplicaId = Normalize-GatewayTemplateMetadataValue -Value ($(if ($request.replicaId) { [string]$request.replicaId } elseif ($replicas.Count -eq 1) { $replicas[0] } else { "" })) -MaxLength 80
      $requestProfileAlias = Normalize-GatewayTemplateMetadataValue -Value ([string]$request.profileAlias) -MaxLength 80
      $requestWorkspaceId = Normalize-GatewayTemplateMetadataValue -Value ([string]$request.workspaceId) -MaxLength 80
      $requestPermissionTier = Normalize-GatewayTemplateMetadataValue -Value ([string]$request.permissionTier) -MaxLength 80
      $requestProvider = Normalize-GatewayTemplateMetadataValue -Value ([string]$request.provider) -MaxLength 80
      $requestCapabilityHash = Normalize-GatewayTemplateMetadataValue -Value ([string]$request.capabilityHash) -MaxLength 80
      $requestToolSchemaEpoch = Normalize-GatewayTemplateMetadataValue -Value ([string]$request.toolSchemaEpoch) -MaxLength 80
      if ($requestPoolKey -or $requestTemplateKey -or $requestReplicaId) {
        Write-GatewayPoolLog ("elastic-request-start id={0} action={1} profiles={2} replicas={3} pool={4} template={5} replica={6} workspace={7}" -f $requestId, $action, ($profiles -join ","), ($replicas -join ","), $requestPoolKey, $requestTemplateKey, $requestReplicaId, $requestWorkspaceId)
      } else {
        Write-GatewayPoolLog ("elastic-request-start id={0} action={1} profiles={2} replicas={3}" -f $requestId, $action, ($profiles -join ","), ($replicas -join ","))
      }
      if ($action -eq "start") {
        if ($profiles.Count -eq 0) { throw "Gateway elastic start request missing profile or replica." }
        Start-LowGateways -Profiles $profiles -Replicas $replicas -NoStopExisting:([bool]$request.noStopExisting) -ForceConfigure:([bool]$request.forceConfigure) -PoolKey $requestPoolKey -ProfileTemplateKey $requestProfileTemplateKey -TemplateKey $requestTemplateKey -ReplicaId $requestReplicaId -ProfileAlias $requestProfileAlias -WorkspaceId $requestWorkspaceId -PermissionTier $requestPermissionTier -Provider $requestProvider -CapabilityHash $requestCapabilityHash -ToolSchemaEpoch $requestToolSchemaEpoch
      } elseif ($action -eq "stop") {
        if ($profiles.Count -eq 0) { throw "Gateway elastic stop request missing profile or replica." }
        Stop-LowGatewayProfiles -Profiles $profiles -Replicas $replicas
      } elseif ($action -eq "ownerMaintenance") {
        if ($profiles.Count -gt 0) {
          Start-OwnerMaintenanceProfiles -Profiles $profiles
        } else {
          Repair-OwnerMaintenanceGateways
        }
      } elseif ($action -eq "ownerMaintenanceStop") {
        if ($profiles.Count -eq 0) { throw "Gateway elastic owner-maintenance stop request missing profile or replica." }
        Stop-OwnerMaintenanceProfiles -Profiles $profiles
      } else {
        throw "Unsupported Gateway elastic request action: $action"
      }
      Write-GatewayPoolElasticResult -Request $request -Ok $true -StartedAt $started
      Write-GatewayPoolLog ("elastic-request-done id={0} elapsedMs={1}" -f $requestId, [int]((Get-Date) - $started).TotalMilliseconds)
    } catch {
      $message = $_.Exception.Message
      if (-not $request) {
        $request = [pscustomobject]@{
          requestId = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
          action = ""
          profiles = @()
          replicas = @()
        }
      }
      Write-GatewayPoolElasticResult -Request $request -Ok $false -Code "gateway_elastic_request_failed" -Message $message -Stderr $message -StartedAt $started
      Write-GatewayPoolLog ("elastic-request-failed file={0} error={1}" -f $file.Name, (Limit-GatewayPoolPublicText -Value $message))
    } finally {
      if (Test-Path -LiteralPath $processingPath) {
        $archiveName = "{0}-{1}" -f (Get-Date).ToString("yyyyMMddHHmmssfff"), $file.Name
        Move-Item -LiteralPath $processingPath -Destination (Join-Path $archiveDir $archiveName) -Force
      }
    }
  }
  return $true
}

Acquire-GatewayPoolRunMutex
try {
  $resolvedStartReplicas = Normalize-GatewayReplicaList -Replicas $StartReplicas
  $resolvedStopReplicas = Normalize-GatewayReplicaList -Replicas $StopReplicas
  $resolvedStartProfiles = Resolve-GatewayProfileOrReplicaList -Profiles $StartProfiles -Replicas $resolvedStartReplicas
  $resolvedStopProfiles = Resolve-GatewayProfileOrReplicaList -Profiles $StopProfiles -Replicas $resolvedStopReplicas

  if ($resolvedStopProfiles.Count -eq 0 -and $resolvedStartProfiles.Count -eq 0 -and $resolvedStopReplicas.Count -eq 0 -and $resolvedStartReplicas.Count -eq 0 -and -not $OwnerMaintenanceOnly) {
    if (Invoke-GatewayPoolElasticRequests) {
      exit 0
    }
  }
  if ($OwnerMaintenanceOnly) {
    if ($resolvedStopProfiles.Count -gt 0) {
      Stop-OwnerMaintenanceProfiles -Profiles $resolvedStopProfiles
      exit 0
    }
    if ($resolvedStartProfiles.Count -gt 0) {
      Start-OwnerMaintenanceProfiles -Profiles $resolvedStartProfiles
      exit 0
    }
    Write-GatewayPoolLog "Owner-maintenance gateway repair begin."
    Repair-OwnerMaintenanceGateways
    exit 0
  }
  if ($resolvedStopProfiles.Count -gt 0) {
    Stop-LowGatewayProfiles -Profiles $resolvedStopProfiles -Replicas $resolvedStopReplicas
    exit 0
  }
  if ($resolvedStartProfiles.Count -gt 0) {
    Start-LowGateways -Profiles $resolvedStartProfiles -Replicas $resolvedStartReplicas -NoStopExisting:$NoStopExisting -ForceConfigure:$ForceConfigure -PoolKey $PoolKey -ProfileTemplateKey $ProfileTemplateKey -TemplateKey $TemplateKey -ReplicaId $ReplicaId -ProfileAlias $ProfileAlias -WorkspaceId $WorkspaceId -PermissionTier $PermissionTier -Provider $Provider -CapabilityHash $CapabilityHash -ToolSchemaEpoch $ToolSchemaEpoch
    exit 0
  }

  Write-GatewayPoolLog "Gateway pool startup begin."
  Invoke-GatewayPoolPhase -Name "provision-owner-external-connectors" -ScriptBlock { Provision-OwnerExternalConnectors }
  if ($StartMode -eq "hybrid") {
    $ownerWarmProfiles = @(Get-HybridOwnerWarmProfiles)
    if ($ownerWarmProfiles.Count -gt 0) {
      Invoke-GatewayPoolPhase -Name "start-low-gateways-hybrid-owner-warm" -ScriptBlock { Start-LowGateways -Profiles $ownerWarmProfiles -ForceConfigure:$ForceConfigure }
    } else {
      Write-GatewayPoolLog "Hybrid startup skipped low Gateway warm start because owner min warm is zero."
    }
  } else {
    Invoke-GatewayPoolPhase -Name "start-low-gateways" -ScriptBlock { Start-LowGateways -ForceConfigure:$ForceConfigure }
  }
  Invoke-GatewayPoolPhase -Name "check-low-gateway-codex-auth" -ScriptBlock { Check-LowGatewayCodexAuth }
  if ($StartMode -ne "hybrid") {
    Invoke-GatewayPoolPhase -Name "install-owner-maintenance-chatgpt-pro-plugin" -ScriptBlock { Install-OwnerMaintenanceChatGptProPlugin }
    Invoke-GatewayPoolPhase -Name "start-owner-maintenance-gateways" -ScriptBlock { Start-OwnerMaintenanceGateways | Out-Null }
  }

  $manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
  if ($StartMode -eq "hybrid") {
    $activeProfiles = @(Get-HybridOwnerWarmProfiles)
    $ports = @($manifest.workers | Where-Object { $_.enabled -and $_.port -and ($activeProfiles -contains [string]$_.profile) } | ForEach-Object { [int]$_.port })
  } else {
    $ports = @($manifest.workers | Where-Object { $_.enabled -and $_.port } | ForEach-Object { [int]$_.port })
  }
  Invoke-GatewayPoolPhase -Name "wait-gateway-health" -ScriptBlock { Wait-HealthPorts -Ports $ports }
  Write-GatewayPoolLog "Gateway pool startup OK; healthy ports: $($ports -join ', ')."
} finally {
  Release-GatewayPoolRunMutex
}
