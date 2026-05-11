param(
  [Parameter(Mandatory = $true)]
  [string]$PayloadBase64
)

$ErrorActionPreference = "Stop"

$payloadJson = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($PayloadBase64))
$payload = $payloadJson | ConvertFrom-Json
$distroName = [string]$payload.distroName
$scriptPath = [string]$payload.scriptPath

if (-not $distroName) {
  throw "Missing distroName in Kanban worker payload."
}
if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "Kanban worker shell script not found: $scriptPath"
}

function Convert-ToWslPath {
  param([string]$WindowsPath)
  $full = [System.IO.Path]::GetFullPath($WindowsPath)
  if ($full -notmatch '^([A-Za-z]):\\(.*)$') {
    return $full.Replace('\', '/')
  }
  $drive = $Matches[1].ToLowerInvariant()
  $rest = $Matches[2].Replace('\', '/')
  return "/mnt/$drive/$rest"
}

$wslScriptPath = Convert-ToWslPath $scriptPath
& wsl.exe -d $distroName -u root -- bash $wslScriptPath $PayloadBase64
if ($LASTEXITCODE -ne 0) {
  throw "Kanban worker WSL command failed with exit code $LASTEXITCODE"
}
