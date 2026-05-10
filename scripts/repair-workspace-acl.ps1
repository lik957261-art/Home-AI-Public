param(
  [Parameter(Mandatory = $true)]
  [string]$WorkspaceRoot,
  [string]$WorkerAccount = "$env:COMPUTERNAME\HermesMobileWorker",
  [switch]$Recurse,
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $WorkspaceRoot)) {
  throw "Workspace root not found: $WorkspaceRoot"
}

$root = (Resolve-Path -LiteralPath $WorkspaceRoot).Path
$items = @()
$items += Get-Item -LiteralPath $root -Force
if ($Recurse) {
  $items += Get-ChildItem -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}

function Test-HasWorkerRead {
  param([System.IO.FileSystemInfo]$Item)
  $acl = Get-Acl -LiteralPath $Item.FullName
  foreach ($entry in $acl.Access) {
    if ([string]$entry.IdentityReference -ne $WorkerAccount) { continue }
    if ($entry.AccessControlType -ne "Allow") { continue }
    $rights = [string]$entry.FileSystemRights
    if ($rights -match "FullControl|Modify|Read|ReadAndExecute|ListDirectory") { return $true }
  }
  return $false
}

$missing = @()
foreach ($item in $items) {
  if (-not (Test-HasWorkerRead -Item $item)) {
    $missing += $item.FullName
  }
}

if ($CheckOnly) {
  [pscustomobject]@{
    workspaceRoot = $root
    workerAccount = $WorkerAccount
    checked = $items.Count
    missingWorkerRead = $missing.Count
    samples = @($missing | Select-Object -First 20)
  } | ConvertTo-Json -Depth 4
  exit 0
}

$grant = "${WorkerAccount}:(OI)(CI)M"
icacls $root /inheritance:e | Out-Null
icacls $root /grant $grant | Out-Null
if ($Recurse) {
  icacls $root /grant $grant /T /C | Out-Null
}

[pscustomobject]@{
  workspaceRoot = $root
  workerAccount = $WorkerAccount
  repaired = $true
  recursive = [bool]$Recurse
  previouslyMissingWorkerRead = $missing.Count
  samples = @($missing | Select-Object -First 20)
} | ConvertTo-Json -Depth 4
