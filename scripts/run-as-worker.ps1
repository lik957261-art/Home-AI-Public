param(
  [Parameter(Mandatory = $true)]
  [string]$ChildScript,
  [string[]]$ChildArgs = @(),
  [string]$CredentialPath = "C:\ProgramData\HermesMobile\worker-credential.xml",
  [string]$UserName = "HermesMobileWorker",
  [string]$Domain = $env:COMPUTERNAME,
  [string]$WorkingDirectory = "C:\ProgramData\HermesMobile\gateway-worker"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $CredentialPath)) {
  throw "Worker credential file not found: $CredentialPath"
}
if (-not (Test-Path -LiteralPath $ChildScript)) {
  throw "Child script not found: $ChildScript"
}
if (-not (Test-Path -LiteralPath $WorkingDirectory)) {
  throw "Working directory not found: $WorkingDirectory"
}

$logDir = Join-Path $WorkingDirectory "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$baseName = [System.IO.Path]::GetFileNameWithoutExtension($ChildScript)
$stdout = Join-Path $logDir "$baseName.out.log"
$stderr = Join-Path $logDir "$baseName.err.log"
Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue

function Quote-Arg {
  param([string]$Value)
  if ($null -eq $Value) { return '""' }
  if ($Value -notmatch '[\s"]') { return $Value }
  return '"' + ($Value -replace '"', '\"') + '"'
}

$credential = Import-Clixml -LiteralPath $CredentialPath
$args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $ChildScript) + $ChildArgs
$psi = [System.Diagnostics.ProcessStartInfo]::new()
$psi.FileName = "powershell.exe"
$psi.Arguments = ($args | ForEach-Object { Quote-Arg $_ }) -join " "
$psi.WorkingDirectory = $WorkingDirectory
$psi.UserName = $UserName
$psi.Domain = $Domain
$psi.Password = $credential.Password
$psi.UseShellExecute = $false
$psi.LoadUserProfile = $true
$psi.CreateNoWindow = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true

$process = [System.Diagnostics.Process]::Start($psi)
$outText = $process.StandardOutput.ReadToEnd()
$errText = $process.StandardError.ReadToEnd()
$process.WaitForExit()
$encoding = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($stdout, $outText, $encoding)
[System.IO.File]::WriteAllText($stderr, $errText, $encoding)

Write-Host ("worker_child={0}" -f $ChildScript)
Write-Host ("worker_exit={0}" -f $process.ExitCode)
if (Test-Path -LiteralPath $stdout) { Get-Content -LiteralPath $stdout }
if (Test-Path -LiteralPath $stderr) { Get-Content -LiteralPath $stderr }
if ($process.ExitCode -ne 0) {
  throw "Worker child failed with exit code $($process.ExitCode)"
}
