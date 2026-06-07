param(
    [string]$HermesHome = "",
    [string]$RuntimeRoot = "C:\ProgramData\HermesMobile\gateway-worker\native-runtime",
    [string]$DispatcherScript = "",
    [int]$IntervalSeconds = 60,
    [int]$DispatchTimeoutSeconds = 0,
    [string]$LogPath = "",
    [string]$NativeProfileRoot = "C:\ProgramData\HermesMobile\hermes-native-profile",
    [string]$PythonExe = "",
    [switch]$Once
)

$ErrorActionPreference = "Continue"

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

function Write-CronTickLog {
    param([string]$Message)
    try {
        $logDir = Split-Path -Parent $LogPath
        if ($logDir) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }
        $line = "{0} {1}" -f (Get-Date).ToString("s"), $Message
        Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
    } catch {
        Write-Warning "Could not write cron tick sidecar log: $($_.Exception.Message)"
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

    $cronModelProxyUrl = $env:HERMES_MOBILE_CRON_MODEL_PROXY_URL
    if (-not $cronModelProxyUrl) { $cronModelProxyUrl = $env:HERMES_WEB_CRON_MODEL_PROXY_URL }
    if (-not $cronModelProxyUrl) { $cronModelProxyUrl = $env:HTTPS_PROXY }
    if (-not $cronModelProxyUrl) { $cronModelProxyUrl = $env:HTTP_PROXY }
    if (-not $cronModelProxyUrl) { $cronModelProxyUrl = $env:ALL_PROXY }
    if ($cronModelProxyUrl) {
        $env:HERMES_MOBILE_CRON_MODEL_PROXY_URL = $cronModelProxyUrl
        $env:HTTPS_PROXY = $cronModelProxyUrl
        $env:HTTP_PROXY = $cronModelProxyUrl
        $env:ALL_PROXY = $cronModelProxyUrl
    }
}

function Invoke-CronTick {
    if (-not (Test-Path -LiteralPath $PythonExe)) {
        Write-CronTickLog "native Windows cron python missing: $PythonExe"
        return
    }
    if (-not (Test-Path -LiteralPath $DispatcherScript)) {
        Write-CronTickLog "native Windows cron dispatcher missing: $DispatcherScript"
        return
    }
    Set-NativeCronEnvironment
    $started = Get-Date
    $stdoutPath = [System.IO.Path]::GetTempFileName()
    $stderrPath = [System.IO.Path]::GetTempFileName()
    $output = @()
    $timedOut = $false
    try {
        Write-CronTickLog "dispatch start dispatcher=$DispatcherScript side=windows-native hermes_home=$HermesHome dispatch_timeout_seconds=$DispatchTimeoutSeconds"
        $process = Start-Process -FilePath $PythonExe -ArgumentList @($DispatcherScript, "--dispatch") -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
        if (-not $process.WaitForExit($DispatchTimeoutSeconds * 1000)) {
            $timedOut = $true
            $exitCode = 124
            Write-CronTickLog "dispatch timeout pid=$($process.Id) dispatch_timeout_seconds=$DispatchTimeoutSeconds"
            try { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue } catch {}
        } else {
            $process.Refresh()
            $exitCode = if ($null -eq $process.ExitCode) { 0 } else { $process.ExitCode }
        }
        $stdout = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -ErrorAction SilentlyContinue } else { @() }
        $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -ErrorAction SilentlyContinue } else { @() }
        $output = @($stdout) + @($stderr)
    } catch {
        $output = @($_.Exception.Message)
        $exitCode = 1
    } finally {
        Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
    }
    $elapsedMs = [int]((Get-Date) - $started).TotalMilliseconds
    Write-CronTickLog "dispatch exit=$exitCode elapsed_ms=$elapsedMs timed_out=$timedOut"
    if ($output.Count -gt 0) {
        $maxLines = 80
        $lines = if ($output.Count -le $maxLines) {
            $output
        } else {
            @("[cron tick output truncated: $($output.Count) lines]") + ($output | Select-Object -Last $maxLines)
        }
        foreach ($line in $lines) {
            if ($line) { Write-CronTickLog "dispatch output: $line" }
        }
    }
}

Write-CronTickLog "sidecar start interval_seconds=$IntervalSeconds dispatch_timeout_seconds=$DispatchTimeoutSeconds once=$($Once.IsPresent) side=windows-native"
while ($true) {
    $loopStart = Get-Date
    Invoke-CronTick
    if ($Once) { break }
    $elapsedSeconds = [int][Math]::Ceiling(((Get-Date) - $loopStart).TotalSeconds)
    $sleepSeconds = [Math]::Max(5, $IntervalSeconds - $elapsedSeconds)
    Start-Sleep -Seconds $sleepSeconds
}
Write-CronTickLog "sidecar stop"
