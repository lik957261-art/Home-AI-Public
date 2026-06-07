param(
  [Alias("start-profiles")]
  [string]$StartProfiles = "",
  [Alias("stop-profiles")]
  [string]$StopProfiles = "",
  [Alias("start-replicas")]
  [string]$StartReplicas = "",
  [Alias("stop-replicas")]
  [string]$StopReplicas = "",
  [Alias("owner-maintenance-only")]
  [switch]$OwnerMaintenanceOnly,
  [Alias("no-stop-existing")]
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

$ErrorActionPreference = "Stop"

$AppRoot = $env:HERMES_MOBILE_APP_ROOT
if (-not $AppRoot) { $AppRoot = "C:\ProgramData\HermesMobile\app" }
$DataRoot = $env:HERMES_WEB_DATA_DIR
if (-not $DataRoot) { $DataRoot = "C:\ProgramData\HermesMobile\data" }
$WorkerRoot = $env:HERMES_MOBILE_GATEWAY_WORKER_ROOT
if (-not $WorkerRoot) { $WorkerRoot = "C:\ProgramData\HermesMobile\gateway-worker" }
$ManifestPath = $env:HERMES_WEB_GATEWAY_POOL_MANIFEST
if (-not $ManifestPath) { $ManifestPath = Join-Path $DataRoot "gateway-pool-manifest.json" }
$NativeRoot = Join-Path $WorkerRoot "native-runtime"
$NativeSource = Join-Path $NativeRoot "official-clean"
$NativeVenv = Join-Path $NativeRoot "venv"
$NativePython = Join-Path $NativeVenv "Scripts\python.exe"
$NativeProfilesRoot = Join-Path $NativeRoot "profiles"
$NativeLogRoot = Join-Path $NativeRoot "logs"
$NativeProcessRoot = Join-Path $NativeRoot "processes"
$RuntimeOverrides = Join-Path $WorkerRoot "runtime-overrides"

function Convert-ToForwardSlashPath {
  param([string]$PathValue)
  return ([System.IO.Path]::GetFullPath($PathValue)).Replace("\", "/")
}

function Split-NameList {
  param([string]$Value)
  if (-not $Value) { return @() }
  return @($Value -split "[,\s]+" | Where-Object { $_ -match "^[A-Za-z0-9][A-Za-z0-9_-]*$" })
}

function Read-Manifest {
  if (-not (Test-Path -LiteralPath $ManifestPath)) {
    throw "Gateway manifest missing: $ManifestPath"
  }
  $raw = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8
  return $raw | ConvertFrom-Json
}

function Get-ObjectPropertyValue {
  param(
    $Object,
    [string[]]$Names
  )
  foreach ($name in $Names) {
    if (-not $Object) { continue }
    $property = $Object.PSObject.Properties[$name]
    if ($property -and $null -ne $property.Value -and [string]$property.Value -ne "") {
      return $property.Value
    }
  }
  return $null
}

function Get-ManifestWorkers {
  $manifest = Read-Manifest
  if ($manifest.workers) { return @($manifest.workers) }
  if ($manifest.profiles) { return @($manifest.profiles) }
  return @()
}

function Get-WorkerByProfile {
  param([string]$Profile)
  $workers = Get-ManifestWorkers
  $match = @($workers | Where-Object {
    ([string](Get-ObjectPropertyValue $_ @("profile", "name"))) -eq $Profile -or
    ([string](Get-ObjectPropertyValue $_ @("replicaId", "replica_id"))) -eq $Profile
  } | Select-Object -First 1)
  if ($match.Count -eq 0) { throw "Gateway worker profile not found in manifest: $Profile" }
  return $match[0]
}

function Resolve-WorkerProfileName {
  param($Worker)
  $profile = [string](Get-ObjectPropertyValue $Worker @("profile", "name"))
  if (-not ($profile -match "^[A-Za-z0-9][A-Za-z0-9_-]*$")) {
    throw "Invalid Gateway worker profile name."
  }
  return $profile
}

function Resolve-WorkerPort {
  param($Worker)
  $port = [int]$Worker.port
  if ($port -lt 1024 -or $port -gt 65535) { throw "Invalid Gateway worker port for profile $(Resolve-WorkerProfileName $Worker)." }
  return $port
}

function Resolve-WorkerApiKey {
  param($Worker)
  $value = [string](Get-ObjectPropertyValue $Worker @("api_key", "apiKey"))
  if ($value) { return $value.Trim() }
  foreach ($field in @("apiKeyFile", "api_key_file", "apiKeyPath", "api_key_path")) {
    $pathValue = [string](Get-ObjectPropertyValue $Worker @($field))
    if ($pathValue -and (Test-Path -LiteralPath $pathValue)) {
      return (Get-Content -LiteralPath $pathValue -Raw -Encoding UTF8).Trim()
    }
  }
  throw "Gateway worker API key is missing for profile $(Resolve-WorkerProfileName $Worker)."
}

function Get-ProfileSourceRoot {
  param([string]$Profile)
  return Join-Path (Join-Path $WorkerRoot "telemetry\profiles") $Profile
}

function Get-NativeProfileRoot {
  param([string]$Profile)
  return Join-Path $NativeProfilesRoot $Profile
}

function Convert-ProfileConfigText {
  param(
    [string]$Text,
    [string]$Profile,
    [string]$NativeProfileRoot
  )
  $nativeProfile = Convert-ToForwardSlashPath $NativeProfileRoot
  $nativeSource = Convert-ToForwardSlashPath $NativeSource
  $nativePython = Convert-ToForwardSlashPath $NativePython
  $runtimeOverrides = Convert-ToForwardSlashPath $RuntimeOverrides
  $appRoot = Convert-ToForwardSlashPath $AppRoot
  $dataRoot = Convert-ToForwardSlashPath $DataRoot
  $workerRoot = Convert-ToForwardSlashPath $WorkerRoot

  $result = $Text
  $result = $result -replace "/mnt/c/ProgramData/HermesMobile/app", $appRoot
  $result = $result -replace "/mnt/c/ProgramData/HermesMobile/data", $dataRoot
  $result = $result -replace "/mnt/c/ProgramData/HermesMobile/gateway-worker", $workerRoot
  $result = $result -replace "/opt/hermes-gateway-runtime/venv/bin/python", $nativePython
  $result = $result -replace "/opt/hermes-gateway-runtime/official-clean", $nativeSource
  $result = $result -replace "/opt/hermes-gateway-runtime/runtime-overrides", $runtimeOverrides
  $result = $result -replace "/home/hermes/\.hermes/profiles/$([regex]::Escape($Profile))", $nativeProfile
  $result = $result -replace "/home/xuxin/\.hermes/profiles/$([regex]::Escape($Profile))", $nativeProfile
  $result = $result -replace "http://172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+:(4181|4877|5175)", 'http://127.0.0.1:$2'
  return $result
}

function Ensure-DirectoryLinkOrCopy {
  param(
    [string]$Source,
    [string]$Target
  )
  if (-not (Test-Path -LiteralPath $Source)) { return }
  if (Test-Path -LiteralPath $Target) { return }
  try {
    New-Item -ItemType Junction -Path $Target -Target $Source | Out-Null
  } catch {
    Copy-Item -LiteralPath $Source -Destination $Target -Recurse -Force
  }
}

function Ensure-FileLinkOrCopy {
  param(
    [string]$Source,
    [string]$Target
  )
  if (-not (Test-Path -LiteralPath $Source)) { return }
  if (Test-Path -LiteralPath $Target) { return }
  try {
    New-Item -ItemType HardLink -Path $Target -Target $Source | Out-Null
  } catch {
    Copy-Item -LiteralPath $Source -Destination $Target -Force
  }
}

function Ensure-NativeProfile {
  param([string]$Profile)
  if (-not (Test-Path -LiteralPath $NativePython)) { throw "Windows native Hermes runtime missing: $NativePython" }
  if (-not (Test-Path -LiteralPath $NativeSource)) { throw "Windows native Hermes source missing: $NativeSource" }
  $sourceRoot = Get-ProfileSourceRoot $Profile
  if (-not (Test-Path -LiteralPath $sourceRoot)) { throw "Gateway source profile missing: $sourceRoot" }
  $sourceConfig = Join-Path $sourceRoot "config.yaml"
  if (-not (Test-Path -LiteralPath $sourceConfig)) { throw "Gateway source profile config missing: $sourceConfig" }
  $nativeProfile = Get-NativeProfileRoot $Profile
  New-Item -ItemType Directory -Force -Path $nativeProfile, $NativeLogRoot, $NativeProcessRoot | Out-Null

  foreach ($dir in @("audio_cache", "bin", "cache", "cron", "hooks", "image_cache", "memories", "node", "node_modules", "pairing", "platforms", "plugins", "sandboxes", "sessions", "skills")) {
    Ensure-DirectoryLinkOrCopy -Source (Join-Path $sourceRoot $dir) -Target (Join-Path $nativeProfile $dir)
  }
  foreach ($file in @(".env", ".skills_prompt_snapshot.json", "auth.json", "auth.lock", "channel_directory.json", "context_length_cache.yaml", "google_client_secret.json", "google_token.json", "models_dev_cache.json", "SOUL.md", "state.db", "response_store.db")) {
    Ensure-FileLinkOrCopy -Source (Join-Path $sourceRoot $file) -Target (Join-Path $nativeProfile $file)
  }
  New-Item -ItemType Directory -Force -Path (Join-Path $nativeProfile "logs") | Out-Null

  $raw = Get-Content -LiteralPath $sourceConfig -Raw -Encoding UTF8
  $converted = Convert-ProfileConfigText -Text $raw -Profile $Profile -NativeProfileRoot $nativeProfile
  Set-Content -LiteralPath (Join-Path $nativeProfile "config.yaml") -Value $converted -Encoding UTF8
  return $nativeProfile
}

function Get-PortOwner {
  param([int]$Port)
  try {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
    if (-not $conn) { return $null }
    return Get-CimInstance Win32_Process -Filter "ProcessId=$($conn.OwningProcess)" -ErrorAction Stop
  } catch {
    return $null
  }
}

function Stop-GatewayPort {
  param([int]$Port)
  $owner = Get-PortOwner -Port $Port
  if (-not $owner) { return $false }
  $commandLine = [string]$owner.CommandLine
  $normalized = $commandLine.Replace("\", "/").ToLowerInvariant()
  if ($normalized -notmatch "hermesmobile/gateway-worker" -and $normalized -notmatch "hermes_cli\.main") {
    throw "Port $Port is owned by an unexpected process: PID $($owner.ProcessId)"
  }
  Stop-Process -Id $owner.ProcessId -Force -ErrorAction SilentlyContinue
  for ($i = 0; $i -lt 40; $i += 1) {
    Start-Sleep -Milliseconds 250
    if (-not (Get-PortOwner -Port $Port)) { return $true }
  }
  throw "Gateway port $Port did not stop cleanly."
}

function Get-PidPath {
  param([string]$Profile)
  return Join-Path $NativeProcessRoot "$Profile.pid"
}

function Stop-NativeProfile {
  param($Worker)
  $profile = Resolve-WorkerProfileName $Worker
  $port = Resolve-WorkerPort $Worker
  $pidPath = Get-PidPath $profile
  if (Test-Path -LiteralPath $pidPath) {
    $pidText = (Get-Content -LiteralPath $pidPath -Raw -Encoding UTF8).Trim()
    if ($pidText -match "^\d+$") {
      Stop-Process -Id ([int]$pidText) -Force -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
  }
  [void](Stop-GatewayPort -Port $port)
  return [ordered]@{ profile = $profile; port = $port; stopped = $true }
}

function Wait-Health {
  param([int]$Port)
  $url = "http://127.0.0.1:$Port/health"
  for ($i = 0; $i -lt 80; $i += 1) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1
      if ([int]$response.StatusCode -eq 200) { return $true }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  return $false
}

function Start-NativeProfile {
  param($Worker)
  $profile = Resolve-WorkerProfileName $Worker
  $port = Resolve-WorkerPort $Worker
  $apiKey = Resolve-WorkerApiKey $Worker
  $nativeProfile = Ensure-NativeProfile -Profile $profile
  [void](Stop-GatewayPort -Port $port)

  $stdout = Join-Path $NativeLogRoot "$profile-gateway-$port.out.log"
  $stderr = Join-Path $NativeLogRoot "$profile-gateway-$port.err.log"
  Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue

  $oldEnv = @{}
  foreach ($name in @("HOME", "HERMES_HOME", "PYTHONPATH", "PYTHONUTF8", "PYTHONIOENCODING", "HERMES_PROFILE", "HERMES_MOBILE_MCP_INVENTORY_LOG", "HERMES_GOOGLE_PROFILE_HOME", "HERMES_ACCEPT_HOOKS", "HERMES_MOBILE_BRIDGE_HOST_URL", "HERMES_WEB_BRIDGE_HOST_URL", "HERMES_MOBILE_BRIDGE_HOST_KEY_PATH", "HERMES_WEB_BRIDGE_HOST_KEY_PATH", "HERMES_MOBILE_X_SEARCH_PROXY_URL", "HERMES_MOBILE_DISABLE_X_SEARCH_PROXY_TOOL", "HERMES_KANBAN_DISPATCH_IN_GATEWAY", "DEEPSEEK_API_KEY", "API_SERVER_KEY")) {
    $oldEnv[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
  }
  try {
    $env:HOME = $nativeProfile
    $env:HERMES_HOME = $nativeProfile
    $env:PYTHONPATH = "$(Convert-ToForwardSlashPath $RuntimeOverrides);$(Convert-ToForwardSlashPath $NativeSource)"
    $env:PYTHONUTF8 = "1"
    $env:PYTHONIOENCODING = "utf-8"
    $env:HERMES_PROFILE = $profile
    $env:HERMES_MOBILE_MCP_INVENTORY_LOG = (Join-Path $NativeLogRoot "$profile-mcp-inventory.log")
    $env:HERMES_GOOGLE_PROFILE_HOME = $nativeProfile
    $env:HERMES_ACCEPT_HOOKS = "1"
    $env:HERMES_MOBILE_BRIDGE_HOST_URL = "http://127.0.0.1:8797"
    $env:HERMES_WEB_BRIDGE_HOST_URL = "http://127.0.0.1:8797"
    $env:HERMES_MOBILE_BRIDGE_HOST_KEY_PATH = Join-Path $DataRoot "secrets\bridge-host.secret"
    $env:HERMES_WEB_BRIDGE_HOST_KEY_PATH = Join-Path $DataRoot "secrets\bridge-host.secret"
    $env:HERMES_MOBILE_X_SEARCH_PROXY_URL = "http://127.0.0.1:18761"
    if ($profile -like "grokgw*") {
      $env:HERMES_MOBILE_DISABLE_X_SEARCH_PROXY_TOOL = "1"
    } else {
      $env:HERMES_MOBILE_DISABLE_X_SEARCH_PROXY_TOOL = "0"
    }
    $env:HERMES_KANBAN_DISPATCH_IN_GATEWAY = "0"
    $deepseekPath = Join-Path $DataRoot "secrets\deepseek-api-key.secret"
    if (Test-Path -LiteralPath $deepseekPath) {
      $env:DEEPSEEK_API_KEY = (Get-Content -LiteralPath $deepseekPath -Raw -Encoding UTF8).Trim()
    }
    $env:API_SERVER_KEY = $apiKey

    $process = Start-Process -FilePath $NativePython `
      -ArgumentList @("-m", "hermes_cli.main", "gateway", "run", "--replace", "--accept-hooks") `
      -WorkingDirectory $NativeSource `
      -WindowStyle Hidden `
      -RedirectStandardOutput $stdout `
      -RedirectStandardError $stderr `
      -PassThru
  } finally {
    foreach ($name in $oldEnv.Keys) {
      [Environment]::SetEnvironmentVariable($name, $oldEnv[$name], "Process")
    }
  }

  Set-Content -LiteralPath (Get-PidPath $profile) -Value ([string]$process.Id) -Encoding ASCII
  if (-not (Wait-Health -Port $port)) {
    $tail = ""
    if (Test-Path -LiteralPath $stderr) {
      $tail = (Get-Content -LiteralPath $stderr -Tail 40 -ErrorAction SilentlyContinue) -join "`n"
    }
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw "Windows native Gateway profile $profile on port $port did not become healthy. $tail"
  }
  return [ordered]@{ profile = $profile; port = $port; pid = $process.Id; healthy = $true; nativeProfile = $nativeProfile }
}

$startNames = @()
$startNames += Split-NameList $StartProfiles
$startNames += Split-NameList $StartReplicas
$stopNames = @()
$stopNames += Split-NameList $StopProfiles
$stopNames += Split-NameList $StopReplicas

if ($startNames.Count -eq 0 -and $stopNames.Count -eq 0) {
  throw "No Gateway profiles requested."
}

$results = @()
foreach ($name in $stopNames) {
  $results += Stop-NativeProfile -Worker (Get-WorkerByProfile -Profile $name)
}
foreach ($name in $startNames) {
  $results += Start-NativeProfile -Worker (Get-WorkerByProfile -Profile $name)
}

[ordered]@{
  ok = $true
  runtime = "windows-native"
  ownerMaintenanceOnly = [bool]$OwnerMaintenanceOnly
  noStopExistingIgnoredForPortSafety = [bool]$NoStopExisting
  results = $results
} | ConvertTo-Json -Depth 5
