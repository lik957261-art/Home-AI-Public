# Home AI TTS

Last updated: 2026-06-22.

Home AI owns central local text-to-speech generation for host and plugin
workflows. The first consumer is the Music HiFi demo narration flow, but the
service is host-owned so future plugins can reuse the same synthesis,
persistence, deletion, and asset-serving contract.

## Model Decision

The preferred high-quality provider is CosyVoice through an external Python
command bridge. CosyVoice has Apache-2.0 code, strong
Chinese/English/multilingual coverage, instructions for emotion/speed/volume,
and production-oriented pronunciation controls. The current upstream
recommendation is Fun-CosyVoice3-0.5B for better content consistency,
speaker similarity, and prosody naturalness. This is the target provider for
Music HiFi narration.

MeloTTS remains a lighter backup model path because it has MIT licensing,
documented Chinese mixed-English support, and documented CPU real-time
inference, but it is no longer the preferred path for the professional Music
demo narration use case.

The zero-dependency fallback remains macOS `say` plus `afconvert`. It is
available on the Mac production target and supports deterministic local
generation, but it is only a failure fallback. It is not the voice-quality
target for Music demo narration.

Piper remains a lightweight ONNX option with MIT code and Chinese voices, but
its Chinese and mixed-English naturalness is expected to be below MeloTTS for
Music demo narration. ChatTTS is not a default provider because its code is
AGPLv3+ and its model license is CC BY-NC 4.0; that is not a good default for a
host service that may later be reused beyond personal local experiments.

References checked during this selection:

- Piper: `https://github.com/rhasspy/piper`
- Piper voices: `https://github.com/rhasspy/piper/blob/master/VOICES.md`
- ChatTTS: `https://github.com/2noise/ChatTTS`
- CosyVoice: `https://github.com/FunAudioLLM/CosyVoice`
- MeloTTS: `https://github.com/myshell-ai/MeloTTS`

## Service Boundary

Business logic lives in `adapters/home-ai-tts-service.js`.
HTTP glue lives in `server-routes/home-ai-tts-api-routes.js` and is wired
through `server-routes/mobile-api-composition.js`.

The service owns local TTS provider selection, synthesis, deterministic asset
ids, SQLite metadata persistence, audio file persistence, Roon watched-folder
copy, asset deletion, and batch Music demo-plan narration generation.

Music owns demo plan persistence, track-level narration references, Roon
local-library mapping from narration file to playable Roon item, and demo
playback sequencing.

Home AI must not assume the Roon Extension API can push an arbitrary temporary
file or stream. The first Roon-compatible path is a watched local folder named
`HomeAI Narration`; Music maps generated assets after Roon scans that folder.
Until the mapping exists, Music should show a `narration_pending_mapping` state
and skip playback of that narration asset.

## Storage

Default paths are derived from `HERMES_WEB_DATA_DIR` or
`HERMES_MOBILE_DATA_DIR`:

```text
<data-dir>/tts/home-ai-tts.sqlite
<data-dir>/tts/assets/<asset_id>.<format>
<data-dir>/tts/profiles/<workspace_id>/<profile_id>.wav
<data-dir>/tts/roon-watched/HomeAI Narration/<asset_id>.<format>
```

Runtime overrides:

- `HOMEAI_TTS_DATA_DIR`
- `HOMEAI_TTS_ASSET_DIR`
- `HOMEAI_TTS_DB_PATH`
- `HOMEAI_TTS_PROFILE_DIR`
- `HOMEAI_TTS_ROON_WATCHED_FOLDER`
- `HOMEAI_TTS_MACOS_VOICE`
- `HOMEAI_TTS_PROVIDER`
- `HOMEAI_TTS_COSYVOICE_PYTHON`
- `HOMEAI_TTS_COSYVOICE_SCRIPT`
- `HOMEAI_TTS_COSYVOICE_REPO_DIR`
- `HOMEAI_TTS_COSYVOICE_MODEL_DIR`
- `HOMEAI_TTS_COSYVOICE_CACHE_DIR`
- `HOMEAI_TTS_COSYVOICE_PROMPT_AUDIO`
- `HOMEAI_TTS_COSYVOICE_PROMPT_TEXT`
- `HOMEAI_TTS_COSYVOICE_MODE`
- `HOMEAI_TTS_COSYVOICE_INSTRUCTION`
- `HOMEAI_TTS_COSYVOICE_SPEAKER`
- `HOMEAI_TTS_COSYVOICE_TIMEOUT_MS`

Set `HOMEAI_TTS_PROVIDER=cosyvoice` to use the CosyVoice command bridge. The
default bridge script is `scripts/homeai-cosyvoice-synthesize.py`, but
production should normally set `HOMEAI_TTS_COSYVOICE_SCRIPT` to the deployed
copy under the Home AI app root and `HOMEAI_TTS_COSYVOICE_PYTHON` to the
production-owned CosyVoice virtual environment.

Recommended high-quality mode:

```text
HOMEAI_TTS_PROVIDER=cosyvoice
HOMEAI_TTS_COSYVOICE_MODE=zero_shot
HOMEAI_TTS_COSYVOICE_MODEL_DIR=<CosyVoice repo>/pretrained_models/Fun-CosyVoice3-0.5B
HOMEAI_TTS_COSYVOICE_CACHE_DIR=<production-owned CosyVoice cache dir>
HOMEAI_TTS_COSYVOICE_PROMPT_AUDIO=<bounded host prompt wav>
HOMEAI_TTS_COSYVOICE_PROMPT_TEXT=<verbatim text spoken in the prompt wav>
```

CosyVoice3 zero-shot mode requires a prompt audio file plus its text. The
prompt text must include CosyVoice3's `<|endofprompt|>` marker; the Home AI TTS
Profile API appends the marker when a browser-created profile omits it.

Use a short, rights-cleared host prompt recorded for Home AI narration. Example
prompt assets from upstream are acceptable for smoke tests, but production
narration quality should use a stable Home AI-owned prompt voice.

Production launchd should set `HOMEAI_TTS_COSYVOICE_CACHE_DIR` to a directory
owned by the listener runtime user. This keeps ModelScope, Hugging Face, and
XDG model caches out of an interactive operator account and makes manual smoke
tests match background service execution.

The SQLite tables are `home_ai_tts_assets` and `home_ai_tts_profiles`. Asset
metadata JSON can be queried by `plugin_id` and `demo_id`. TTS Profiles are
workspace-scoped and store bounded metadata plus the prompt wav checksum and
transcript; the prompt wav file lives under the configured profile directory.
Raw secrets, access keys, cookies, launch tokens, and private plugin payloads
must not be stored in TTS metadata.

Asset ids are generated from a SHA-256 cache key over text hash, voice,
language, format, loudness, purpose, and any resolved TTS Profile cache key.
That profile cache key includes the profile id, prompt text hash, prompt wav
checksum, mode, speaker, instruction, and update timestamp so replacing a voice
prompt cannot reuse old audio. File names use only generated ids plus the output
extension. User text never becomes a file name.

When synthesis requests use the default `voice=zh_hifi_host`, Home AI first
checks whether the request workspace has a default TTS Profile. A request can
also name an exact profile id in `voice`. Plugins must choose a profile id or
the default voice; they must not pass raw prompt audio paths, model prompts, or
provider internals.

The default target loudness is `-18 LUFS`. The current CosyVoice and macOS
providers do not normalize loudness yet; the requested loudness is persisted as
metadata and clamps to `[-30, -10]`. A follow-up should add normalization with
`ffmpeg` or an equivalent local audio processor.

## HTTP API

All routes require the normal Home AI browser/API Access Key via
`X-Hermes-Web-Key` or the same-origin cookie. The route clamps the requested
workspace with `requireWorkspaceAccess` and stores that workspace id in asset
metadata.

```http
POST /api/v1/home-ai/tts/synthesize
GET  /api/v1/home-ai/tts/profiles
POST /api/v1/home-ai/tts/profiles
POST /api/v1/home-ai/tts/profiles/:profile_id/default
POST /api/v1/home-ai/tts/profiles/:profile_id/delete
GET  /api/v1/home-ai/tts/assets?plugin_id=music&demo_id=<demo>
GET  /api/v1/home-ai/tts/assets/:asset_id
GET  /api/v1/home-ai/tts/assets/:asset_id/file
POST /api/v1/home-ai/tts/assets/:asset_id/delete
POST /api/v1/home-ai/tts/demo-plans/narrations
```

TTS Profile create request:

```json
{
  "profile_id": "zh_hifi_documentary_host_v1",
  "label": "Documentary Host",
  "prompt_text": "This must be the exact text spoken in the prompt wav.",
  "audio_base64": "data:audio/wav;base64,...",
  "set_default": true
}
```

The browser UI exposes this through the top-right three-dot menu as
`TTS Profile`. It can record a short PCM wav prompt locally or upload a wav
file, then sends the bounded wav as base64 JSON to the profile API. Recording is
for voice prompt capture only; ASR transcription is not reused because the
CosyVoice prompt transcript must match the prompt audio exactly.

Single synthesis request:

```json
{
  "text": "下一首主要听空间定位和中高频耐听度。",
  "voice": "zh_hifi_host",
  "language": "zh-CN",
  "format": "wav",
  "target_loudness_lufs": -18,
  "purpose": "music_demo_narration",
  "metadata": {
    "plugin_id": "music",
    "demo_id": "demo_1",
    "track_index": 2,
    "script_type": "before_track"
  }
}
```

Successful response:

```json
{
  "ok": true,
  "asset_id": "tts_...",
  "duration_seconds": 18.2,
  "mime_type": "audio/wav",
  "file_url": "/api/v1/home-ai/tts/assets/tts_.../file",
  "local_path": "...",
  "roon_watched_path": "...",
  "checksum": "...",
  "created_at": "..."
}
```

Batch Music demo-plan request:

```json
{
  "demo_id": "demo_1",
  "voice": "zh_hifi_host",
  "language": "zh-CN",
  "format": "wav",
  "tracks": [
    {
      "index": 2,
      "intro_script": "下一首主要听空间定位和中高频耐听度。",
      "transition_note": "音量稍微降低。",
      "listen_points": ["空间定位", "中高频耐听度"],
      "recommended_volume": "45%"
    }
  ]
}
```

Batch response shape for Music:

```json
{
  "ok": true,
  "demo_id": "demo_1",
  "assets": [
    {
      "index": 2,
      "status": "ready",
      "before_track_asset_id": "tts_...",
      "before_track_file_url": "/api/v1/home-ai/tts/assets/tts_.../file",
      "duration_seconds": 18.2
    }
  ]
}
```

## Validation

Focused checks:

```bash
node tests/home-ai-tts-service.test.js
node tests/home-ai-tts-api-routes.test.js
node tests/mobile-api-dispatcher.test.js
node tests/task-list-ui.test.js
node tests/static-cache-version-harness.test.js
node tests/architecture-refactor-boundary.test.js
node tests/architecture-code-test-harness-map.test.js
git diff --check
```
