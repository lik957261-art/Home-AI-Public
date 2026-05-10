param(
  [string]$GatewayWorkerRoot = "C:\ProgramData\HermesMobile\gateway-worker",
  [string]$ManifestPath = "C:\ProgramData\HermesMobile\data\gateway-pool-manifest.json",
  [string]$OfficialDistro = "Ubuntu-24.04",
  [string]$OfficialUser = "xuxin",
  [string]$GoogleTokenPath = "",
  [string]$GoogleClientSecretPath = "",
  [string]$OutlookGraphTokenPath = "",
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

function Ensure-LowGatewayProfileEnv {
  $scriptPath = Join-Path $GatewayWorkerRoot "start-low-gateways.sh"
  if (-not (Test-Path -LiteralPath $scriptPath)) { return }
  $text = Get-Content -Raw -LiteralPath $scriptPath
  if ($text -match "HERMES_GOOGLE_PROFILE_HOME") { return }
  $needle = 'HERMES_ACCEPT_HOOKS=1 API_SERVER_KEY="$api_key"'
  $replacement = 'HERMES_PROFILE="$profile" HERMES_GOOGLE_PROFILE_HOME="/home/hermes/.hermes/profiles/$profile" HERMES_ACCEPT_HOOKS=1 API_SERVER_KEY="$api_key"'
  if (-not $text.Contains($needle)) {
    Write-GatewayPoolLog "Low gateway profile env patch skipped; start script shape is unknown."
    return
  }
  $updated = $text.Replace($needle, $replacement)
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($scriptPath, $updated, $encoding)
  Write-GatewayPoolLog "Low gateway profile env patched for profile-local connector credentials."
}

function Start-LowGateways {
  $runAsWorker = Join-Path $GatewayWorkerRoot "run-as-worker.ps1"
  $child = Join-Path $GatewayWorkerRoot "start-low-gateways-child.ps1"
  if (-not (Test-Path -LiteralPath $runAsWorker)) { throw "Missing worker runner: $runAsWorker" }
  if (-not (Test-Path -LiteralPath $child)) { throw "Missing low gateway child script: $child" }
  Ensure-LowGatewayProfileEnv
  Write-GatewayPoolLog "Starting low gateway pool."
  $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runAsWorker -ChildScript $child 2>&1
  foreach ($line in $output) { Write-GatewayPoolLog ("lowgw: {0}" -f $line) }
  if ($LASTEXITCODE -ne 0) { throw "Low gateway pool start failed with exit code $LASTEXITCODE" }
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
  $workers = @($manifest.workers | Where-Object { $_.enabled -and $_.allowMaintenance -and $_.profile -and $_.port })
  if ($workers.Count -eq 0) {
    Write-GatewayPoolLog "No owner-maintenance workers in manifest."
    return @()
  }
  $apiKey = [string]($workers | Where-Object { $_.api_key } | Select-Object -First 1).api_key
  if (-not $apiKey) { throw "Owner-maintenance gateway API key missing from manifest." }

  $commands = @("mkdir -p /home/$OfficialUser/.hermes/logs")
  foreach ($worker in $workers) {
    $profile = [string]$worker.profile
    $commands += "mkdir -p /home/$OfficialUser/.hermes/profiles/$profile/logs"
    $commands += "setsid -f env HERMES_ACCEPT_HOOKS=1 /home/$OfficialUser/.local/bin/hermes -p $profile gateway run --replace > /home/$OfficialUser/.hermes/profiles/$profile/logs/start-gateway-pool.log 2>&1"
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
Start-OwnerMaintenanceGateways | Out-Null

$manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
$ports = @($manifest.workers | Where-Object { $_.enabled -and $_.port } | ForEach-Object { [int]$_.port })
Wait-HealthPorts -Ports $ports
Write-GatewayPoolLog "Gateway pool startup OK; healthy ports: $($ports -join ', ')."
