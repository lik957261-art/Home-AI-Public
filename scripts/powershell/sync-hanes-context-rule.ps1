param(
  [string[]]$WorkspacePath = @(),
  [string]$HanesTemplatePath = "",
  [switch]$SkipGlobalCodexAgents
)

$ErrorActionPreference = "Stop"

function Resolve-RepoRoot {
  $scriptDir = Split-Path -Parent $PSCommandPath
  return (Resolve-Path (Join-Path $scriptDir "..\..")).Path
}

function Read-Utf8File {
  param([string]$Path)
  return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Write-Utf8File {
  param([string]$Path, [string]$Content)
  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.Encoding]::UTF8)
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

function Ensure-ProjectPointer {
  param([string]$ProjectContextPath)
  if (-not (Test-Path $ProjectContextPath)) { return "missing" }
  $content = Read-Utf8File $ProjectContextPath
  if ($content -match "HANES_CONTEXT_LOADING\.md") { return "present" }
  $pointer = "## HANES Context Loading`r`n`r`n- Use `.agent-context/HANES_CONTEXT_LOADING.md` for cross-workspace context loading discipline. Keep startup context short; load detailed skills, docs, handoffs, archives, harness matrices, and large tool output only when the current task crosses that risk boundary.`r`n"
  Write-Utf8File $ProjectContextPath ($content.TrimEnd() + "`r`n`r`n" + $pointer)
  return "added"
}

function Ensure-GlobalCodexPointer {
  param([string]$AgentsPath)
  if (-not (Test-Path $AgentsPath)) { return "missing" }
  $content = Read-Utf8File $AgentsPath
  if ($content -match "Context and tool-output budget" -and $content -match "HANES_CONTEXT_LOADING\.md") {
    return "present"
  }
  $block = @"

### Context and tool-output budget

When a workspace provides `.agent-context/HANES_CONTEXT_LOADING.md`, treat it as
the cross-workspace context-loading rule. Keep startup context short, load
documents/skills/harnesses by risk boundary, and treat tool output as context
budget.

- Bound failing test output so assertion dumps, concatenated source bundles, and
  long logs do not enter the thread context; if a full log is needed, write it
  to a temporary ignored file and read only relevant line ranges.
- Bound search and read output with exact files, exact patterns, small slices,
  and `git diff --stat` before reading hunks; avoid broad context windows unless
  the surrounding lines are necessary.

"@
  $marker = "<!-- CODEGRAPH_START -->"
  if ($content.Contains($marker)) {
    $content = $content.Replace($marker, $block + $marker)
  } else {
    $content = $content.TrimEnd() + "`r`n" + $block
  }
  Write-Utf8File $AgentsPath $content
  return "added"
}

$repoRoot = Resolve-RepoRoot
$sourceHanes = if ($HanesTemplatePath) { [System.IO.Path]::GetFullPath($HanesTemplatePath) } else { Join-Path $repoRoot ".agent-context\HANES_CONTEXT_LOADING.md" }
if (-not (Test-Path $sourceHanes)) {
  throw "HANES template not found: $sourceHanes"
}

$targets = if ($WorkspacePath.Count) { $WorkspacePath } else { Default-WorkspacePaths }
$results = foreach ($workspace in $targets) {
  $full = [System.IO.Path]::GetFullPath($workspace)
  $agentContext = Join-Path $full ".agent-context"
  $hanesTarget = Join-Path $agentContext "HANES_CONTEXT_LOADING.md"
  $projectContext = Join-Path $agentContext "PROJECT_CONTEXT.md"
  if (-not (Test-Path $full)) {
    [pscustomobject]@{ WorkspacePath = $full; Status = "workspace_missing"; Hanes = $false; ProjectPointer = "missing" }
    continue
  }
  New-Item -ItemType Directory -Force -Path $agentContext | Out-Null
  if ([System.IO.Path]::GetFullPath($sourceHanes) -ne [System.IO.Path]::GetFullPath($hanesTarget)) {
    Copy-Item -LiteralPath $sourceHanes -Destination $hanesTarget -Force
  }
  $pointer = Ensure-ProjectPointer $projectContext
  [pscustomobject]@{
    WorkspacePath = $full
    Status = "synced"
    Hanes = (Test-Path $hanesTarget)
    ProjectPointer = $pointer
  }
}

$globalAgentsPath = Join-Path $env:USERPROFILE ".codex\AGENTS.md"
$globalStatus = if ($SkipGlobalCodexAgents) { "skipped" } else { Ensure-GlobalCodexPointer $globalAgentsPath }

$results
[pscustomobject]@{ WorkspacePath = $globalAgentsPath; Status = "global_agents"; Hanes = $true; ProjectPointer = $globalStatus }
