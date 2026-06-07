param(
    [string]$SidecarScript = "",
    [string]$HermesHome = "",
    [string]$RuntimeRoot = "C:\ProgramData\HermesMobile\gateway-worker\native-runtime",
    [string]$DispatcherScript = "",
    [int]$IntervalSeconds = 60,
    [int]$DispatchTimeoutSeconds = 0,
    [string]$LogPath = "",
    [string]$NativeProfileRoot = "C:\ProgramData\HermesMobile\hermes-native-profile",
    [string]$PythonExe = "",
    [switch]$CheckOnly,
    [switch]$ReplaceExisting
)

$ErrorActionPreference = "Stop"

if (-not $SidecarScript) { $SidecarScript = Join-Path $PSScriptRoot "run-cron-tick-sidecar.ps1" }
$SidecarScript = [System.IO.Path]::GetFullPath($SidecarScript)
if (-not $HermesHome) { $HermesHome = $env:HERMES_MOBILE_CRON_TICK_HERMES_HOME }
if (-not $HermesHome) { $HermesHome = $env:HERMES_WEB_HERMES_HOME }
if (-not $HermesHome -or $HermesHome -match '^/home/') { $HermesHome = Join-Path $NativeProfileRoot ".hermes" }
if (-not $PythonExe) { $PythonExe = Join-Path $RuntimeRoot "venv\Scripts\python.exe" }
if (-not $DispatcherScript) { $DispatcherScript = Join-Path $PSScriptRoot "hermes-mobile-cron-dispatcher.py" }
$DispatcherScript = [System.IO.Path]::GetFullPath($DispatcherScript)
if (-not $LogPath) { $LogPath = $env:HERMES_MOBILE_CRON_TICK_LOG_PATH }
if (-not $LogPath) {
    $dataRoot = $env:HERMES_WEB_DATA_DIR
    if (-not $dataRoot) { $dataRoot = "C:\ProgramData\HermesMobile\data" }
    $LogPath = Join-Path (Join-Path $dataRoot "logs") "cron-tick-sidecar.log"
}
if ($IntervalSeconds -lt 10) { $IntervalSeconds = 10 }
if ($DispatchTimeoutSeconds -le 0 -and $env:HERMES_MOBILE_CRON_DISPATCH_TIMEOUT_SECONDS) {
    $parsedDispatchTimeout = 0
    if ([int]::TryParse($env:HERMES_MOBILE_CRON_DISPATCH_TIMEOUT_SECONDS, [ref]$parsedDispatchTimeout)) {
        $DispatchTimeoutSeconds = $parsedDispatchTimeout
    }
}
if ($DispatchTimeoutSeconds -le 0) { $DispatchTimeoutSeconds = 60 }
if ($DispatchTimeoutSeconds -lt 15) { $DispatchTimeoutSeconds = 15 }

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

function Set-NativeCronEnvironment {
    $runtimeSource = Join-Path $RuntimeRoot "official-clean"
    $env:USERPROFILE = $NativeProfileRoot
    $env:HOME = $NativeProfileRoot
    $env:HERMES_HOME = $HermesHome
    $env:HERMES_REPO = $runtimeSource
    $env:PYTHONPATH = $runtimeSource
    $env:HERMES_ACCEPT_HOOKS = "1"
    $env:HERMES_MOBILE_CRON_TICK_SIDE = "windows-native"
}

function Invoke-CronStatusCheck {
    if (-not (Test-Path -LiteralPath $PythonExe)) { throw "Windows Hermes Python not found: $PythonExe" }
    if (-not (Test-Path -LiteralPath (Join-Path $RuntimeRoot "official-clean"))) { throw "Windows Hermes official source not found: $RuntimeRoot" }
    Set-NativeCronEnvironment
    $output = & $PythonExe -m hermes_cli.main cron status 2>&1 | ForEach-Object { $_.ToString() }
    $exitCode = $LASTEXITCODE
    $output | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    if ($exitCode -ne 0) { throw "Cron status check failed with exit code $exitCode" }
}

if (-not (Test-Path -LiteralPath $SidecarScript)) {
    throw "Cron tick sidecar script not found: $SidecarScript"
}
if (-not (Test-Path -LiteralPath $DispatcherScript)) {
    throw "Cron dispatcher script not found: $DispatcherScript"
}

if ($CheckOnly) {
    Invoke-CronStatusCheck
    Write-Host "Cron tick sidecar Windows native check OK"
    Write-Host "Script: $SidecarScript"
    Write-Host "Hermes home: $HermesHome"
    Write-Host "Runtime root: $RuntimeRoot"
    Write-Host "Dispatcher: $DispatcherScript"
    Write-Host "Log: $LogPath"
    Write-Host "Dispatch timeout seconds: $DispatchTimeoutSeconds"
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
    "-HermesHome", ('"{0}"' -f $HermesHome),
    "-RuntimeRoot", ('"{0}"' -f $RuntimeRoot),
    "-DispatcherScript", ('"{0}"' -f $DispatcherScript),
    "-IntervalSeconds", [string]$IntervalSeconds,
    "-DispatchTimeoutSeconds", [string]$DispatchTimeoutSeconds,
    "-LogPath", ('"{0}"' -f $LogPath),
    "-NativeProfileRoot", ('"{0}"' -f $NativeProfileRoot),
    "-PythonExe", ('"{0}"' -f $PythonExe)
)
$process = Start-Process -FilePath "powershell.exe" -ArgumentList $argumentList -WindowStyle Hidden -PassThru
Write-Host "Started Windows native cron tick sidecar; PID $($process.Id)."
Write-Host "Log: $LogPath"
