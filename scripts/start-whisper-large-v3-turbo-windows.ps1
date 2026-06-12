param(
    [string]$ServiceRoot = "C:\ProgramData\HermesMobile\services\whisper-large-v3-turbo",
    [string]$PythonExe = "",
    [string]$VenvPath = "",
    [string]$HostAddress = "0.0.0.0",
    [int]$Port = 8001,
    [int]$ReadyWaitSeconds = 90,
    [string]$LogPath = "",
    [switch]$CheckOnly,
    [switch]$ReplaceExisting
)

$ErrorActionPreference = "Stop"

if (-not $PythonExe) { $PythonExe = "C:\ProgramData\HermesMobile\gateway-worker\native-runtime\venv\Scripts\python.exe" }
if (-not $VenvPath) { $VenvPath = Join-Path $ServiceRoot ".venv-windows" }
if (-not $LogPath) { $LogPath = Join-Path (Join-Path $ServiceRoot "logs") "whisper-large-v3-turbo-windows-start.log" }
if ($ReadyWaitSeconds -lt 5) { $ReadyWaitSeconds = 5 }

function Write-WhisperWindowsLog {
    param([string]$Message)
    $parent = Split-Path -Parent $LogPath
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    $line = "{0} {1}" -f (Get-Date).ToString("s"), $Message
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
}

function Get-WhisperListenerProcess {
    try {
        $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
        if (-not $connection) { return $null }
        return Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)" -ErrorAction Stop
    } catch {
        return $null
    }
}

function Test-WhisperHealth {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri ("http://127.0.0.1:{0}/health" -f $Port) -TimeoutSec 3 -ErrorAction Stop
        if ($response.StatusCode -ne 200) { return $false }
        return ($response.Content -match "large-v3-turbo")
    } catch {
        return $false
    }
}

function Test-PythonModule {
    param(
        [string]$Interpreter,
        [string]$Module
    )
    & $Interpreter -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('$Module') else 1)" 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0)
}

function Ensure-WhisperWindowsVenv {
    if (-not (Test-Path -LiteralPath $ServiceRoot)) {
        throw "Whisper service root not found: $ServiceRoot"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $ServiceRoot "app.py"))) {
        throw "Whisper app.py not found under service root: $ServiceRoot"
    }
    if (-not (Test-Path -LiteralPath $PythonExe)) {
        throw "Windows Python not found: $PythonExe"
    }
    $venvPython = Join-Path $VenvPath "Scripts\python.exe"
    if (-not (Test-Path -LiteralPath $venvPython)) {
        Write-WhisperWindowsLog "creating Windows Whisper venv at $VenvPath"
        & $PythonExe -m venv $VenvPath
        if ($LASTEXITCODE -ne 0) { throw "Failed to create Windows Whisper venv" }
    }
    $needInstall = -not (
        (Test-PythonModule -Interpreter $venvPython -Module "fastapi") -and
        (Test-PythonModule -Interpreter $venvPython -Module "uvicorn") -and
        (Test-PythonModule -Interpreter $venvPython -Module "faster_whisper")
    )
    if ($needInstall) {
        $requirementsPath = Join-Path $ServiceRoot "requirements.txt"
        if (-not (Test-Path -LiteralPath $requirementsPath)) {
            throw "Whisper requirements.txt not found: $requirementsPath"
        }
        Write-WhisperWindowsLog "installing Windows Whisper dependencies from $requirementsPath"
        & $venvPython -m pip install --upgrade pip
        if ($LASTEXITCODE -ne 0) { throw "Failed to upgrade pip in Windows Whisper venv" }
        & $venvPython -m pip install -r $requirementsPath
        if ($LASTEXITCODE -ne 0) { throw "Failed to install Windows Whisper dependencies" }
    }
    return $venvPython
}

function Set-WhisperEnvironment {
    $env:WHISPER_MODEL = if ($env:WHISPER_MODEL) { $env:WHISPER_MODEL } else { "large-v3-turbo" }
    $env:WHISPER_DEVICE = if ($env:WHISPER_DEVICE) { $env:WHISPER_DEVICE } else { "cpu" }
    $env:WHISPER_COMPUTE_TYPE = if ($env:WHISPER_COMPUTE_TYPE) { $env:WHISPER_COMPUTE_TYPE } else { "int8" }
    $env:WHISPER_BATCH_SIZE = if ($env:WHISPER_BATCH_SIZE) { $env:WHISPER_BATCH_SIZE } else { "4" }
    $env:WHISPER_BEAM_SIZE = if ($env:WHISPER_BEAM_SIZE) { $env:WHISPER_BEAM_SIZE } else { "5" }
    $env:WHISPER_LANGUAGE = if ($env:WHISPER_LANGUAGE) { $env:WHISPER_LANGUAGE } else { "zh" }
    $env:WHISPER_TASK = if ($env:WHISPER_TASK) { $env:WHISPER_TASK } else { "transcribe" }
    $env:WHISPER_INITIAL_PROMPT = if ($env:WHISPER_INITIAL_PROMPT) { $env:WHISPER_INITIAL_PROMPT } else { "以下是普通话语音转写，请使用简体中文，并加入合适的中文标点符号。" }
    $env:WHISPER_CONDITION_ON_PREVIOUS_TEXT = if ($env:WHISPER_CONDITION_ON_PREVIOUS_TEXT) { $env:WHISPER_CONDITION_ON_PREVIOUS_TEXT } else { "1" }
    $env:WHISPER_VAD_FILTER = if ($env:WHISPER_VAD_FILTER) { $env:WHISPER_VAD_FILTER } else { "0" }
    $env:HF_HOME = if ($env:HF_HOME) { $env:HF_HOME } else { Join-Path (Join-Path $ServiceRoot "models") "huggingface" }
    $env:HF_ENDPOINT = if ($env:HF_ENDPOINT) { $env:HF_ENDPOINT } else { "https://hf-mirror.com" }
    $env:WHISPER_TMP_DIR = if ($env:WHISPER_TMP_DIR) { $env:WHISPER_TMP_DIR } else { Join-Path $ServiceRoot "tmp" }
    New-Item -ItemType Directory -Force -Path $env:HF_HOME, $env:WHISPER_TMP_DIR | Out-Null
}

$existing = Get-WhisperListenerProcess
if ($existing -and (Test-WhisperHealth) -and -not $ReplaceExisting) {
    Write-Host "Whisper large-v3-turbo service already healthy on port $Port; PID $($existing.ProcessId)."
    return
}

$venvPython = [string](@(Ensure-WhisperWindowsVenv) | Select-Object -Last 1)

if ($CheckOnly) {
    if (-not (Test-PythonModule -Interpreter $venvPython -Module "faster_whisper")) {
        throw "Windows Whisper venv is missing faster_whisper"
    }
    Write-Host "Whisper Windows native check OK"
    Write-Host "Service root: $ServiceRoot"
    Write-Host "Python: $venvPython"
    return
}

if ($existing) {
    if (-not $ReplaceExisting) {
        throw "Port $Port is already owned by PID $($existing.ProcessId): $($existing.CommandLine)"
    }
    Write-WhisperWindowsLog "stopping existing listener on port $Port pid=$($existing.ProcessId)"
    Stop-Process -Id $existing.ProcessId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

Set-WhisperEnvironment
$stdoutLog = Join-Path (Split-Path -Parent $LogPath) "whisper-large-v3-turbo.out.log"
$stderrLog = Join-Path (Split-Path -Parent $LogPath) "whisper-large-v3-turbo.err.log"
Write-WhisperWindowsLog "starting Windows Whisper service host=$HostAddress port=$Port python=$venvPython"
$process = Start-Process -WindowStyle Hidden `
    -FilePath $venvPython `
    -ArgumentList @("-m", "uvicorn", "app:app", "--host", $HostAddress, "--port", [string]$Port) `
    -WorkingDirectory $ServiceRoot `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -PassThru

$deadline = (Get-Date).AddSeconds($ReadyWaitSeconds)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    if ($process.HasExited) { break }
    if (Test-WhisperHealth) {
        Write-Host "Whisper Windows native service OK; PID $($process.Id); port $Port"
        Write-Host "Log: $LogPath"
        return
    }
}

if ($process.HasExited) {
    throw "Whisper Windows native service exited with code $($process.ExitCode). See $stderrLog"
}
throw "Whisper Windows native service did not become healthy on port $Port. See $stdoutLog and $stderrLog"
