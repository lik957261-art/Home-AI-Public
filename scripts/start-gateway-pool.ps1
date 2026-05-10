param(
  [string]$GatewayWorkerRoot = "C:\ProgramData\HermesMobile\gateway-worker",
  [string]$ManifestPath = "C:\ProgramData\HermesMobile\data\gateway-pool-manifest.json",
  [string]$OfficialDistro = "Ubuntu-24.04",
  [string]$OfficialUser = "xuxin",
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

function Start-LowGateways {
  $runAsWorker = Join-Path $GatewayWorkerRoot "run-as-worker.ps1"
  $child = Join-Path $GatewayWorkerRoot "start-low-gateways-child.ps1"
  if (-not (Test-Path -LiteralPath $runAsWorker)) { throw "Missing worker runner: $runAsWorker" }
  if (-not (Test-Path -LiteralPath $child)) { throw "Missing low gateway child script: $child" }
  Write-GatewayPoolLog "Starting low gateway pool."
  $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runAsWorker -ChildScript $child 2>&1
  foreach ($line in $output) { Write-GatewayPoolLog ("lowgw: {0}" -f $line) }
  if ($LASTEXITCODE -ne 0) { throw "Low gateway pool start failed with exit code $LASTEXITCODE" }
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
Start-LowGateways
Start-OwnerMaintenanceGateways | Out-Null

$manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
$ports = @($manifest.workers | Where-Object { $_.enabled -and $_.port } | ForEach-Object { [int]$_.port })
Wait-HealthPorts -Ports $ports
Write-GatewayPoolLog "Gateway pool startup OK; healthy ports: $($ports -join ', ')."
