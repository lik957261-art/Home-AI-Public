param(
    [string]$DestinationRoot = "C:\Users\xuxin\SynologyDrive\HermesMobile-Disaster-Recovery",
    [string]$ReceiptDirectory = "C:\ProgramData\HermesMobile\data\backups\disaster-recovery-receipts",
    [switch]$CheckOnly,
    [switch]$SkipWsl
)

$ErrorActionPreference = "Stop"

function Resolve-FullPath {
    param([string]$Path)
    return [System.IO.Path]::GetFullPath($Path)
}

function Ensure-Directory {
    param([string]$Path)
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function Assert-UnderRoot {
    param([string]$Root, [string]$Path)
    $rootFull = Resolve-FullPath $Root
    $pathFull = Resolve-FullPath $Path
    if (-not $pathFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to write outside backup root: $pathFull"
    }
}

function Invoke-RobocopyChecked {
    param(
        [string]$Source,
        [string]$Destination,
        [string[]]$ExcludeDirs = @(),
        [string[]]$ExcludeFiles = @()
    )
    if (-not (Test-Path -LiteralPath $Source)) {
        return [pscustomobject]@{ source = $Source; destination = $Destination; skipped = $true; reason = "missing" }
    }
    Assert-UnderRoot -Root $script:DestinationRootFull -Path $Destination
    Ensure-Directory $Destination
    $logPath = Join-Path $script:LogRoot ("robocopy-" + (($Destination -replace '[:\\\/ ]+', '_').Trim('_')) + ".log")
    $args = @(
        $Source,
        $Destination,
        "/MIR",
        "/COPY:DAT",
        "/DCOPY:DAT",
        "/R:1",
        "/W:1",
        "/XJ",
        "/FFT",
        "/NP",
        "/NFL",
        "/NDL",
        "/LOG:$logPath"
    )
    if ($ExcludeDirs.Count -gt 0) { $args += @("/XD") + $ExcludeDirs }
    if ($ExcludeFiles.Count -gt 0) { $args += @("/XF") + $ExcludeFiles }
    if ($CheckOnly) { $args += "/L" }
    & robocopy.exe @args | Out-Null
    $code = $LASTEXITCODE
    if ($code -ge 8) {
        throw "robocopy failed with exit code $code for $Source"
    }
    return [pscustomobject]@{ source = $Source; destination = $Destination; exitCode = $code; log = $logPath; skipped = $false }
}

function Copy-FileChecked {
    param([string]$Source, [string]$DestinationDirectory)
    if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
        return [pscustomobject]@{ source = $Source; destination = $DestinationDirectory; skipped = $true; reason = "missing" }
    }
    Assert-UnderRoot -Root $script:DestinationRootFull -Path $DestinationDirectory
    Ensure-Directory $DestinationDirectory
    if (-not $CheckOnly) {
        Copy-Item -LiteralPath $Source -Destination (Join-Path $DestinationDirectory ([System.IO.Path]::GetFileName($Source))) -Force
    }
    return [pscustomobject]@{ source = $Source; destination = $DestinationDirectory; skipped = $false }
}

function Remove-BackupPath {
    param([string]$Path)
    Assert-UnderRoot -Root $script:DestinationRootFull -Path $Path
    if ((Test-Path -LiteralPath $Path) -and -not $CheckOnly) {
        try {
            $full = Resolve-FullPath $Path
            Remove-Item -LiteralPath "\\?\$full" -Recurse -Force -ErrorAction Stop
        } catch {
            return [pscustomobject]@{ path = $Path; removed = $false; cleanupWarning = $_.Exception.Message }
        }
    }
    return [pscustomobject]@{ path = $Path; removed = (-not $CheckOnly) }
}

function Invoke-SqliteBackup {
    param([string]$Source, [string]$Destination)
    if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
        return [pscustomobject]@{ source = $Source; destination = $Destination; skipped = $true; reason = "missing" }
    }
    Assert-UnderRoot -Root $script:DestinationRootFull -Path $Destination
    Ensure-Directory ([System.IO.Path]::GetDirectoryName($Destination))
    if (-not $CheckOnly) {
        $code = @"
import sqlite3, sys
src, dst = sys.argv[1], sys.argv[2]
source = sqlite3.connect(src)
target = sqlite3.connect(dst)
try:
    source.backup(target)
finally:
    target.close()
    source.close()
"@
        $tmp = Join-Path $script:LogRoot "sqlite-backup.py"
        [System.IO.File]::WriteAllText($tmp, $code, (New-Object System.Text.UTF8Encoding($false)))
        & python.exe $tmp $Source $Destination
        if ($LASTEXITCODE -ne 0) { throw "sqlite backup failed for $Source" }
    }
    return [pscustomobject]@{ source = $Source; destination = $Destination; skipped = $false }
}

function Invoke-WslRsync {
    param([string]$Source, [string]$Destination, [string]$WslUser = "xuxin")
    if ($SkipWsl) {
        return [pscustomobject]@{ source = $Source; destination = $Destination; skipped = $true; reason = "SkipWsl" }
    }
    Assert-UnderRoot -Root $script:DestinationRootFull -Path $Destination
    Ensure-Directory $Destination
    $destFull = Resolve-FullPath $Destination
    if ($destFull -notmatch '^([A-Za-z]):\\(.*)$') {
        throw "Cannot convert Windows path to WSL path: $destFull"
    }
    $drive = $Matches[1].ToLowerInvariant()
    $tail = $Matches[2].Replace('\', '/')
    $destWsl = "/mnt/$drive/$tail"
    $dryRunArg = if ($CheckOnly) { "--dry-run" } else { "" }
    $script = @"
set -euo pipefail
src="$Source"
dst="$destWsl"
if [ ! -e "`$src" ]; then
  exit 22
fi
mkdir -p "`$dst"
if [ -d "`$src" ]; then
  rsync_src="`$src/"
else
  rsync_src="`$src"
fi
rsync -a $dryRunArg --delete --links --safe-links \
  --exclude hermes-agent --exclude sessions --exclude logs --exclude log --exclude cache --exclude tmp \
  --exclude __pycache__ --exclude sandboxes --exclude audio_cache --exclude image_cache \
  --exclude output --exclude run-logs --exclude run-artifacts --exclude local-backups --exclude backups --exclude preupdate-backups \
  --exclude node_modules --exclude .venv --exclude venv \
  "`$rsync_src" "`$dst"/
"@
    $tmp = Join-Path $script:LogRoot ("wsl-rsync-" + (($Source -replace '[^A-Za-z0-9_.-]+', '_').Trim('_')) + ".sh")
    [System.IO.File]::WriteAllText($tmp, $script, (New-Object System.Text.UTF8Encoding($false)))
    $tmpFull = Resolve-FullPath $tmp
    if ($tmpFull -notmatch '^([A-Za-z]):\\(.*)$') {
        throw "Cannot convert temp script path to WSL path: $tmpFull"
    }
    $tmpDrive = $Matches[1].ToLowerInvariant()
    $tmpTail = $Matches[2].Replace('\', '/')
    $tmpWsl = "/mnt/$tmpDrive/$tmpTail"
    & wsl.exe -d Ubuntu-24.04 -u $WslUser -- bash $tmpWsl
    $code = $LASTEXITCODE
    if ($code -eq 22) {
        return [pscustomobject]@{ source = $Source; destination = $Destination; skipped = $true; reason = "missing" }
    }
    if ($code -ne 0) { throw "wsl rsync failed with exit code $code for $Source" }
    return [pscustomobject]@{ source = $Source; destination = $Destination; skipped = $false }
}

$script:DestinationRootFull = Resolve-FullPath $DestinationRoot
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$currentRoot = Join-Path $script:DestinationRootFull "current"
$script:LogRoot = Join-Path $script:DestinationRootFull "_logs\$stamp"
Ensure-Directory $currentRoot
Ensure-Directory $script:LogRoot
Ensure-Directory $ReceiptDirectory

$steps = New-Object System.Collections.Generic.List[object]
$failures = New-Object System.Collections.Generic.List[string]

function Run-Step {
    param([string]$Name, [scriptblock]$Block)
    try {
        $result = & $Block
        $steps.Add([pscustomobject]@{ name = $Name; ok = $true; result = $result }) | Out-Null
    } catch {
        $failures.Add("${Name}: $($_.Exception.Message)") | Out-Null
        $steps.Add([pscustomobject]@{ name = $Name; ok = $false; error = $_.Exception.Message }) | Out-Null
    }
}

Run-Step "production-app" { Invoke-RobocopyChecked "C:\ProgramData\HermesMobile\app" (Join-Path $currentRoot "production\app") -ExcludeDirs @("node_modules", ".git") }
Run-Step "production-data" { Invoke-RobocopyChecked "C:\ProgramData\HermesMobile\data" (Join-Path $currentRoot "production\data") -ExcludeDirs @("temp", "tmp", "cache", "logs", "backups") }
Run-Step "production-gateway-worker" { Invoke-RobocopyChecked "C:\ProgramData\HermesMobile\gateway-worker" (Join-Path $currentRoot "production\gateway-worker") -ExcludeDirs @("logs", "tmp", "cache") }
Run-Step "production-runtime-sync" { Invoke-RobocopyChecked "C:\ProgramData\HermesMobile\runtime-sync" (Join-Path $currentRoot "production\runtime-sync") }
Run-Step "production-services" { Invoke-RobocopyChecked "C:\ProgramData\HermesMobile\services" (Join-Path $currentRoot "production\services") }
Run-Step "production-root-files" {
    @(
        "C:\ProgramData\HermesMobile\start-hermes-mobile-production.ps1",
        "C:\ProgramData\HermesMobile\start-worker-host.ps1",
        "C:\ProgramData\HermesMobile\worker-credential.xml"
    ) | ForEach-Object { Copy-FileChecked $_ (Join-Path $currentRoot "production\root") }
}
Run-Step "sqlite-online-snapshots" {
    @(
        @("C:\ProgramData\HermesMobile\data\hermes-mobile.sqlite3", "hermes-mobile.sqlite3"),
        @("C:\ProgramData\HermesMobile\data\learning-growth.sqlite3", "learning-growth.sqlite3")
    ) | ForEach-Object { Invoke-SqliteBackup $_[0] (Join-Path $currentRoot ("production\sqlite-snapshots\" + $_[1])) }
}
Run-Step "source-agent-checkout" { Invoke-RobocopyChecked "C:\Users\xuxin\Documents\Agent" (Join-Path $currentRoot "source\Agent") -ExcludeDirs @("node_modules", ".tmp", "__pycache__", "outputs") }
Run-Step "codex-skills-memory-config" {
    Invoke-RobocopyChecked "C:\Users\xuxin\.codex\skills" (Join-Path $currentRoot "user-home\.codex\skills")
    Invoke-RobocopyChecked "C:\Users\xuxin\.codex\memories" (Join-Path $currentRoot "user-home\.codex\memories")
    Invoke-RobocopyChecked "C:\Users\xuxin\.codex\plugins" (Join-Path $currentRoot "user-home\.codex\plugins")
    @(
        "C:\Users\xuxin\.codex\config.toml",
        "C:\Users\xuxin\.codex\auth.json",
        "C:\Users\xuxin\.codex\state_5.sqlite"
    ) | ForEach-Object { Copy-FileChecked $_ (Join-Path $currentRoot "user-home\.codex") }
}
Run-Step "codex-mobile-web-state" { Invoke-RobocopyChecked "C:\Users\xuxin\.codex-mobile-web" (Join-Path $currentRoot "user-home\.codex-mobile-web") -ExcludeDirs @("uploads") }
Run-Step "wsl-owner-hermes-critical" {
    $ownerDest = Join-Path $currentRoot "wsl\home-xuxin\.hermes"
    @("hermes-agent", "sessions", "logs", "log", "cache", "tmp", "sandboxes", "audio_cache", "image_cache", "run-logs", "run-artifacts", "local-backups", "backups", "preupdate-backups") | ForEach-Object {
        Remove-BackupPath (Join-Path $ownerDest $_)
    }
    @("skills", "scripts", "cron", "memories", "plugins", "token-usage", "weixin", "weixin-todos", "access-control") | ForEach-Object {
        Invoke-WslRsync "/home/xuxin/.hermes/$_" (Join-Path $ownerDest $_)
    }
    @("officialclean1", "officialclean2") | ForEach-Object {
        Invoke-WslRsync "/home/xuxin/.hermes/profiles/$_" (Join-Path $ownerDest "profiles\$_")
    }
    @("config.yaml", "auth.json", "auth.lock", "google_token.json", "google_client_secret.json", "gateway_state.json", "worker-pool.json", "worker-pool.state.json") | ForEach-Object {
        Invoke-WslRsync "/home/xuxin/.hermes/$_" $ownerDest
    }
}
Run-Step "wsl-lowgw-hermes" { Invoke-WslRsync "/home/hermes/.hermes" (Join-Path $currentRoot "wsl\home-hermes\.hermes") -WslUser "root" }
Run-Step "cleanup-legacy-official-clean-copy" { Remove-BackupPath (Join-Path $currentRoot "wsl\opt") }

$manifest = [pscustomobject]@{
    schemaVersion = 1
    createdAt = (Get-Date).ToString("o")
    checkOnly = [bool]$CheckOnly
    destinationRoot = $script:DestinationRootFull
    currentRoot = $currentRoot
    purpose = "Hermes Mobile disaster recovery backup for restoring production on a replacement computer"
    includes = @(
        "Hermes Mobile private source checkout",
        "Hermes Mobile production app/static/scripts",
        "Hermes Mobile production data including drive, SQLite, secrets, uploads, artifacts, and config",
        "Gateway worker configuration and production runtime package",
        "Codex skills/memory/config and Codex Mobile state",
        "WSL owner/low-permission Hermes skills, maintenance profiles, scripts, cron config, and plugins"
    )
    excludedVolatile = @("node_modules", "temporary directories", "cache directories", "logs", "old local backup folders")
    steps = $steps
    failures = $failures
}

$manifestPath = Join-Path $currentRoot "DISASTER-RECOVERY-MANIFEST.json"
$readmePath = Join-Path $currentRoot "RESTORE-README.md"
if (-not $CheckOnly) {
    [System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding($false)))
    [System.IO.File]::WriteAllText($readmePath, @"
# Hermes Mobile Disaster Recovery Backup

This folder is intended to restore Hermes Mobile production on a replacement computer.

Use the latest `current` folder synced by Synology Drive. It contains:

- `source/Agent`: private Hermes Mobile source checkout.
- `production/app`: production app files.
- `production/data`: production runtime data and secrets.
- `production/sqlite-snapshots`: online-consistent SQLite snapshots.
- `production/gateway-worker`, `production/runtime-sync`, `production/services`, `production/root`: worker/runtime/service startup material.
- `user-home/.codex` and `user-home/.codex-mobile-web`: Codex skills, memory/config, and Codex Mobile state.
- `wsl/home-xuxin/.hermes` and `wsl/home-hermes/.hermes`: Hermes skills, maintenance profiles, cron/scripts/plugins, and auth/config state.

Do not publish this backup. It contains production secrets and local account state.
"@, (New-Object System.Text.UTF8Encoding($false)))
}

$status = if ($failures.Count -eq 0) { "success" } elseif ($steps.Count -gt $failures.Count) { "partial" } else { "failed" }
$receiptPath = Join-Path $ReceiptDirectory ("disaster-recovery-receipt-$stamp.md")
$receiptLines = @(
    "# Hermes Mobile Disaster Recovery Backup Receipt",
    "",
    "- Status: $status",
    "- Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')",
    "- Destination: $script:DestinationRootFull",
    "- Current backup directory: $currentRoot",
    "- Includes: production app, production data, SQLite online snapshots, Gateway worker/runtime, source checkout, Codex/Codex Mobile state, WSL Hermes skills/maintenance profiles/scripts/cron/plugins/auth/config.",
    "- Excludes: node_modules, temporary directories, cache directories, logs, old local backup directories.",
    "- Failed steps: $($failures.Count)"
)
if ($failures.Count -gt 0) {
    $receiptLines += ""
    $receiptLines += "## Error Summary"
    $failures | ForEach-Object { $receiptLines += "- $_" }
}
if (-not $CheckOnly) {
    [System.IO.File]::WriteAllText($receiptPath, ($receiptLines -join "`n") + "`n", (New-Object System.Text.UTF8Encoding($false)))
}

[pscustomobject]@{
    ok = ($status -ne "failed")
    status = $status
    destinationRoot = $script:DestinationRootFull
    currentRoot = $currentRoot
    manifestPath = $manifestPath
    receiptPath = $receiptPath
    stepCount = $steps.Count
    failureCount = $failures.Count
    checkOnly = [bool]$CheckOnly
} | ConvertTo-Json -Depth 4

if ($status -eq "failed") { exit 1 }
