param(
    [string]$SidecarScript = "",
    [string]$DistroName = "",
    [string]$WslUser = "",
    [string]$HermesHome = "",
    [string]$RuntimeRoot = "/opt/hermes-gateway-runtime",
    [string]$DispatcherScript = "",
    [int]$IntervalSeconds = 60,
    [int]$TickTimeoutSeconds = 0,
    [string]$LogPath = "",
    [switch]$CheckOnly,
    [switch]$ReplaceExisting
)

$ErrorActionPreference = "Stop"

if (-not $SidecarScript) { $SidecarScript = Join-Path $PSScriptRoot "run-cron-tick-sidecar.ps1" }
$SidecarScript = [System.IO.Path]::GetFullPath($SidecarScript)
if (-not (Test-Path -LiteralPath $SidecarScript)) {
    throw "Cron tick sidecar script not found: $SidecarScript"
}
if (-not $DistroName) { $DistroName = $env:HERMES_WEB_WSL_DISTRO }
if (-not $DistroName) { $DistroName = "Ubuntu-24.04" }
if (-not $WslUser) { $WslUser = $env:HERMES_WEB_WSL_USER }
if (-not $WslUser) { $WslUser = "xuxin" }
if (-not $HermesHome) { $HermesHome = $env:HERMES_WEB_HERMES_HOME }
if (-not $HermesHome) { $HermesHome = "/home/$WslUser/.hermes" }
if (-not $DispatcherScript) { $DispatcherScript = Join-Path $PSScriptRoot "hermes-mobile-cron-dispatcher.py" }
$DispatcherScript = [System.IO.Path]::GetFullPath($DispatcherScript)
if (-not (Test-Path -LiteralPath $DispatcherScript)) {
    throw "Cron dispatcher script not found: $DispatcherScript"
}
if (-not $LogPath) { $LogPath = $env:HERMES_MOBILE_CRON_TICK_LOG_PATH }
if (-not $LogPath) {
    $dataRoot = $env:HERMES_WEB_DATA_DIR
    if (-not $dataRoot) { $dataRoot = "C:\ProgramData\HermesMobile\data" }
    $LogPath = Join-Path (Join-Path $dataRoot "logs") "cron-tick-sidecar.log"
}
if ($IntervalSeconds -lt 10) { $IntervalSeconds = 10 }
if ($TickTimeoutSeconds -le 0 -and $env:HERMES_MOBILE_CRON_TICK_TIMEOUT_SECONDS) {
    $parsedTickTimeout = 0
    if ([int]::TryParse($env:HERMES_MOBILE_CRON_TICK_TIMEOUT_SECONDS, [ref]$parsedTickTimeout)) {
        $TickTimeoutSeconds = $parsedTickTimeout
    }
}
if ($TickTimeoutSeconds -le 0) { $TickTimeoutSeconds = 180 }
if ($TickTimeoutSeconds -lt 30) { $TickTimeoutSeconds = 30 }

function Get-CronTickSidecarProcess {
    $normalizedScript = $SidecarScript.Replace("/", "\").ToLowerInvariant()
    $scriptName = (Split-Path -Leaf $SidecarScript).ToLowerInvariant()
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $commandLine = [string]$_.CommandLine
            $normalizedCommand = $commandLine.Replace("/", "\").ToLowerInvariant()
            $_.ProcessId -ne $PID -and
            $commandLine -and
            $normalizedCommand.Contains($scriptName) -and
            $normalizedCommand.Contains($normalizedScript)
        }
}

function Invoke-CronStatusCheck {
    $pythonPath = "$RuntimeRoot/official-clean"
    $pythonExe = "$RuntimeRoot/venv/bin/python"
    $wslArgs = @(
        "-d", $DistroName,
        "-u", $WslUser,
        "--",
        "env",
        "HERMES_HOME=$HermesHome",
        "PYTHONPATH=$pythonPath",
        $pythonExe,
        "-m", "hermes_cli.main",
        "cron", "status"
    )
    $output = & wsl.exe @wslArgs 2>&1 | ForEach-Object { $_.ToString() }
    $exitCode = $LASTEXITCODE
    $output | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    if ($exitCode -ne 0) {
        throw "Cron status check failed with exit code $exitCode"
    }
}

if ($CheckOnly) {
    Invoke-CronStatusCheck
    Write-Host "Cron tick sidecar check OK"
    Write-Host "Script: $SidecarScript"
    Write-Host "Distro: $DistroName"
    Write-Host "Hermes home: $HermesHome"
    Write-Host "Dispatcher: $DispatcherScript"
    Write-Host "Log: $LogPath"
    Write-Host "Tick timeout seconds: $TickTimeoutSeconds"
    return
}

$existing = @(Get-CronTickSidecarProcess)
if ($existing.Count -gt 0) {
    if ($ReplaceExisting) {
        foreach ($process in $existing) {
            Write-Host "Stopping existing cron tick sidecar; PID $($process.ProcessId)."
            Stop-Process -Id $process.ProcessId -Force
        }
        Start-Sleep -Seconds 1
    } else {
        Write-Host "Cron tick sidecar already running; PID $($existing[0].ProcessId)."
        return
    }
}

$argumentList = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", ('"{0}"' -f $SidecarScript),
    "-DistroName", ('"{0}"' -f $DistroName),
    "-WslUser", ('"{0}"' -f $WslUser),
    "-HermesHome", ('"{0}"' -f $HermesHome),
    "-RuntimeRoot", ('"{0}"' -f $RuntimeRoot),
    "-DispatcherScript", ('"{0}"' -f $DispatcherScript),
    "-IntervalSeconds", [string]$IntervalSeconds,
    "-TickTimeoutSeconds", [string]$TickTimeoutSeconds,
    "-LogPath", ('"{0}"' -f $LogPath)
)
$process = Start-Process -FilePath "powershell.exe" -ArgumentList $argumentList -WindowStyle Hidden -PassThru
Write-Host "Started cron tick sidecar; PID $($process.Id)."
Write-Host "Log: $LogPath"
