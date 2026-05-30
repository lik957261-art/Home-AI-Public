param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$FilePath,

    [Parameter()]
    [string[]]$ArgumentList = @(),

    [Parameter()]
    [string]$WorkingDirectory = "",

    [Parameter()]
    [string]$RedirectStandardOutput = "",

    [Parameter()]
    [string]$RedirectStandardError = "",

    [Parameter()]
    [switch]$Wait,

    [Parameter()]
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

$startInfo = @{
    FilePath = $FilePath
    WindowStyle = "Hidden"
}

if ($ArgumentList.Count -gt 0) {
    $startInfo.ArgumentList = $ArgumentList
}

if ($WorkingDirectory) {
    $startInfo.WorkingDirectory = $WorkingDirectory
}

if ($RedirectStandardOutput) {
    $startInfo.RedirectStandardOutput = $RedirectStandardOutput
}

if ($RedirectStandardError) {
    $startInfo.RedirectStandardError = $RedirectStandardError
}

if ($Wait) {
    $startInfo.Wait = $true
}

if ($PassThru) {
    $startInfo.PassThru = $true
}

Start-Process @startInfo
