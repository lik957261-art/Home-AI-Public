$ErrorActionPreference = "Stop"

$distroName = "HermesGatewayWorker"
$scriptPath = "C:\ProgramData\HermesMobile\gateway-worker\start-low-gateways.sh"

if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "Start script missing: $scriptPath"
}

& wsl.exe -d $distroName -u root -- bash /mnt/c/ProgramData/HermesMobile/gateway-worker/start-low-gateways.sh
if ($LASTEXITCODE -ne 0) {
  throw "Low gateway start failed with exit code $LASTEXITCODE"
}
