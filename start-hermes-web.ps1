param(
    [string]$HostAddress = "0.0.0.0",
    [int]$Port = 8797,
    [string]$HermesApiBase = "http://127.0.0.1:8642",
    [string]$HermesApiKey = "",
    [string]$NodeExe = "node",
    [switch]$CheckOnly,
    [switch]$NoAuth,
    [switch]$Detached,
    [string]$StartupTaskName = "Hermes Mobile Listener User Logon",
    [string]$StartupTaskPath = "\",
    [switch]$ForceLocalStart
)

$ErrorActionPreference = "Stop"

$scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$scriptRoot = (Resolve-Path -LiteralPath $scriptRoot).Path
$repoRoot = $scriptRoot
$serverPath = Join-Path $scriptRoot "server.js"
$appPath = Join-Path $scriptRoot "public\app.js"
$dataDir = if ($env:HERMES_WEB_DATA_DIR) { $env:HERMES_WEB_DATA_DIR } else { Join-Path $repoRoot "workspace\hermes-web" }
$logDir = Join-Path $dataDir "logs"

if (-not (Test-Path -LiteralPath $serverPath)) {
    throw "Hermes Mobile server not found: $serverPath"
}

$nodeCommand = Get-Command $NodeExe -ErrorAction Stop

function Get-HermesWebListener {
    param([int]$ListenPort)
    try {
        Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction Stop |
            Select-Object -First 1
    } catch {
        $null
    }
}

function Test-CurrentUserIsLocalSystem {
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    return $identity.User -and $identity.User.Value -eq "S-1-5-18"
}

function Test-HermesWebProcess {
    param(
        [int]$ProcessId,
        [string]$ExpectedServerPath
    )
    try {
        $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction Stop
        $commandLine = [string]$processInfo.CommandLine
        if (-not $commandLine) { return $false }
        $normalizedCommand = $commandLine.Replace("\", "/").ToLowerInvariant()
        $normalizedServer = [System.IO.Path]::GetFullPath($ExpectedServerPath).Replace("\", "/").ToLowerInvariant()
        return $normalizedCommand.Contains($normalizedServer)
    } catch {
        return $false
    }
}

function Start-HermesWebRegisteredTask {
    if ($ForceLocalStart -or -not (Test-CurrentUserIsLocalSystem)) { return $false }

    try {
        Import-Module ScheduledTasks -ErrorAction Stop
        $task = Get-ScheduledTask -TaskName $StartupTaskName -TaskPath $StartupTaskPath -ErrorAction Stop
        $principal = $task.Principal
        $principalUser = [string]$principal.UserId
        if (-not $principalUser -or $principalUser -match '^(SYSTEM|NT AUTHORITY\\SYSTEM|S-1-5-18)$') {
            return $false
        }
        Start-ScheduledTask -TaskName $StartupTaskName -TaskPath $StartupTaskPath -ErrorAction Stop
        Write-Host "Started Hermes Mobile via registered user task: $StartupTaskPath$StartupTaskName ($principalUser)"
    } catch {
        Write-Warning "Could not start registered Hermes Mobile task '$StartupTaskPath$StartupTaskName': $($_.Exception.Message)"
        return $false
    }

    $deadline = (Get-Date).AddSeconds(12)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 300
        $listener = Get-HermesWebListener -ListenPort $Port
        if (-not $listener) { continue }
        if (Test-HermesWebProcess -ProcessId $listener.OwningProcess -ExpectedServerPath $serverPath) {
            Write-Host "Hermes Mobile listener OK; PID $($listener.OwningProcess)"
            return $true
        }
    }
    throw "Registered user task '$StartupTaskPath$StartupTaskName' did not open Hermes Mobile port $Port."
}

$env:HERMES_WEB_HOST = $HostAddress
$env:HERMES_WEB_PORT = [string]$Port
$env:HERMES_WEB_HERMES_API_BASE = $HermesApiBase
if (-not [string]::IsNullOrWhiteSpace($HermesApiKey)) {
    $env:HERMES_WEB_HERMES_API_KEY = $HermesApiKey
}
if ($NoAuth) {
    $env:HERMES_WEB_DISABLE_AUTH = "1"
}

if ($CheckOnly) {
    & $nodeCommand.Source --check $serverPath
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $nodeCommand.Source --check $appPath
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Host "Hermes Mobile startup check OK"
    Write-Host "Repo root: $repoRoot"
    Write-Host "Server: $serverPath"
    Write-Host "Node: $($nodeCommand.Source)"
    Write-Host "Bind: $HostAddress`:$Port"
    Write-Host "Hermes API: $HermesApiBase"
    return
}

if ($Detached) {
    if (Start-HermesWebRegisteredTask) { return }

    $existing = Get-HermesWebListener -ListenPort $Port
    if ($existing) {
        Write-Host "Hermes Mobile already listening on port $Port; PID $($existing.OwningProcess)"
        return
    }

    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $stdoutLog = Join-Path $logDir "hermes-web.out.log"
    $stderrLog = Join-Path $logDir "hermes-web.err.log"

    Write-Host "Starting Hermes Mobile detached on http://$HostAddress`:$Port"
    $process = Start-Process `
        -FilePath $nodeCommand.Source `
        -ArgumentList @($serverPath) `
        -WorkingDirectory $scriptRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog `
        -PassThru

    Start-Sleep -Milliseconds 1200
    $listener = Get-HermesWebListener -ListenPort $Port
    if (-not $listener) {
        if ($process.HasExited) {
            throw "Hermes Mobile detached start failed; PID $($process.Id) exited with code $($process.ExitCode). See $stderrLog"
        }
        throw "Hermes Mobile detached start did not open port $Port yet; PID $($process.Id). See $stdoutLog and $stderrLog"
    }
    Write-Host "Hermes Mobile detached listener OK; PID $($listener.OwningProcess)"
    Write-Host "Logs: $stdoutLog ; $stderrLog"
    return
}

Write-Host "Starting Hermes Mobile on http://$HostAddress`:$Port"
Write-Host "Hermes API: $HermesApiBase"
Push-Location -LiteralPath $scriptRoot
try {
    & $nodeCommand.Source $serverPath
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
