param(
    [string]$NativeProfileRoot = "C:\ProgramData\HermesMobile\hermes-native-profile",
    [string]$HermesHome = "",
    [string]$RuntimeRoot = "C:\ProgramData\HermesMobile\gateway-worker\native-runtime",
    [string]$PythonExe = "",
    [string]$MobileBaseUrl = "",
    [string]$IngressKeyPath = "",
    [string]$RouteMapPath = "",
    [string]$BridgeScript = "",
    [string]$StateDir = "",
    [int]$ReadyWaitSeconds = 45,
    [string]$LogPath = "",
    [switch]$CheckOnly,
    [switch]$ReplaceExisting,
    [switch]$SkipDispatchers
)

$ErrorActionPreference = "Stop"

if (-not $HermesHome) { $HermesHome = Join-Path $NativeProfileRoot ".hermes" }
if (-not $PythonExe) { $PythonExe = Join-Path $RuntimeRoot "venv\Scripts\python.exe" }
if (-not $MobileBaseUrl) { $MobileBaseUrl = $env:HERMES_MOBILE_BASE_URL }
if (-not $MobileBaseUrl) { $MobileBaseUrl = $env:HERMES_WEB_BASE_URL }
if (-not $MobileBaseUrl) { $MobileBaseUrl = "http://127.0.0.1:8797" }
if (-not $IngressKeyPath) { $IngressKeyPath = $env:HERMES_MOBILE_WEIXIN_INGRESS_KEY_PATH }
if (-not $IngressKeyPath) { $IngressKeyPath = "C:\ProgramData\HermesMobile\data\weixin-ingress.secret" }
if (-not $RouteMapPath) { $RouteMapPath = $env:HERMES_WEB_WEIXIN_ROUTE_MAP_PATH }
if (-not $RouteMapPath) { $RouteMapPath = "C:\ProgramData\HermesMobile\data\config\access-control\weixin-routing-map.json" }
if (-not $BridgeScript) { $BridgeScript = "C:\ProgramData\HermesMobile\app\scripts\weixin-mobile-ingress-bridge.py" }
if (-not $StateDir) { $StateDir = Join-Path $HermesHome "weixin-mobile-ingress" }
if (-not $LogPath) {
    $dataRoot = $env:HERMES_WEB_DATA_DIR
    if (-not $dataRoot) { $dataRoot = "C:\ProgramData\HermesMobile\data" }
    $LogPath = Join-Path (Join-Path $dataRoot "logs") "weixin-mobile-ingress-bridge-windows-start.log"
}
if ($ReadyWaitSeconds -lt 5) { $ReadyWaitSeconds = 5 }

function Write-WeixinIngressWindowsLog {
    param([string]$Message)
    $parent = Split-Path -Parent $LogPath
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    $line = "{0} {1}" -f (Get-Date).ToString("s"), $Message
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
}

function Assert-PathExists {
    param(
        [string]$PathValue,
        [string]$Label
    )
    if (-not (Test-Path -LiteralPath $PathValue)) {
        throw "$Label not found: $PathValue"
    }
}

function Set-WeixinIngressWindowsEnvironment {
    $runtimeSource = Join-Path $RuntimeRoot "official-clean"
    $env:USERPROFILE = $NativeProfileRoot
    $env:HOME = $NativeProfileRoot
    $env:HERMES_HOME = $HermesHome
    $env:HERMES_REPO = $runtimeSource
    $env:PYTHONPATH = $runtimeSource
    $env:HERMES_MOBILE_BASE_URL = $MobileBaseUrl
    $env:HERMES_MOBILE_WEIXIN_RUNTIME_SOURCE = $runtimeSource
    $env:HERMES_MOBILE_WEIXIN_RUNTIME_ROOT = $RuntimeRoot
    $env:HERMES_MOBILE_WEIXIN_INGRESS_KEY_FILE = $IngressKeyPath
    $env:HERMES_MOBILE_WEIXIN_INGRESS_KEY_PATH = $IngressKeyPath
    $env:HERMES_MOBILE_WEIXIN_ROUTE_MAP_PATH = $RouteMapPath
    $env:HERMES_WEB_WEIXIN_ROUTE_MAP_PATH = $RouteMapPath
    $env:HERMES_MOBILE_WEIXIN_BRIDGE_STATE_DIR = $StateDir
}

function Get-PidFileProcess {
    param([string]$PidPath)
    try {
        $pidText = (Get-Content -LiteralPath $PidPath -Raw -ErrorAction Stop).Trim()
        $pidValue = 0
        if (-not [int]::TryParse($pidText, [ref]$pidValue)) { return $null }
        return Get-CimInstance Win32_Process -Filter "ProcessId=$pidValue" -ErrorAction Stop
    } catch {
        return $null
    }
}

function Test-BridgeHealthy {
    $output = & $PythonExe $BridgeScript --base-url $MobileBaseUrl --state-dir $StateDir check 2>&1 | ForEach-Object { $_.ToString() }
    $exitCode = $LASTEXITCODE
    $summary = ($output | Where-Object { $_ -match "MOBILE_WEIXIN_INGRESS_BRIDGE" } | Select-Object -First 1)
    Write-WeixinIngressWindowsLog ("bridge check exit={0} summary={1}" -f $exitCode, ($summary -replace "\s+", " "))
    return ($exitCode -eq 0)
}

function Stop-BridgeIfRequested {
    if (-not $ReplaceExisting) { return }
    $pidPath = Join-Path $StateDir "bridge.pid"
    $process = Get-PidFileProcess -PidPath $pidPath
    if (-not $process) { return }
    Write-WeixinIngressWindowsLog "stopping existing Windows Weixin ingress bridge pid=$($process.ProcessId)"
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

function Start-BridgeIfNeeded {
    if (Test-BridgeHealthy) { return }
    Stop-BridgeIfRequested
    if (Test-BridgeHealthy) { return }
    $logDir = Split-Path -Parent $LogPath
    $stdoutLog = Join-Path $logDir "weixin-mobile-ingress-bridge.out.log"
    $stderrLog = Join-Path $logDir "weixin-mobile-ingress-bridge.err.log"
    Write-WeixinIngressWindowsLog "starting Windows Weixin ingress bridge base=$MobileBaseUrl state=$StateDir"
    Start-Process -WindowStyle Hidden `
        -FilePath $PythonExe `
        -ArgumentList @($BridgeScript, "--base-url", $MobileBaseUrl, "--state-dir", $StateDir, "loop") `
        -WorkingDirectory (Join-Path $RuntimeRoot "official-clean") `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog `
        -PassThru | Out-Null

    $deadline = (Get-Date).AddSeconds($ReadyWaitSeconds)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 1
        if (Test-BridgeHealthy) { return }
    }
    throw "Windows Weixin ingress bridge did not become healthy. See $stdoutLog and $stderrLog"
}

function DispatcherSpec {
    param(
        [string]$SpecName,
        [string]$ScriptName,
        [string]$PidRelativePath,
        [string]$LogName
    )
    [pscustomobject]@{
        Name = $SpecName
        Script = Join-Path (Join-Path $HermesHome "bin") $ScriptName
        PidPath = Join-Path $HermesHome $PidRelativePath
        LogPath = Join-Path (Join-Path $HermesHome "logs") $LogName
    }
}

function Get-DispatcherSpecs {
    @(
        (DispatcherSpec -SpecName "weixin-reminder" -ScriptName "weixin-reminder-dispatcher.py" -PidRelativePath "weixin-reminders\dispatcher.pid" -LogName "weixin-reminder-dispatcher.log"),
        (DispatcherSpec -SpecName "weixin-todo" -ScriptName "weixin-todo-dispatcher.py" -PidRelativePath "weixin-todos\dispatcher.pid" -LogName "weixin-todo-dispatcher.log"),
        (DispatcherSpec -SpecName "weixin-delivery-queue" -ScriptName "weixin-delivery-queue-dispatcher.py" -PidRelativePath "weixin-delivery\delivery-queue-dispatcher.pid" -LogName "weixin-delivery-queue-dispatcher.log")
    )
}

function Start-DispatcherIfNeeded {
    param($Spec)
    Assert-PathExists -PathValue $Spec.Script -Label "$($Spec.Name) dispatcher"
    $existing = Get-PidFileProcess -PidPath $Spec.PidPath
    if ($existing) {
        if (-not $ReplaceExisting) { return }
        Write-WeixinIngressWindowsLog "stopping existing $($Spec.Name) dispatcher pid=$($existing.ProcessId)"
        Stop-Process -Id $existing.ProcessId -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
    $parent = Split-Path -Parent $Spec.LogPath
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    Write-WeixinIngressWindowsLog "starting $($Spec.Name) dispatcher"
    $stderrLog = "$($Spec.LogPath).err.log"
    Start-Process -WindowStyle Hidden `
        -FilePath $PythonExe `
        -ArgumentList @($Spec.Script, "loop") `
        -WorkingDirectory (Join-Path $RuntimeRoot "official-clean") `
        -RedirectStandardOutput $Spec.LogPath `
        -RedirectStandardError $stderrLog `
        -PassThru | Out-Null
}

function Check-Dispatcher {
    param($Spec)
    Assert-PathExists -PathValue $Spec.Script -Label "$($Spec.Name) dispatcher"
    $null = & $PythonExe $Spec.Script status 2>&1
    $exitCode = $LASTEXITCODE
    Write-WeixinIngressWindowsLog ("{0} dispatcher status exit={1}" -f $Spec.Name, $exitCode)
    if ($exitCode -ne 0) { throw "$($Spec.Name) dispatcher status failed with exit code $exitCode" }
}

Assert-PathExists -PathValue $PythonExe -Label "Windows Hermes Python"
Assert-PathExists -PathValue (Join-Path $RuntimeRoot "official-clean") -Label "Windows Hermes official source"
Assert-PathExists -PathValue $BridgeScript -Label "Weixin ingress bridge script"
Assert-PathExists -PathValue $HermesHome -Label "Windows Hermes home"
Assert-PathExists -PathValue (Join-Path $HermesHome "config.yaml") -Label "Windows Hermes config"
Assert-PathExists -PathValue $IngressKeyPath -Label "Weixin ingress key file"
Assert-PathExists -PathValue $RouteMapPath -Label "Weixin route map"
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
Set-WeixinIngressWindowsEnvironment

if ($CheckOnly) {
    if (-not (Test-BridgeHealthy)) { throw "Windows Weixin ingress bridge is not healthy" }
    if (-not $SkipDispatchers) {
        foreach ($spec in Get-DispatcherSpecs) { Check-Dispatcher -Spec $spec }
    }
    Write-Host "Windows Weixin ingress bridge check OK"
    return
}

Start-BridgeIfNeeded
if (-not $SkipDispatchers) {
    foreach ($spec in Get-DispatcherSpecs) { Start-DispatcherIfNeeded -Spec $spec }
}

Write-Host "Windows Weixin ingress bridge OK"
Write-Host "Log: $LogPath"
