param(
  [string]$DistroName = "",
  [string]$StartProfiles = "",
  [switch]$SkipConfigureIfReady,
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
if ($StopOnly) { $envArgs += "HERMES_GATEWAY_STOP_ONLY=1" }
if ($envArgs.Count -gt 0) {
  & wsl.exe -d $distroName -u root -- env @envArgs bash /mnt/c/ProgramData/HermesMobile/gateway-worker/start-low-gateways.sh
} else {
  & wsl.exe -d $distroName -u root -- bash /mnt/c/ProgramData/HermesMobile/gateway-worker/start-low-gateways.sh
}
if ($LASTEXITCODE -ne 0) {
  throw "Low gateway start failed with exit code $LASTEXITCODE"
}
