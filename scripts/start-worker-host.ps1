param(
    [string]$CredentialPath = "C:\ProgramData\HermesMobile\worker-credential.xml",
    [string]$LauncherPath = "C:\ProgramData\HermesMobile\start-hermes-mobile-production.ps1",
    [string]$WorkingDirectory = "C:\ProgramData\HermesMobile\app",
    [string]$UserName = "HermesMobileWorker",
    [string]$Domain = $env:COMPUTERNAME,
    [int]$Port = 8797,
    [string]$BridgeHostScript = "C:\ProgramData\HermesMobile\app\scripts\bridge-host.js",
    [int]$BridgeHostPort = 8798,
    [string]$BridgeHostKeyPath = "C:\ProgramData\HermesMobile\data\secrets\bridge-host.secret",
    [string]$BridgeWslUser = "",
    [string]$BridgeHermesHome = "",
    [string]$BridgeTodoPluginName = "",
    [string]$BridgeCronOutputRoot = "",
    [switch]$CheckOnly,
    [switch]$ReplaceExisting
)

$ErrorActionPreference = "Stop"

function Write-WorkerHostLog {
    param([string]$Message)
    $dataRoot = $env:HERMES_WEB_DATA_DIR
    if (-not $dataRoot) { $dataRoot = "C:\ProgramData\HermesMobile\data" }
    $logDir = Join-Path $dataRoot "logs"
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $line = "{0} {1}" -f (Get-Date).ToString("s"), $Message
    Add-Content -LiteralPath (Join-Path $logDir "worker-host.log") -Value $line -Encoding UTF8
}

function Get-ListenerProcess {
    param([int]$ListenPort)
    try {
        $connection = Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction Stop | Select-Object -First 1
        if (-not $connection) { return $null }
        return Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)" -ErrorAction Stop
    } catch {
        return $null
    }
}

function Get-ProcessOwnerName {
    param($ProcessInfo)
    if (-not $ProcessInfo) { return "" }
    try {
        $owner = Invoke-CimMethod -InputObject $ProcessInfo -MethodName GetOwner -ErrorAction Stop
        if (-not $owner.User) { return "" }
        return ("{0}\{1}" -f $owner.Domain, $owner.User).Trim("\")
    } catch {
        return ""
    }
}

function Test-CommandLineContainsPath {
    param(
        [string]$CommandLine,
        [string]$Path
    )
    if (-not $CommandLine -or -not $Path) { return $false }
    $normalizedCommand = $CommandLine.Replace("\", "/").ToLowerInvariant()
    $normalizedPath = ([System.IO.Path]::GetFullPath($Path)).Replace("\", "/").ToLowerInvariant()
    return $normalizedCommand.Contains($normalizedPath)
}

function Ensure-BridgeHostKey {
    param([string]$Path)
    if (Test-Path -LiteralPath $Path) { return }
    $parent = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $bytes = New-Object byte[] 32
        $rng.GetBytes($bytes)
        $value = [Convert]::ToBase64String($bytes)
        $encoding = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($Path, $value + [Environment]::NewLine, $encoding)
    } finally {
        $rng.Dispose()
    }
}

function Test-BridgeHostHealth {
    param([int]$ListenPort)
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri ("http://127.0.0.1:{0}/health" -f $ListenPort) -TimeoutSec 3 -ErrorAction Stop
        return ($response.StatusCode -eq 200 -and $response.Content -match "hermes-mobile-bridge-host")
    } catch {
        return $false
    }
}

function Set-BridgeHostEnvironment {
    param(
        [int]$ListenPort,
        [string]$KeyPath,
        [string]$WslUser,
        [string]$HermesHome,
        [string]$TodoPluginName,
        [string]$CronOutputRoot
    )
    $bridgeUrl = "http://127.0.0.1:$ListenPort"
    $env:HERMES_MOBILE_BRIDGE_HOST_URL = $bridgeUrl
    $env:HERMES_WEB_BRIDGE_HOST_URL = $bridgeUrl
    $env:HERMES_MOBILE_BRIDGE_HOST_KEY_PATH = $KeyPath
    $env:HERMES_WEB_BRIDGE_HOST_KEY_PATH = $KeyPath
    $env:HERMES_MOBILE_BRIDGE_HOST = "127.0.0.1"
    $env:HERMES_MOBILE_BRIDGE_HOST_PORT = [string]$ListenPort
    $resolvedWslUser = $WslUser
    if (-not $resolvedWslUser) { $resolvedWslUser = $env:HERMES_WEB_WSL_USER }
    if (-not $resolvedWslUser) { $resolvedWslUser = $env:HERMES_MOBILE_BRIDGE_WSL_USER }
    if (-not $resolvedWslUser) { $resolvedWslUser = "hermes" }
    if (-not $env:HERMES_WEB_WSL_USER) { $env:HERMES_WEB_WSL_USER = $resolvedWslUser }
    if (-not $env:HERMES_WEB_WSL_DISTRO) { $env:HERMES_WEB_WSL_DISTRO = "Ubuntu-24.04" }
    if (-not $env:HERMES_WEB_TODO_PLUGIN_NAME -and $TodoPluginName) { $env:HERMES_WEB_TODO_PLUGIN_NAME = $TodoPluginName }
    if (-not $env:HERMES_WEB_HERMES_HOME -and $HermesHome) { $env:HERMES_WEB_HERMES_HOME = $HermesHome }
    if (-not $env:HERMES_WEB_CRON_OUTPUT_ROOT -and $CronOutputRoot) { $env:HERMES_WEB_CRON_OUTPUT_ROOT = $CronOutputRoot }
}

function Start-BridgeHost {
    param(
        [string]$ScriptPath,
        [int]$ListenPort,
        [string]$KeyPath,
        [switch]$Replace
    )
    if (-not (Test-Path -LiteralPath $ScriptPath)) {
        throw "Hermes Mobile bridge host script not found: $ScriptPath"
    }
    Ensure-BridgeHostKey -Path $KeyPath
    Set-BridgeHostEnvironment -ListenPort $ListenPort -KeyPath $KeyPath -WslUser $BridgeWslUser -HermesHome $BridgeHermesHome -TodoPluginName $BridgeTodoPluginName -CronOutputRoot $BridgeCronOutputRoot
    $existing = Get-ListenerProcess -ListenPort $ListenPort
    if ($existing) {
        if (Test-BridgeHostHealth -ListenPort $ListenPort) {
            if ($Replace -and (Test-CommandLineContainsPath -CommandLine $existing.CommandLine -Path $ScriptPath)) {
                Write-WorkerHostLog "Restarting existing bridge host on port $ListenPort; PID $($existing.ProcessId)."
                Stop-Process -Id $existing.ProcessId -Force
                Start-Sleep -Seconds 1
            } else {
            Write-WorkerHostLog "Bridge host already healthy on port $ListenPort; PID $($existing.ProcessId)."
            return
            }
        }
        if (-not $Replace -or -not (Test-CommandLineContainsPath -CommandLine $existing.CommandLine -Path $ScriptPath)) {
            $ownerName = Get-ProcessOwnerName -ProcessInfo $existing
            throw "Bridge host port $ListenPort is owned by PID $($existing.ProcessId) ($ownerName), but health failed."
        }
        $existingAfterHealth = Get-ListenerProcess -ListenPort $ListenPort
        if ($existingAfterHealth) {
            Write-WorkerHostLog "Stopping stale bridge host on port $ListenPort; PID $($existingAfterHealth.ProcessId)."
            Stop-Process -Id $existingAfterHealth.ProcessId -Force
            Start-Sleep -Seconds 1
        }
    }
    $dataRoot = $env:HERMES_WEB_DATA_DIR
    if (-not $dataRoot) { $dataRoot = "C:\ProgramData\HermesMobile\data" }
    $logDir = Join-Path $dataRoot "logs"
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    Write-WorkerHostLog "Starting bridge host on port $ListenPort."
    $process = Start-Process -FilePath "node.exe" -ArgumentList @($ScriptPath) -WorkingDirectory (Split-Path -Parent (Split-Path -Parent $ScriptPath)) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir "bridge-host.out.log") -RedirectStandardError (Join-Path $logDir "bridge-host.err.log") -PassThru
    $deadline = (Get-Date).AddSeconds(12)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 400
        if (Test-BridgeHostHealth -ListenPort $ListenPort) {
            Write-WorkerHostLog "Bridge host OK on port $ListenPort; PID $($process.Id)."
            return
        }
        if ($process.HasExited) {
            throw "Bridge host exited with code $($process.ExitCode)."
        }
    }
    throw "Bridge host did not become healthy on port $ListenPort."
}

if (-not (Test-Path -LiteralPath $CredentialPath)) {
    throw "Worker credential file not found: $CredentialPath"
}
if (-not (Test-Path -LiteralPath $LauncherPath)) {
    throw "Hermes Mobile launcher not found: $LauncherPath"
}
if (-not (Test-Path -LiteralPath $WorkingDirectory)) {
    throw "Hermes Mobile working directory not found: $WorkingDirectory"
}
if (-not (Test-Path -LiteralPath $BridgeHostScript)) {
    throw "Hermes Mobile bridge host script not found: $BridgeHostScript"
}

Ensure-BridgeHostKey -Path $BridgeHostKeyPath
Set-BridgeHostEnvironment -ListenPort $BridgeHostPort -KeyPath $BridgeHostKeyPath -WslUser $BridgeWslUser -HermesHome $BridgeHermesHome -TodoPluginName $BridgeTodoPluginName -CronOutputRoot $BridgeCronOutputRoot
& node.exe --check $BridgeHostScript
if ($LASTEXITCODE -ne 0) {
    throw "Hermes Mobile bridge host syntax check failed."
}
if (-not $CheckOnly) {
    Start-BridgeHost -ScriptPath $BridgeHostScript -ListenPort $BridgeHostPort -KeyPath $BridgeHostKeyPath -Replace:$ReplaceExisting
}

$targetOwner = ("{0}\{1}" -f $Domain, $UserName).Trim("\")
$listener = Get-ListenerProcess -ListenPort $Port
if ($listener) {
    $ownerName = Get-ProcessOwnerName -ProcessInfo $listener
    if (($ownerName -ieq $targetOwner) -and -not $ReplaceExisting) {
        Write-WorkerHostLog "Worker listener already running on port $Port; PID $($listener.ProcessId)."
        return
    }
    if (-not $ReplaceExisting) {
        throw "Port $Port is already owned by PID $($listener.ProcessId) ($ownerName). Use -ReplaceExisting for a controlled cutover."
    }
    Write-WorkerHostLog "Stopping existing listener on port $Port; PID $($listener.ProcessId), owner $ownerName."
    Stop-Process -Id $listener.ProcessId -Force
    Start-Sleep -Seconds 2
}

$credential = Import-Clixml -LiteralPath $CredentialPath
$workerTempDir = $env:HERMES_MOBILE_WORKER_TEMP_DIR
if (-not $workerTempDir) {
    $workerDataRoot = $env:HERMES_WEB_DATA_DIR
    if (-not $workerDataRoot) { $workerDataRoot = "C:\ProgramData\HermesMobile\data" }
    $workerTempDir = Join-Path $workerDataRoot "temp"
}
New-Item -ItemType Directory -Force -Path $workerTempDir | Out-Null
$psi = [System.Diagnostics.ProcessStartInfo]::new()
$psi.FileName = "powershell.exe"
$launcherArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $LauncherPath)
if ($CheckOnly) { $launcherArgs += "-CheckOnly" }
$psi.Arguments = ($launcherArgs | ForEach-Object {
    if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
}) -join " "
$psi.WorkingDirectory = $WorkingDirectory
$psi.UserName = $UserName
$psi.Domain = $Domain
$psi.Password = $credential.Password
$psi.UseShellExecute = $false
$psi.LoadUserProfile = $true
$psi.CreateNoWindow = $true
$psi.EnvironmentVariables["HERMES_MOBILE_BRIDGE_HOST_URL"] = $env:HERMES_MOBILE_BRIDGE_HOST_URL
$psi.EnvironmentVariables["HERMES_WEB_BRIDGE_HOST_URL"] = $env:HERMES_WEB_BRIDGE_HOST_URL
$psi.EnvironmentVariables["HERMES_MOBILE_BRIDGE_HOST_KEY_PATH"] = $env:HERMES_MOBILE_BRIDGE_HOST_KEY_PATH
$psi.EnvironmentVariables["HERMES_WEB_BRIDGE_HOST_KEY_PATH"] = $env:HERMES_WEB_BRIDGE_HOST_KEY_PATH
$psi.EnvironmentVariables["TEMP"] = $workerTempDir
$psi.EnvironmentVariables["TMP"] = $workerTempDir

Write-WorkerHostLog "Starting Hermes Mobile launcher as $targetOwner on port $Port."
$process = [System.Diagnostics.Process]::Start($psi)
$deadlineMs = if ($CheckOnly) { 30000 } else { 45000 }
if (-not $process.WaitForExit($deadlineMs)) {
    Write-WorkerHostLog "Launcher PID $($process.Id) did not exit within $deadlineMs ms."
    throw "Hermes Mobile worker launcher did not finish in time."
}
if ($process.ExitCode -ne 0) {
    Write-WorkerHostLog "Launcher PID $($process.Id) exited with code $($process.ExitCode)."
    throw "Hermes Mobile worker launcher failed with exit code $($process.ExitCode)."
}
if ($CheckOnly) {
    Write-WorkerHostLog "Worker launcher check completed."
    return
}

$deadline = (Get-Date).AddSeconds(20)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 400
    $listener = Get-ListenerProcess -ListenPort $Port
    if (-not $listener) { continue }
    $ownerName = Get-ProcessOwnerName -ProcessInfo $listener
    if ($ownerName -ieq $targetOwner) {
        Write-WorkerHostLog "Worker listener OK on port $Port; PID $($listener.ProcessId)."
        return
    }
}

throw "Hermes Mobile worker listener did not open port $Port as $targetOwner."
