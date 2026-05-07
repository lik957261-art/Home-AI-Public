param(
    [string]$HostAddress = "0.0.0.0",
    [int]$Port = 8797,
    [string]$HermesApiBase = "http://127.0.0.1:8642",
    [string]$HermesApiKey = "",
    [string]$NodeExe = "node",
    [int]$StopTimeoutSeconds = 12,
    [switch]$StartOnly,
    [switch]$StopOnly,
    [switch]$NoAuth,
    [string]$StartupTaskName = "Hermes Web Listener User Logon",
    [string]$StartupTaskPath = "\",
    [switch]$ForceLocalStart
)

$ErrorActionPreference = "Stop"

$scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$scriptRoot = (Resolve-Path -LiteralPath $scriptRoot).Path
$serverPath = (Resolve-Path -LiteralPath (Join-Path $scriptRoot "server.js")).Path
$startScript = Join-Path $scriptRoot "start-hermes-web.ps1"

if (-not (Test-Path -LiteralPath $startScript)) {
    throw "Hermes Web start script not found: $startScript"
}

function Normalize-PathText {
    param([string]$Value)
    [System.IO.Path]::GetFullPath($Value).Replace("\", "/").ToLowerInvariant()
}

function Get-HermesWebListener {
    try {
        Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
    } catch {
        $null
    }
}

function Get-ListenerProcessInfo {
    param([int]$ProcessId)
    Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction Stop
}

function Test-HermesWebProcess {
    param($ProcessInfo)
    $commandLine = [string]$ProcessInfo.CommandLine
    if (-not $commandLine) { return $false }
    $normalizedCommand = $commandLine.Replace("\", "/").ToLowerInvariant()
    $normalizedServer = Normalize-PathText $serverPath
    return $normalizedCommand.Contains($normalizedServer)
}

function Test-CurrentUserIsLocalSystem {
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    return $identity.User -and $identity.User.Value -eq "S-1-5-18"
}

function Start-HermesWebRegisteredTask {
    if ($ForceLocalStart -or -not (Test-CurrentUserIsLocalSystem)) { return $false }

    Import-Module ScheduledTasks -ErrorAction Stop
    $task = Get-ScheduledTask -TaskName $StartupTaskName -TaskPath $StartupTaskPath -ErrorAction Stop
    $principal = $task.Principal
    $principalUser = [string]$principal.UserId
    if (-not $principalUser -or $principalUser -match '^(SYSTEM|NT AUTHORITY\\SYSTEM|S-1-5-18)$') {
        return $false
    }

    Start-ScheduledTask -TaskName $StartupTaskName -TaskPath $StartupTaskPath -ErrorAction Stop
    Write-Host "Started Hermes Web via registered user task: $StartupTaskPath$StartupTaskName ($principalUser)"

    $deadline = (Get-Date).AddSeconds($StopTimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 300
        $listener = Get-HermesWebListener
        if (-not $listener) { continue }
        $processInfo = Get-ListenerProcessInfo -ProcessId $listener.OwningProcess
        if (Test-HermesWebProcess -ProcessInfo $processInfo) {
            Write-Host "Hermes Web listening on $($listener.LocalAddress):$($listener.LocalPort), PID $($listener.OwningProcess)"
            return $true
        }
    }
    throw "Registered user task '$StartupTaskPath$StartupTaskName' did not open Hermes Web port $Port."
}

function Stop-HermesWebListener {
    $listener = Get-HermesWebListener
    if (-not $listener) {
        Write-Host "Hermes Web is not listening on port $Port."
        return
    }

    $processInfo = Get-ListenerProcessInfo -ProcessId $listener.OwningProcess
    if (-not (Test-HermesWebProcess -ProcessInfo $processInfo)) {
        throw "Port $Port is owned by PID $($listener.OwningProcess), but it does not look like Hermes Web: $($processInfo.CommandLine)"
    }

    Write-Host "Stopping Hermes Web listener PID $($listener.OwningProcess) on port $Port"
    Stop-Process -Id $listener.OwningProcess -Force -ErrorAction Stop

    $deadline = (Get-Date).AddSeconds($StopTimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 300
        if (-not (Get-HermesWebListener)) {
            Write-Host "Hermes Web listener stopped."
            return
        }
    }
    throw "Timed out waiting for Hermes Web listener on port $Port to stop."
}

function Start-HermesWebDetached {
    if (Start-HermesWebRegisteredTask) { return }

    $startParams = @{
        HostAddress = $HostAddress
        Port = $Port
        HermesApiBase = $HermesApiBase
        NodeExe = $NodeExe
        Detached = $true
    }
    if (-not [string]::IsNullOrWhiteSpace($HermesApiKey)) { $startParams.HermesApiKey = $HermesApiKey }
    if ($NoAuth) { $startParams.NoAuth = $true }
    & $startScript @startParams
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not $StartOnly) {
    Stop-HermesWebListener
}

if (-not $StopOnly) {
    Start-HermesWebDetached
    $listener = Get-HermesWebListener
    if (-not $listener) { throw "Hermes Web did not open port $Port after restart." }
    Write-Host "Hermes Web listening on $($listener.LocalAddress):$($listener.LocalPort), PID $($listener.OwningProcess)"
}
