param(
  [Parameter(Mandatory = $true)]
  [string]$WorkspacePath,

  [string]$ProjectName = "",

  [string]$HanesTemplatePath = ""
)

$ErrorActionPreference = "Stop"

function Resolve-RepoRoot {
  $scriptDir = Split-Path -Parent $PSCommandPath
  return (Resolve-Path (Join-Path $scriptDir "..\..")).Path
}

function Normalize-PathText {
  param([string]$PathText)
  return [System.IO.Path]::GetFullPath($PathText)
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

function Ensure-HanesPointer {
  param([string]$ProjectContextPath)
  $pointer = "- Use `.agent-context/HANES_CONTEXT_LOADING.md` for cross-workspace context loading discipline. Keep startup context short; load detailed skills, docs, handoffs, archives, harness matrices, and large tool output only when the current task crosses that risk boundary."
  $content = if (Test-Path $ProjectContextPath) { Read-Utf8File $ProjectContextPath } else { "" }
  if ($content -match "HANES_CONTEXT_LOADING\.md") { return $false }
  $section = "## HANES Context Loading`r`n`r`n$pointer`r`n"
  $next = if ([string]::IsNullOrWhiteSpace($content)) { $section } else { $content.TrimEnd() + "`r`n`r`n" + $section }
  Write-Utf8File $ProjectContextPath $next
  return $true
}

$repoRoot = Resolve-RepoRoot
$workspace = Normalize-PathText $WorkspacePath
$agentContext = Join-Path $workspace ".agent-context"
$projectContext = Join-Path $agentContext "PROJECT_CONTEXT.md"
$handoff = Join-Path $agentContext "HANDOFF.md"
$sourceHanes = if ($HanesTemplatePath) {
  Normalize-PathText $HanesTemplatePath
} else {
  Join-Path $repoRoot ".agent-context\HANES_CONTEXT_LOADING.md"
}

if (-not (Test-Path $workspace)) {
  New-Item -ItemType Directory -Force -Path $workspace | Out-Null
}
New-Item -ItemType Directory -Force -Path $agentContext | Out-Null

if (Test-Path $sourceHanes) {
  Copy-Item -LiteralPath $sourceHanes -Destination (Join-Path $agentContext "HANES_CONTEXT_LOADING.md") -Force
}

if (-not (Test-Path $projectContext)) {
  $name = if ($ProjectName) { $ProjectName } else { Split-Path -Leaf $workspace }
  $body = @"
# $name Project Context

## Workspace Identity

- Path: `$workspace`
- This workspace uses file-based shared context for future Codex continuity.

"@
  Write-Utf8File $projectContext $body
}

$pointerAdded = Ensure-HanesPointer $projectContext

if (-not (Test-Path $handoff)) {
  $body = @"
# Current Handoff

## Current State

- Workspace initialized at $(Get-Date -Format "yyyy-MM-dd HH:mm:ss").
- Use `.agent-context/PROJECT_CONTEXT.md` and `.agent-context/HANDOFF.md` for compact current context.
- Use `.agent-context/HANES_CONTEXT_LOADING.md` for context-loading and tool-output budget rules.

"@
  Write-Utf8File $handoff $body
}

[pscustomobject]@{
  WorkspacePath = $workspace
  AgentContext = Test-Path $agentContext
  Hanes = Test-Path (Join-Path $agentContext "HANES_CONTEXT_LOADING.md")
  ProjectContext = Test-Path $projectContext
  Handoff = Test-Path $handoff
  PointerAdded = $pointerAdded
}
