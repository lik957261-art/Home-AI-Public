param(
    [string]$DistroName = "",
    [string]$WslUser = "",
    [string]$HermesHome = "",
    [string]$RuntimeRoot = "/opt/hermes-gateway-runtime",
    [string]$DispatcherScript = "",
    [int]$IntervalSeconds = 60,
    [int]$DispatchTimeoutSeconds = 0,
    [string]$LogPath = "",
    [switch]$Once
)

$ErrorActionPreference = "Continue"

if (-not $DistroName) { $DistroName = $env:HERMES_WEB_WSL_DISTRO }
if (-not $DistroName) { $DistroName = "Ubuntu-24.04" }
if (-not $WslUser) { $WslUser = $env:HERMES_WEB_WSL_USER }
if (-not $WslUser) { $WslUser = "xuxin" }
if (-not $HermesHome) { $HermesHome = $env:HERMES_WEB_HERMES_HOME }
if (-not $HermesHome) { $HermesHome = "/home/$WslUser/.hermes" }
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

function Invoke-CronTick {
    $pythonPath = "$RuntimeRoot/official-clean"
    $pythonExe = "$RuntimeRoot/venv/bin/python"
    $dispatcherWslPath = ""
    if ($DispatcherScript -match '^([A-Za-z]):\\(.*)$') {
        $drive = $Matches[1].ToLowerInvariant()
        $tail = $Matches[2].Replace("\", "/")
        $dispatcherWslPath = "/mnt/$drive/$tail"
    } else {
        $dispatcherWslPath = (& wsl.exe -d $DistroName -u $WslUser -- wslpath -a $DispatcherScript 2>$null | Select-Object -First 1)
    }
    if (-not $dispatcherWslPath) {
        Write-CronTickLog "dispatcher path conversion failed: $DispatcherScript"
        return
    }
    $wslArgs = @(
        "-d", $DistroName,
        "-u", $WslUser,
        "--",
        "env",
        "HERMES_HOME=$HermesHome",
        "PYTHONPATH=$pythonPath",
        "HERMES_ACCEPT_HOOKS=1",
        $pythonExe,
        $dispatcherWslPath,
        "--dispatch"
    )

    $started = Get-Date
    Write-CronTickLog "dispatch start dispatcher=$dispatcherWslPath distro=$DistroName user=$WslUser hermes_home=$HermesHome dispatch_timeout_seconds=$DispatchTimeoutSeconds"
    $output = @()
    $timedOut = $false
    try {
        $stdoutPath = [System.IO.Path]::GetTempFileName()
        $stderrPath = [System.IO.Path]::GetTempFileName()
        try {
            $process = Start-Process -FilePath "wsl.exe" -ArgumentList $wslArgs -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
            if (-not $process.WaitForExit($DispatchTimeoutSeconds * 1000)) {
                $timedOut = $true
                $exitCode = 124
                Write-CronTickLog "dispatch timeout pid=$($process.Id) dispatch_timeout_seconds=$DispatchTimeoutSeconds"
                try { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue } catch {}
                try {
                    $cleanupArgs = @(
                        "-d", $DistroName,
                        "-u", $WslUser,
                        "--",
                        "bash",
                        "-lc",
                        "pkill -f 'hermes-mobile-cron-dispatcher.py --dispatch' 2>/dev/null || true"
                    )
                    & wsl.exe @cleanupArgs | Out-Null
                } catch {}
            } else {
                $process.Refresh()
                $exitCode = if ($null -eq $process.ExitCode) { 0 } else { $process.ExitCode }
            }
            $stdout = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -ErrorAction SilentlyContinue } else { @() }
            $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -ErrorAction SilentlyContinue } else { @() }
            $output = @($stdout) + @($stderr)
        } finally {
            Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
        }
    } catch {
        $output = @($_.Exception.Message)
        $exitCode = 1
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

Write-CronTickLog "sidecar start interval_seconds=$IntervalSeconds dispatch_timeout_seconds=$DispatchTimeoutSeconds once=$($Once.IsPresent)"
while ($true) {
    $loopStart = Get-Date
    Invoke-CronTick
    if ($Once) { break }
    $elapsedSeconds = [int][Math]::Ceiling(((Get-Date) - $loopStart).TotalSeconds)
    $sleepSeconds = [Math]::Max(5, $IntervalSeconds - $elapsedSeconds)
    Start-Sleep -Seconds $sleepSeconds
}
Write-CronTickLog "sidecar stop"
