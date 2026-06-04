param(
  [string]$DistroName = "",
  [string]$StartProfiles = "",
  [switch]$SkipConfigureIfReady,
  [switch]$ForceConfigure,
  [switch]$StopOnly
)

$ErrorActionPreference = "Stop"

$distroName = $DistroName
if (-not $distroName) { $distroName = $env:HERMES_LOW_GATEWAY_DISTRO_NAME }
if (-not $distroName) { $distroName = $env:HERMES_WEB_WSL_DISTRO }
if (-not $distroName) { $distroName = "Ubuntu-24.04" }
$scriptPath = "C:\ProgramData\HermesMobile\gateway-worker\start-low-gateways.sh"

if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "Start script missing: $scriptPath"
}

$envArgs = @()
if ($StartProfiles) { $envArgs += "HERMES_GATEWAY_START_PROFILES=$StartProfiles" }
if ($SkipConfigureIfReady) { $envArgs += "HERMES_GATEWAY_SKIP_CONFIGURE_IF_READY=1" }
if ($ForceConfigure) { $envArgs += "HERMES_GATEWAY_FORCE_CONFIGURE=1" }
if ($StopOnly) { $envArgs += "HERMES_GATEWAY_STOP_ONLY=1" }

function Resolve-WslHostGatewayAddress {
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
  return $preferred[0].IPAddress
}

function Resolve-DefaultFinanceMcpApiBaseUrl {
  $configured = [Environment]::GetEnvironmentVariable("HERMES_MOBILE_FINANCE_MCP_API_BASE_URL", "Process")
  if ($configured) { return $configured }
  $port = [Environment]::GetEnvironmentVariable("FINANCE_MCP_PORT", "Process")
  if (-not $port) { $port = "8791" }
  $addresses = @()
  try {
    $addresses = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object {
        $_.IPAddress -and
        $_.IPAddress -ne "127.0.0.1" -and
        $_.IPAddress -notmatch "^169\.254\." -and
        ($_.AddressState -eq "Preferred" -or -not $_.AddressState)
      } |
      Select-Object -ExpandProperty IPAddress)
  } catch {
    $addresses = @()
  }
  $preferred = @($addresses | Where-Object { $_ -match "^192\.168\.10\." } | Select-Object -First 1)
  if ($preferred.Count -eq 0) {
    $preferred = @($addresses | Where-Object { $_ -match "^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)" } | Select-Object -First 1)
  }
  if ($preferred.Count -eq 0) { return "" }
  return "http://$($preferred[0]):$port"
}

function Resolve-DefaultNoteMcpApiBaseUrl {
  $configured = [Environment]::GetEnvironmentVariable("HERMES_MOBILE_NOTE_MCP_API_BASE_URL", "Process")
  if ($configured) { return $configured }
  $port = [Environment]::GetEnvironmentVariable("NOTE_MCP_PORT", "Process")
  if (-not $port) { $port = "4181" }
  $wslHost = Resolve-WslHostGatewayAddress
  if ($wslHost) { return "http://${wslHost}:$port" }
  $addresses = @()
  try {
    $addresses = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object {
        $_.IPAddress -and
        $_.IPAddress -ne "127.0.0.1" -and
        $_.IPAddress -notmatch "^169\.254\." -and
        ($_.AddressState -eq "Preferred" -or -not $_.AddressState)
      } |
      Select-Object -ExpandProperty IPAddress)
  } catch {
    $addresses = @()
  }
  $preferred = @($addresses | Where-Object { $_ -match "^192\.168\.10\." } | Select-Object -First 1)
  if ($preferred.Count -eq 0) {
    $preferred = @($addresses | Where-Object { $_ -match "^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)" } | Select-Object -First 1)
  }
  if ($preferred.Count -eq 0) { return "" }
  return "http://$($preferred[0]):$port"
}

function Resolve-DefaultEmailMcpApiBaseUrl {
  $configured = [Environment]::GetEnvironmentVariable("HERMES_MOBILE_EMAIL_MCP_API_BASE_URL", "Process")
  if ($configured) { return $configured }
  $port = [Environment]::GetEnvironmentVariable("EMAIL_SERVICE_PORT", "Process")
  if (-not $port) { $port = "5175" }
  $wslHost = Resolve-WslHostGatewayAddress
  if ($wslHost) { return "http://${wslHost}:$port" }
  $addresses = @()
  try {
    $addresses = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object {
        $_.IPAddress -and
        $_.IPAddress -ne "127.0.0.1" -and
        $_.IPAddress -notmatch "^169\.254\." -and
        ($_.AddressState -eq "Preferred" -or -not $_.AddressState)
      } |
      Select-Object -ExpandProperty IPAddress)
  } catch {
    $addresses = @()
  }
  $preferred = @($addresses | Where-Object { $_ -match "^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)" } | Select-Object -First 1)
  if ($preferred.Count -eq 0) { return "" }
  return "http://$($preferred[0]):$port"
}

if (-not [Environment]::GetEnvironmentVariable("HERMES_MOBILE_FINANCE_MCP_API_BASE_URL", "Process")) {
  $financeApiBase = Resolve-DefaultFinanceMcpApiBaseUrl
  if ($financeApiBase) {
    [Environment]::SetEnvironmentVariable("HERMES_MOBILE_FINANCE_MCP_API_BASE_URL", $financeApiBase, "Process")
  }
}

if (-not [Environment]::GetEnvironmentVariable("HERMES_MOBILE_NOTE_MCP_API_BASE_URL", "Process")) {
  $noteApiBase = Resolve-DefaultNoteMcpApiBaseUrl
  if ($noteApiBase) {
    [Environment]::SetEnvironmentVariable("HERMES_MOBILE_NOTE_MCP_API_BASE_URL", $noteApiBase, "Process")
  }
}

if (-not [Environment]::GetEnvironmentVariable("HERMES_MOBILE_EMAIL_MCP_API_BASE_URL", "Process")) {
  $emailApiBase = Resolve-DefaultEmailMcpApiBaseUrl
  if ($emailApiBase) {
    [Environment]::SetEnvironmentVariable("HERMES_MOBILE_EMAIL_MCP_API_BASE_URL", $emailApiBase, "Process")
  }
}

$passthroughEnvNames = @(
  "HERMES_MOBILE_FINANCE_MCP_API_BASE_URL",
  "HERMES_MOBILE_FINANCE_MCP_PATH",
  "HERMES_MOBILE_FINANCE_MCP_PYTHON",
  "HERMES_MOBILE_FINANCE_USER_DRIVE_ROOT",
  "HERMES_MOBILE_OWNER_FINANCE_WORKSPACE",
  "HERMES_MOBILE_WUPING_FINANCE_WORKSPACE",
  "HERMES_MOBILE_NOTE_MCP_API_BASE_URL",
  "HERMES_MOBILE_NOTE_MCP_PATH",
  "HERMES_MOBILE_NOTE_MCP_PYTHON",
  "HERMES_MOBILE_NOTE_USER_DRIVE_ROOT",
  "HERMES_MOBILE_OWNER_NOTE_WORKSPACE",
  "HERMES_MOBILE_WUPING_NOTE_WORKSPACE",
  "HERMES_MOBILE_EMAIL_MCP_API_BASE_URL",
  "HERMES_MOBILE_EMAIL_MCP_PATH",
  "HERMES_MOBILE_EMAIL_MCP_PYTHON",
  "HERMES_MOBILE_EMAIL_USER_DRIVE_ROOT",
  "HERMES_MOBILE_OWNER_EMAIL_WORKSPACE",
  "HERMES_MOBILE_WUPING_EMAIL_WORKSPACE"
)
foreach ($name in $passthroughEnvNames) {
  $value = [Environment]::GetEnvironmentVariable($name, "Process")
  if ($null -ne $value -and $value -ne "") {
    $envArgs += "$name=$value"
  }
}

if ($envArgs.Count -gt 0) {
  & wsl.exe -d $distroName -u root -- env @envArgs bash /mnt/c/ProgramData/HermesMobile/gateway-worker/start-low-gateways.sh
} else {
  & wsl.exe -d $distroName -u root -- bash /mnt/c/ProgramData/HermesMobile/gateway-worker/start-low-gateways.sh
}
if ($LASTEXITCODE -ne 0) {
  throw "Low gateway start failed with exit code $LASTEXITCODE"
}
