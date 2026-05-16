param(
  [Parameter(Mandatory = $true)]
  [string]$AudioPath,
  [string]$DistroName = "HermesGatewayWorker",
  [string]$WorkerLinuxUser = "hermes",
  [string]$Model = "base",
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

function Invoke-FastWhisperServiceTranscription {
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
      throw "Fast Whisper V3 service returned HTTP $([int]$response.StatusCode): $body"
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
      model = "large-v3"
      provider = "fast-whisper-v3-service"
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
    $serviceResult = Invoke-FastWhisperServiceTranscription -TargetAudioPath $AudioPath -TargetServiceUrl $effectiveServiceUrl -TargetLanguage $Language -TargetTimeoutSeconds $TimeoutSeconds
    $serviceResult | ConvertTo-Json -Depth 8 -Compress | Write-Output
    return
  } catch {
    if ($RequireService -or $ServiceUrl) {
      throw
    }
    Write-Error -ErrorAction Continue "Fast Whisper V3 service unavailable, falling back to worker STT: $($_.Exception.Message)"
  }
}

$pythonPath = "/opt/hermes-gateway-runtime/venv/bin/python"
$audioWslPath = Convert-ToWslPath -WindowsPath $AudioPath
$tempPython = Join-Path ([System.IO.Path]::GetTempPath()) ("hermes-reading-transcribe-{0}.py" -f ([guid]::NewGuid().ToString("N")))
$pythonWslPath = Convert-ToWslPath -WindowsPath $tempPython
$encoding = New-Object System.Text.UTF8Encoding($false)

$python = @'
import json
import os
import sys
import time

try:
    from faster_whisper import WhisperModel
except Exception as exc:
    print(json.dumps({"ok": False, "error": "missing faster_whisper: " + str(exc)}, ensure_ascii=False))
    raise SystemExit(2)

audio_path = os.environ.get("HERMES_READING_AUDIO_PATH", "")
model_name = os.environ.get("HERMES_READING_STT_MODEL", "base") or "base"
language_raw = (os.environ.get("HERMES_READING_LANGUAGE", "auto") or "auto").strip()
language = None if language_raw.lower() in {"", "auto", "detect", "none", "null"} else language_raw
if language in {"zh-CN", "zh_CN", "cn", "chinese"}:
    language = "zh"
elif language in {"en-US", "en_GB", "en-GB", "english"}:
    language = "en"

if not audio_path or not os.path.exists(audio_path):
    print(json.dumps({"ok": False, "error": "audio file not found in worker distro"}, ensure_ascii=False))
    raise SystemExit(3)

started = time.time()
model = WhisperModel(model_name, device="cpu", compute_type="int8")
kwargs = {"vad_filter": True}
if language:
    kwargs["language"] = language
segments, info = model.transcribe(audio_path, **kwargs)
rows = []
parts = []
for segment in segments:
    text = (segment.text or "").strip()
    if not text:
        continue
    rows.append({"start": round(float(segment.start), 2), "end": round(float(segment.end), 2), "text": text})
    parts.append(text)

print(json.dumps({
    "ok": True,
    "text": "\n".join(parts),
    "segments": rows,
    "language": getattr(info, "language", language or ""),
    "duration": round(float(getattr(info, "duration", 0.0) or 0.0), 2),
    "elapsedSeconds": round(time.time() - started, 2),
    "model": model_name,
}, ensure_ascii=False))
'@

[System.IO.File]::WriteAllText($tempPython, $python, $encoding)

$oldWslEnv = $env:WSLENV
$env:HERMES_READING_AUDIO_PATH = $audioWslPath
$env:HERMES_READING_STT_MODEL = $Model
$env:HERMES_READING_LANGUAGE = $Language
$wslEnvParts = @($oldWslEnv, "HERMES_READING_AUDIO_PATH/u:HERMES_READING_STT_MODEL/u:HERMES_READING_LANGUAGE/u") |
  Where-Object { $_ } |
  ForEach-Object { $_.Trim(":") } |
  Where-Object { $_ }
$env:WSLENV = $wslEnvParts -join ":"

try {
  $output = & wsl.exe -d $DistroName -u $WorkerLinuxUser -- env `
    HOME="/home/$WorkerLinuxUser" `
    HERMES_HOME="/home/$WorkerLinuxUser/.hermes" `
    PYTHONPATH="/opt/hermes-gateway-runtime/official-clean" `
    HF_HUB_OFFLINE="1" `
    $pythonPath $pythonWslPath 2>&1 | ForEach-Object { $_.ToString() }
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "Reading transcription failed with exit code $exitCode. $($output -join "`n")"
  }
  $output | ForEach-Object { Write-Output $_ }
} finally {
  if ($null -eq $oldWslEnv) {
    Remove-Item Env:\WSLENV -ErrorAction SilentlyContinue
  } else {
    $env:WSLENV = $oldWslEnv
  }
  Remove-Item Env:\HERMES_READING_AUDIO_PATH -ErrorAction SilentlyContinue
  Remove-Item Env:\HERMES_READING_STT_MODEL -ErrorAction SilentlyContinue
  Remove-Item Env:\HERMES_READING_LANGUAGE -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $tempPython -Force -ErrorAction SilentlyContinue
}
