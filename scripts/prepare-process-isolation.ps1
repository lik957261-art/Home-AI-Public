param(
  [string]$AccountName = "HermesMobileWorker",
  [string]$RuntimeDir = "C:\ProgramData\HermesMobile\app",
  [string]$DataDir = "C:\ProgramData\HermesMobile\data",
  [string]$LogDir = "C:\ProgramData\HermesMobile\logs",
  [string]$SourceDir = "",
  [string]$CredentialFile = "C:\ProgramData\HermesMobile\worker-credential.xml",
  [switch]$CreateUser,
  [switch]$GeneratePassword,
  [switch]$DenySourceAccess,
  [switch]$Apply
)

$ErrorActionPreference = "Stop"

function Test-IsWindows {
  return [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
    [System.Runtime.InteropServices.OSPlatform]::Windows
  )
}

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function New-RandomPassword {
  $bytes = New-Object byte[] 24
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  return [Convert]::ToBase64String($bytes) + "aA1!"
}

function Invoke-Step {
  param(
    [string]$Message,
    [scriptblock]$Action
  )
  Write-Host "[plan] $Message"
  if ($Apply) {
    & $Action
  }
}

function Set-PrivateFileAcl {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls $Path /inheritance:r | Out-Null
  & icacls $Path /grant:r "${currentUser}:F" "SYSTEM:F" "BUILTIN\Administrators:F" | Out-Null
}

function Set-PrivateDirectoryAcl {
  param(
    [string]$Path,
    [string]$WorkerRights
  )
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls $Path /inheritance:r | Out-Null
  & icacls $Path /grant:r "${currentUser}:(OI)(CI)F" "SYSTEM:(OI)(CI)F" "BUILTIN\Administrators:(OI)(CI)F" "${AccountName}:(OI)(CI)$WorkerRights" | Out-Null
}

function Assert-NarrowMutableDataDir {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $forbiddenMarkers = @(".git", ".agent-context", "configs", "scripts", "server.js", "package.json", "AGENTS.md")
  foreach ($marker in $forbiddenMarkers) {
    if (Test-Path -LiteralPath (Join-Path $Path $marker)) {
      throw "Refusing to grant worker access to broad/source-like DataDir '$Path' because it contains '$marker'. Use a narrow mutable data directory instead."
    }
  }
}

if (-not (Test-IsWindows)) {
  throw "This script is Windows-only. Use scripts/prepare-process-isolation.sh on macOS/Linux."
}

if ($Apply -and -not (Test-IsAdmin)) {
  throw "-Apply requires an elevated PowerShell session."
}

Assert-NarrowMutableDataDir -Path $DataDir

Write-Host "Hermes Mobile process isolation preparation"
Write-Host "Account: $AccountName"
Write-Host "RuntimeDir: $RuntimeDir"
Write-Host "DataDir: $DataDir"
Write-Host "LogDir: $LogDir"
if ($SourceDir) { Write-Host "SourceDir: $SourceDir" }
if (-not $Apply) { Write-Host "Dry run only. Add -Apply to make changes." }

Invoke-Step "Create runtime/data/log directories" {
  New-Item -ItemType Directory -Force -Path $RuntimeDir, $DataDir, $LogDir | Out-Null
}

if ($CreateUser) {
  Invoke-Step "Ensure local user $AccountName exists" {
    $existing = Get-LocalUser -Name $AccountName -ErrorAction SilentlyContinue
    if (-not $existing) {
      if (-not $GeneratePassword) {
        throw "Creating a user requires -GeneratePassword or a pre-created account."
      }
      $passwordText = New-RandomPassword
      $securePassword = ConvertTo-SecureString $passwordText -AsPlainText -Force
      New-LocalUser -Name $AccountName -Password $securePassword -PasswordNeverExpires -UserMayNotChangePassword | Out-Null
      $credentialDir = Split-Path -Parent $CredentialFile
      if ($credentialDir) { New-Item -ItemType Directory -Force -Path $credentialDir | Out-Null }
      $credential = New-Object System.Management.Automation.PSCredential(".\$AccountName", $securePassword)
      $credential | Export-Clixml -Path $CredentialFile
      Set-PrivateFileAcl -Path $CredentialFile
      Write-Host "[ok] Created $AccountName and wrote DPAPI-protected credential file."
    } else {
      Write-Host "[ok] User already exists."
    }
    try { & net user $AccountName /passwordreq:yes | Out-Null } catch { Write-Warning "Could not set password requirement for ${AccountName}: $($_.Exception.Message)" }
    $oldErrorActionPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = "Continue"
      & net localgroup Users $AccountName /add 2>$null | Out-Null
      & net localgroup Administrators $AccountName /delete 2>$null | Out-Null
    } finally {
      $ErrorActionPreference = $oldErrorActionPreference
    }
  }
}

if (Test-Path -LiteralPath $CredentialFile) {
  Invoke-Step "Restrict credential file ACL" {
    Set-PrivateFileAcl -Path $CredentialFile
  }
}

Invoke-Step "Set runtime/data/log ACLs for $AccountName" {
  Set-PrivateDirectoryAcl -Path $RuntimeDir -WorkerRights "RX"
  Set-PrivateDirectoryAcl -Path $DataDir -WorkerRights "M"
  Set-PrivateDirectoryAcl -Path $LogDir -WorkerRights "M"
}

if ($DenySourceAccess) {
  if (-not $SourceDir) {
    throw "-DenySourceAccess requires -SourceDir."
  }
  Invoke-Step "Deny $AccountName access to source checkout" {
    & icacls $SourceDir /deny "${AccountName}:(OI)(CI)RX" | Out-Null
  }
}

Write-Host "Done."
Write-Host "Run production from RuntimeDir, not from the development checkout, before using -DenySourceAccess."
