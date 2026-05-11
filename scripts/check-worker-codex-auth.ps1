param(
  [string]$WorkerRunAsScript = "C:\ProgramData\HermesMobile\gateway-worker\run-as-worker.ps1",
  [string]$WorkerDirectory = "C:\ProgramData\HermesMobile\gateway-worker",
  [string[]]$Profiles = @("lowgw1", "lowgw2", "lowgw3", "lowgw4", "lowgw5", "lowgw6", "lowgw7", "lowgw8", "lowgw9", "lowgw10"),
  [switch]$RequireUniqueRefreshTokens
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $WorkerRunAsScript)) {
  throw "Missing worker runner: $WorkerRunAsScript"
}
if (-not (Test-Path -LiteralPath $WorkerDirectory)) {
  throw "Missing worker directory: $WorkerDirectory"
}

$profileList = ($Profiles | ForEach-Object { $_.Trim() } | Where-Object { $_ }) -join ","
$pyPath = Join-Path $WorkerDirectory "check-codex-auth-fingerprints.py"
$childPath = Join-Path $WorkerDirectory "check-codex-auth-fingerprints-child.ps1"
$pyBody = @'
import base64
import datetime
import hashlib
import json
import os
import pathlib
import sys

profiles = [p for p in os.environ.get("HERMES_CHECK_PROFILES", "").split(",") if p]
require_unique = os.environ.get("HERMES_REQUIRE_UNIQUE_REFRESH_TOKENS") == "1"
seen = {}
failed = False

for profile in profiles:
    path = pathlib.Path(f"/home/hermes/.hermes/profiles/{profile}/auth.json")
    if not path.exists():
        print(f"{profile} missing-auth")
        failed = True
        continue
    try:
        data = json.loads(path.read_text())
    except Exception as exc:
        print(f"{profile} invalid-auth {type(exc).__name__}")
        failed = True
        continue
    entry = (data.get("credential_pool", {}).get("openai-codex") or [{}])[0]
    refresh = entry.get("refresh_token") or ""
    access = entry.get("access_token") or ""
    fingerprint = hashlib.sha256(refresh.encode()).hexdigest()[:12] if refresh else "no-refresh"
    exp_text = "no-access-exp"
    try:
        claims = json.loads(base64.urlsafe_b64decode(access.split(".")[1] + "==="))
        exp = claims.get("exp")
        if exp:
            exp_text = datetime.datetime.fromtimestamp(exp, datetime.timezone.utc).isoformat()
    except Exception:
        pass
    status = entry.get("last_status")
    print(f"{profile} refresh={fingerprint} status={status} access_exp={exp_text}")
    if refresh:
        seen.setdefault(fingerprint, []).append(profile)
    else:
        failed = True

duplicates = {fp: names for fp, names in seen.items() if len(names) > 1}
for fp, names in duplicates.items():
    print(f"duplicate-refresh {fp} profiles={','.join(names)}")
if require_unique and duplicates:
    failed = True

sys.exit(1 if failed else 0)
'@
$childBody = @"
`$ErrorActionPreference = "Stop"
`$env:HERMES_CHECK_PROFILES = "$profileList"
`$env:HERMES_REQUIRE_UNIQUE_REFRESH_TOKENS = "$(if ($RequireUniqueRefreshTokens) { "1" } else { "0" })"
`$env:WSLENV = "HERMES_CHECK_PROFILES/u:HERMES_REQUIRE_UNIQUE_REFRESH_TOKENS/u"
wsl.exe -d HermesGatewayWorker -u hermes -- python3 /mnt/c/ProgramData/HermesMobile/gateway-worker/check-codex-auth-fingerprints.py
exit `$LASTEXITCODE
"@

$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($pyPath, $pyBody, $utf8)
[System.IO.File]::WriteAllText($childPath, $childBody, $utf8)

$previousErrorActionPreference = $ErrorActionPreference
try {
  $ErrorActionPreference = "Continue"
  $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WorkerRunAsScript -ChildScript $childPath 2>&1
  $exitCode = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $previousErrorActionPreference
}
foreach ($line in $output) {
  $text = [string]$line
  if ($text -match '^Worker child failed with exit code ') { continue }
  if ($text -match '^At .+run-as-worker\.ps1:') { continue }
  if ($text -match '^\+ +') { continue }
  if ($text -match '^\s+\+ CategoryInfo\s+:') { continue }
  if ($text -match '^\s+\+ FullyQualifiedErrorId\s+:') { continue }
  Write-Output $text
}
exit $exitCode
