param(
  [Parameter(Mandatory = $true)]
  [string]$AudioPath,
  [string]$DistroName = "HermesGatewayWorker",
  [string]$WorkerLinuxUser = "hermes",
  [string]$Model = "large-v3-turbo",
  [string]$Language = "auto",
  [int]$TimeoutSeconds = 240,
  [string]$ServiceUrl = $env:HERMES_READING_TRANSCRIBE_URL,
  [switch]$DisableService,
  [switch]$RequireService
)

$ErrorActionPreference = "Stop"

function Convert-ToWslPath {
  param([string]$WindowsPath)
  $resolved = [System.IO.Path]::GetFullPath($WindowsPath)
  if ($resolved -notmatch '^([A-Za-z]):\\(.*)$') {
    return $resolved.Replace('\', '/')
  }
  $drive = $Matches[1].ToLowerInvariant()
  $rest = $Matches[2].Replace('\', '/')
  return "/mnt/$drive/$rest"
}

if (-not (Test-Path -LiteralPath $AudioPath)) {
  throw "Audio file not found: $AudioPath"
}

function Invoke-WhisperLargeV3TurboServiceTranscription {
  param(
    [string]$TargetAudioPath,
    [string]$TargetServiceUrl,
    [string]$TargetLanguage,
    [int]$TargetTimeoutSeconds
  )

  Add-Type -AssemblyName System.Net.Http
  $client = [System.Net.Http.HttpClient]::new()
  $content = $null
  $stream = $null
  try {
    $client.Timeout = [TimeSpan]::FromSeconds([Math]::Max(5, $TargetTimeoutSeconds))
    $content = [System.Net.Http.MultipartFormDataContent]::new()
    $stream = [System.IO.File]::OpenRead($TargetAudioPath)
    $fileContent = [System.Net.Http.StreamContent]::new($stream)
    $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/octet-stream")
    $content.Add($fileContent, "file", [System.IO.Path]::GetFileName($TargetAudioPath))
    $content.Add([System.Net.Http.StringContent]::new("json"), "response_format")
    $normalizedLanguage = if ($TargetLanguage) { $TargetLanguage.Trim() } else { "auto" }
    if ($normalizedLanguage -and $normalizedLanguage -notmatch '^(?i:auto|detect|none|null)$') {
      if ($normalizedLanguage -match '^(?i:zh-CN|zh_CN|cn|chinese)$') {
        $normalizedLanguage = "zh"
      } elseif ($normalizedLanguage -match '^(?i:en-US|en_GB|en-GB|english)$') {
        $normalizedLanguage = "en"
      }
      $content.Add([System.Net.Http.StringContent]::new($normalizedLanguage), "language")
    }

    $started = Get-Date
    $response = $client.PostAsync($TargetServiceUrl, $content).GetAwaiter().GetResult()
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if (-not $response.IsSuccessStatusCode) {
      throw "Whisper large v3 turbo service returned HTTP $([int]$response.StatusCode): $body"
    }
    $parsed = $body | ConvertFrom-Json
    $segments = @()
    foreach ($segment in @($parsed.segments)) {
      if ($null -eq $segment) { continue }
      $segmentStart = if ($null -ne $segment.start) { [double]$segment.start } else { 0 }
      $segmentEnd = if ($null -ne $segment.end) { [double]$segment.end } else { 0 }
      $segmentText = if ($null -ne $segment.text) { [string]$segment.text } else { "" }
      $segments += [ordered]@{
        start = [Math]::Round($segmentStart, 2)
        end = [Math]::Round($segmentEnd, 2)
        text = $segmentText
      }
    }
    $elapsed = ((Get-Date) - $started).TotalSeconds
    $duration = if ($null -ne $parsed.duration) { [double]$parsed.duration } else { 0 }
    $text = if ($null -ne $parsed.text) { [string]$parsed.text } else { "" }
    $language = if ($null -ne $parsed.language) { [string]$parsed.language } else { "" }
    return [ordered]@{
      ok = $true
      text = $text
      segments = $segments
      language = $language
      duration = [Math]::Round($duration, 2)
      elapsedSeconds = [Math]::Round($elapsed, 2)
      model = "large-v3-turbo"
      provider = "whisper-large-v3-turbo-service"
    }
  } finally {
    if ($content) { $content.Dispose() }
    if ($stream) { $stream.Dispose() }
    if ($client) { $client.Dispose() }
  }
}

$defaultServiceUrl = "http://127.0.0.1:8001/v1/audio/transcriptions"
$effectiveServiceUrl = if ($ServiceUrl) { $ServiceUrl } else { $defaultServiceUrl }
if (-not $DisableService -and $effectiveServiceUrl) {
  try {
    $serviceResult = Invoke-WhisperLargeV3TurboServiceTranscription -TargetAudioPath $AudioPath -TargetServiceUrl $effectiveServiceUrl -TargetLanguage $Language -TargetTimeoutSeconds $TimeoutSeconds
    $serviceResult | ConvertTo-Json -Depth 8 -Compress | Write-Output
    return
  } catch {
    throw
  }
}
throw "Whisper large v3 turbo service is required for reading transcription."
