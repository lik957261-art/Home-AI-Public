param(
    [string]$TaskName = "Hermes Web Listener User Logon",
    [string]$TaskPath = "\",
    [ValidateSet("LogonTask", "StartupS4U", "LogonShortcut")]
    [string]$Mode = "LogonTask",
    [string]$UserId = "",
    [string]$HostAddress = "0.0.0.0",
    [int]$Port = 8797,
    [string]$HermesApiBase = "http://127.0.0.1:8642",
    [string]$NodeExe = "node",
    [switch]$NoAuth,
    [switch]$FallbackToStartupShortcut,
    [switch]$Unregister,
    [switch]$RunNow
)

$ErrorActionPreference = "Stop"

$scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$scriptRoot = (Resolve-Path -LiteralPath $scriptRoot).Path
$startScript = Join-Path $scriptRoot "start-hermes-web.ps1"
$hiddenLauncher = Join-Path $scriptRoot "start-hermes-web-hidden.vbs"

if (-not (Test-Path -LiteralPath $startScript)) {
    throw "Hermes Web start script not found: $startScript"
}
if (-not (Test-Path -LiteralPath $hiddenLauncher)) {
    throw "Hermes Web hidden launcher not found: $hiddenLauncher"
}

function Quote-TaskArg {
    param([string]$Value)
    if ($Value -notmatch '[\s"]') { return $Value }
    '"' + ($Value -replace '"', '\"') + '"'
}

function Quote-PowerShellArg {
    param([string]$Value)
    if ($Value -notmatch '[\s"]') { return $Value }
    '"' + ($Value -replace '"', '\"') + '"'
}

function Get-StartupShortcutPath {
    $startupDir = [Environment]::GetFolderPath("Startup")
    if (-not $startupDir) { throw "Cannot resolve current user's Startup folder." }
    Join-Path $startupDir "$TaskName.lnk"
}

function Remove-StartupShortcut {
    $startupShortcut = Get-StartupShortcutPath
    if (Test-Path -LiteralPath $startupShortcut) {
        Remove-Item -LiteralPath $startupShortcut -Force
        Write-Host "Removed Startup shortcut: $startupShortcut"
    }
}

function Get-CurrentUserId {
    if (-not [string]::IsNullOrWhiteSpace($UserId)) { return $UserId }
    [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
}

function Get-StartScriptArgs {
    $args = @(
        "-NoProfile",
        "-WindowStyle", "Hidden",
        "-ExecutionPolicy", "Bypass",
        "-File", $startScript,
        "-Detached"
    )
    if ($HostAddress -ne "0.0.0.0") { $args += @("-HostAddress", $HostAddress) }
    if ($Port -ne 8797) { $args += @("-Port", [string]$Port) }
    if ($HermesApiBase -ne "http://127.0.0.1:8642") { $args += @("-HermesApiBase", $HermesApiBase) }
    if ($NodeExe -ne "node") { $args += @("-NodeExe", $NodeExe) }
    if ($NoAuth) { $args += "-NoAuth" }
    ($args | ForEach-Object { Quote-PowerShellArg $_ }) -join " "
}

function New-HermesWebTaskSettings {
    $settings = New-ScheduledTaskSettingsSet `
        -MultipleInstances IgnoreNew `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable
    $settings.Hidden = $true
    return $settings
}

function Register-UserLogonTask {
    Import-Module ScheduledTasks -ErrorAction Stop

    $powershellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    $currentUser = Get-CurrentUserId
    $actionArgs = Get-StartScriptArgs
    $action = New-ScheduledTaskAction -Execute $powershellExe -Argument $actionArgs -WorkingDirectory $scriptRoot
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
    $principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited

    $task = New-ScheduledTask `
        -Action $action `
        -Trigger $trigger `
        -Principal $principal `
        -Settings (New-HermesWebTaskSettings) `
        -Description "Start Hermes Web listener when the current user logs on, without a visible console window."

    Register-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -InputObject $task -Force | Out-Null
    Remove-StartupShortcut
    Write-Host "Registered Scheduled Task: $TaskPath$TaskName"
    Write-Host "Trigger: AtLogOn"
    Write-Host "Principal: $currentUser / Interactive"
    Write-Host "Action: $powershellExe $actionArgs"
}

function Register-StartupS4UTask {
    Import-Module ScheduledTasks -ErrorAction Stop

    $powershellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    $actionArgs = Get-StartScriptArgs
    $action = New-ScheduledTaskAction -Execute $powershellExe -Argument $actionArgs -WorkingDirectory $scriptRoot
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId (Get-CurrentUserId) -LogonType S4U -RunLevel Limited

    $task = New-ScheduledTask `
        -Action $action `
        -Trigger $trigger `
        -Principal $principal `
        -Settings (New-HermesWebTaskSettings) `
        -Description "Start Hermes Web listener at Windows startup using S4U without requiring an interactive logon."

    Register-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -InputObject $task -Force | Out-Null
    Remove-StartupShortcut
    Write-Host "Registered Scheduled Task: $TaskPath$TaskName"
    Write-Host "Trigger: AtStartup"
    Write-Host "Principal: $((Get-CurrentUserId)) / S4U"
    Write-Host "Action: $powershellExe $actionArgs"
}

function Register-StartupShortcut {
    $startupShortcut = Get-StartupShortcutPath
    $startupDir = Split-Path -Parent $startupShortcut
    New-Item -ItemType Directory -Force -Path $startupDir | Out-Null

    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($startupShortcut)
    $shortcut.TargetPath = (Join-Path $env:SystemRoot "System32\wscript.exe")
    $shortcut.Arguments = '"' + $hiddenLauncher + '"'
    $shortcut.WorkingDirectory = $scriptRoot
    $shortcut.WindowStyle = 7
    $shortcut.Description = "Start Hermes Web listener without a visible console window."
    $shortcut.Save()
    Write-Host "Registered Startup shortcut: $startupShortcut"
    return $startupShortcut
}

function Unregister-HermesWebStartup {
    Import-Module ScheduledTasks -ErrorAction SilentlyContinue
    try {
        Unregister-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -Confirm:$false -ErrorAction Stop
        Write-Host "Removed Scheduled Task: $TaskPath$TaskName"
    } catch {
        Write-Host "Scheduled Task not removed or not present: $TaskPath$TaskName"
    }
    Remove-StartupShortcut
}

if ($Unregister) {
    Unregister-HermesWebStartup
    exit 0
}

if ($Mode -eq "LogonShortcut") {
    Register-StartupShortcut | Out-Null
    if ($RunNow) {
        Start-Process -FilePath (Join-Path $env:SystemRoot "System32\wscript.exe") -ArgumentList @($hiddenLauncher) -WindowStyle Hidden
    }
    exit 0
}

if ($Mode -eq "LogonTask") {
    Register-UserLogonTask
    if ($RunNow) {
        try {
            Start-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -ErrorAction Stop
            Write-Host "Started Scheduled Task: $TaskPath$TaskName"
        } catch {
            Write-Warning "Could not start Scheduled Task directly; starting detached process instead: $($_.Exception.Message)"
            & $startScript -Detached
        }
    }
    exit 0
}

try {
    Register-StartupS4UTask
} catch {
    if (-not $FallbackToStartupShortcut) {
        throw "Failed to register AtStartup/S4U task '$TaskPath$TaskName': $($_.Exception.Message)"
    }
    Write-Warning "AtStartup/S4U registration failed; falling back to current-user Startup shortcut: $($_.Exception.Message)"
    Register-StartupShortcut | Out-Null
}

if ($RunNow) {
    try {
        Start-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -ErrorAction Stop
        Write-Host "Started Scheduled Task: $TaskPath$TaskName"
    } catch {
        Write-Warning "Could not start Scheduled Task directly; starting detached process instead: $($_.Exception.Message)"
        & $startScript -Detached
    }
}
