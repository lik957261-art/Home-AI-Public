param(
    [string]$DistroName = "",
    [string]$WslUser = "",
    [string]$HermesHome = "",
    [string]$RuntimeRoot = "/opt/hermes-gateway-runtime",
    [int]$IntervalSeconds = 60,
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
if (-not $LogPath) { $LogPath = $env:HERMES_MOBILE_CRON_TICK_LOG_PATH }
if (-not $LogPath) {
    $dataRoot = $env:HERMES_WEB_DATA_DIR
    if (-not $dataRoot) { $dataRoot = "C:\ProgramData\HermesMobile\data" }
    $LogPath = Join-Path (Join-Path $dataRoot "logs") "cron-tick-sidecar.log"
}
if ($IntervalSeconds -lt 10) { $IntervalSeconds = 10 }

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
    $wslArgs = @(
        "-d", $DistroName,
        "-u", $WslUser,
        "--",
        "env",
        "HERMES_HOME=$HermesHome",
        "PYTHONPATH=$pythonPath",
        "HERMES_ACCEPT_HOOKS=1",
        $pythonExe,
        "-m", "hermes_cli.main",
        "cron", "tick",
        "--accept-hooks"
    )

    $started = Get-Date
    Write-CronTickLog "tick start distro=$DistroName user=$WslUser hermes_home=$HermesHome"
    $output = @()
    try {
        $output = & wsl.exe @wslArgs 2>&1 | ForEach-Object { $_.ToString() }
        $exitCode = $LASTEXITCODE
    } catch {
        $output = @($_.Exception.Message)
        $exitCode = 1
    }
    $elapsedMs = [int]((Get-Date) - $started).TotalMilliseconds
    Write-CronTickLog "tick exit=$exitCode elapsed_ms=$elapsedMs"
    if ($output.Count -gt 0) {
        $maxLines = 80
        $lines = if ($output.Count -le $maxLines) {
            $output
        } else {
            @("[cron tick output truncated: $($output.Count) lines]") + ($output | Select-Object -Last $maxLines)
        }
        foreach ($line in $lines) {
            if ($line) { Write-CronTickLog "tick output: $line" }
        }
    }
}

Write-CronTickLog "sidecar start interval_seconds=$IntervalSeconds once=$($Once.IsPresent)"
while ($true) {
    $loopStart = Get-Date
    Invoke-CronTick
    if ($Once) { break }
    $elapsedSeconds = [int][Math]::Ceiling(((Get-Date) - $loopStart).TotalSeconds)
    $sleepSeconds = [Math]::Max(5, $IntervalSeconds - $elapsedSeconds)
    Start-Sleep -Seconds $sleepSeconds
}
Write-CronTickLog "sidecar stop"
