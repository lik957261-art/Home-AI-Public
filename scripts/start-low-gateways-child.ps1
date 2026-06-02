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

$passthroughEnvNames = @(
  "HERMES_MOBILE_FINANCE_MCP_API_BASE_URL",
  "HERMES_MOBILE_FINANCE_MCP_PATH",
  "HERMES_MOBILE_FINANCE_MCP_PYTHON",
  "HERMES_MOBILE_FINANCE_USER_DRIVE_ROOT",
  "HERMES_MOBILE_OWNER_FINANCE_WORKSPACE",
  "HERMES_MOBILE_WUPING_FINANCE_WORKSPACE"
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
