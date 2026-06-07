[CmdletBinding(PositionalBinding = $false)]
param(
  [string]$RuntimeRoot = "C:\ProgramData\HermesMobile\gateway-worker\native-runtime",
  [string]$NativeProfileRoot = "C:\ProgramData\HermesMobile\hermes-native-profile",
  [string]$HermesHome = "",
  [string]$PythonExe = "",
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$KanbanArgs = @()
)

$ErrorActionPreference = "Stop"

if (-not $HermesHome) { $HermesHome = Join-Path $NativeProfileRoot ".hermes" }
if (-not $PythonExe) { $PythonExe = Join-Path $RuntimeRoot "venv\Scripts\python.exe" }
$runtimeSource = Join-Path $RuntimeRoot "official-clean"

if (-not (Test-Path -LiteralPath $PythonExe)) {
  throw "Windows Hermes Python not found: $PythonExe"
}
if (-not (Test-Path -LiteralPath $runtimeSource)) {
  throw "Windows Hermes official source not found: $runtimeSource"
}
if (-not $KanbanArgs -or $KanbanArgs.Count -eq 0) {
  throw "Kanban arguments are required."
}

$env:USERPROFILE = $NativeProfileRoot
$env:HOME = $NativeProfileRoot
$env:HERMES_HOME = $HermesHome
$env:HERMES_REPO = $runtimeSource
$env:PYTHONPATH = $runtimeSource
$env:HERMES_ACCEPT_HOOKS = "1"

& $PythonExe -m hermes_cli.main @KanbanArgs
exit $LASTEXITCODE
