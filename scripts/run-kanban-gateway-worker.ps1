[CmdletBinding(PositionalBinding = $false)]
param(
  [string]$WorkerDirectory = "C:\ProgramData\HermesMobile\gateway-worker",
  [string]$DistroName = "",
  [string]$Profile = "lowgw1",
  [string]$HermesHome = "/home/hermes/.hermes",
  [string]$WorkerUserName = "HermesMobileWorker",
  [switch]$RunInCallerContext,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$KanbanArgs = @()
)

$ErrorActionPreference = "Stop"

if (-not $KanbanArgs -or $KanbanArgs.Count -eq 0) {
  throw "Kanban arguments are required."
}

$runAsWorker = Join-Path $WorkerDirectory "run-as-worker.ps1"
$sourceChildScript = Join-Path $PSScriptRoot "run-kanban-gateway-worker-child.ps1"
$sourceShellScript = Join-Path $PSScriptRoot "run-kanban-gateway-worker.sh"
if (-not (Test-Path -LiteralPath $runAsWorker)) {
  throw "Worker runner not found: $runAsWorker"
}
if (-not (Test-Path -LiteralPath $sourceChildScript)) {
  throw "Kanban worker child script not found: $sourceChildScript"
}
if (-not (Test-Path -LiteralPath $sourceShellScript)) {
  throw "Kanban worker shell script not found: $sourceShellScript"
}

function Quote-PSLiteral {
  param([string]$Value)
  return "'" + ($Value -replace "'", "''") + "'"
}

function Test-TruthyValue {
  param([string]$Value)
  return ($Value -match '^(1|true|yes|on)$')
}

function Test-ListenerCallerContextMarker {
  $markerPath = $env:HERMES_MOBILE_LISTENER_RUN_IN_CALLER_CONTEXT_MARKER
  if (-not $markerPath) { $markerPath = $env:HERMES_WEB_LISTENER_RUN_IN_CALLER_CONTEXT_MARKER }
  if (-not $markerPath) { $markerPath = "C:\ProgramData\HermesMobile\listener-run-in-caller-context.flag" }
  return ($markerPath -and (Test-Path -LiteralPath $markerPath))
}

function Resolve-KanbanDistroName {
  if ($DistroName) { return $DistroName }
  if ($env:HERMES_MOBILE_KANBAN_WSL_DISTRO) { return $env:HERMES_MOBILE_KANBAN_WSL_DISTRO }
  if ($env:HERMES_WEB_KANBAN_WSL_DISTRO) { return $env:HERMES_WEB_KANBAN_WSL_DISTRO }
  if ($env:HERMES_WEB_WSL_DISTRO) { return $env:HERMES_WEB_WSL_DISTRO }
  return "Ubuntu-24.04"
}

function Test-KanbanRunInCallerContext {
  if ($RunInCallerContext) { return $true }
  if (Test-TruthyValue $env:HERMES_MOBILE_KANBAN_RUN_IN_CALLER_CONTEXT) { return $true }
  if (Test-TruthyValue $env:HERMES_WEB_KANBAN_RUN_IN_CALLER_CONTEXT) { return $true }
  if (Test-TruthyValue $env:HERMES_MOBILE_LISTENER_RUN_IN_CALLER_CONTEXT) { return $true }
  if (Test-TruthyValue $env:HERMES_WEB_LISTENER_RUN_IN_CALLER_CONTEXT) { return $true }
  return (Test-ListenerCallerContextMarker)
}

$stagingDir = Join-Path $WorkerDirectory "kanban-runner"
New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null
$stamp = "{0}-{1}" -f $PID, ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$childScript = Join-Path $stagingDir "run-kanban-gateway-worker-child-$stamp.ps1"
$shellScript = Join-Path $stagingDir "run-kanban-gateway-worker-$stamp.sh"
Copy-Item -LiteralPath $sourceChildScript -Destination $childScript -Force
Copy-Item -LiteralPath $sourceShellScript -Destination $shellScript -Force

$payload = @{
  distroName = Resolve-KanbanDistroName
  profile = $Profile
  hermesHome = $HermesHome
  scriptPath = $shellScript
  kanbanArgs = $KanbanArgs
} | ConvertTo-Json -Compress -Depth 8

$payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
$payloadBase64 = [Convert]::ToBase64String($payloadBytes)

$generatedChild = Join-Path $stagingDir "run-kanban-command-$stamp.ps1"
$generatedText = @"
`$ErrorActionPreference = "Stop"
`$childScript = $(Quote-PSLiteral $childScript)
`$payloadBase64 = $(Quote-PSLiteral $payloadBase64)
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File `$childScript -PayloadBase64 `$payloadBase64
exit `$LASTEXITCODE
"@
$encoding = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($generatedChild, $generatedText, $encoding)

function Current-UserName {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $name = [string]$identity.Name
  if ($name -match '\\([^\\]+)$') { return $Matches[1] }
  return $name
}

try {
  if ((Test-KanbanRunInCallerContext) -or (Current-UserName) -ieq $WorkerUserName) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $generatedChild
  } else {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runAsWorker -ChildScript $generatedChild
  }
  if ($LASTEXITCODE -ne 0) {
    throw "Kanban worker command failed with exit code $LASTEXITCODE"
  }
} finally {
  Remove-Item -LiteralPath $generatedChild -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $childScript -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $shellScript -Force -ErrorAction SilentlyContinue
}
