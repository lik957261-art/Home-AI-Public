param(
  [string[]]$WorkspacePath = @()
)

$ErrorActionPreference = "Stop"

function Read-Utf8File {
  param([string]$Path)
  return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Default-WorkspacePaths {
  $documents = Join-Path $env:USERPROFILE "Documents"
  $wardrobe = -join ([char[]](0x7537, 0x88C5, 0x8863, 0x6A71))
  $systemTools = -join ([char[]](0x7CFB, 0x7EDF, 0x5DE5, 0x5177))
  $finance = -join ([char[]](0x8D22, 0x52A1))
  return @(
    (Join-Path $documents "Agent"),
    (Join-Path $documents "codex-mobile-web"),
    (Join-Path $documents "Education"),
    (Join-Path $documents "email"),
    (Join-Path $documents "healthy"),
    (Join-Path $documents "Note"),
    (Join-Path $documents $wardrobe),
    (Join-Path $documents $systemTools),
    (Join-Path $documents $finance)
  )
}

function Test-Contains {
  param([string]$Path, [string]$Pattern)
  if (-not (Test-Path $Path)) { return $false }
  return (Read-Utf8File $Path) -match $Pattern
}

$targets = if ($WorkspacePath.Count) { $WorkspacePath } else { Default-WorkspacePaths }

foreach ($workspace in $targets) {
  $full = [System.IO.Path]::GetFullPath($workspace)
  $agentContext = Join-Path $full ".agent-context"
  $hanes = Join-Path $agentContext "HANES_CONTEXT_LOADING.md"
  $project = Join-Path $agentContext "PROJECT_CONTEXT.md"
  $hasWorkspace = Test-Path $full
  $hasHanes = Test-Path $hanes
  $hasBudget = Test-Contains $hanes "## Tool Output Budget"
  $hasPointer = Test-Contains $project "HANES_CONTEXT_LOADING\.md"
  $status = if (-not $hasWorkspace) {
    "WorkspaceMissing"
  } elseif ($hasHanes -and $hasBudget -and $hasPointer) {
    "OK"
  } else {
    "NeedsSync"
  }
  [pscustomobject]@{
    WorkspacePath = $full
    Status = $status
    HanesFile = $hasHanes
    ToolOutputBudget = $hasBudget
    ProjectPointer = $hasPointer
  }
}

$agentsPath = Join-Path $env:USERPROFILE ".codex\AGENTS.md"
$globalOk = (Test-Contains $agentsPath "HANES_CONTEXT_LOADING\.md") -and (Test-Contains $agentsPath "Context and tool-output budget")
[pscustomobject]@{
  WorkspacePath = $agentsPath
  Status = if ($globalOk) { "OK" } else { "NeedsSync" }
  HanesFile = $true
  ToolOutputBudget = $globalOk
  ProjectPointer = $globalOk
}
