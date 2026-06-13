# Voice Input Multi-ASR Benchmark And Pinyin Correction Plan

Status: execution plan. No user-facing default ASR backend change is implied
until the benchmark harness has production evidence.

## Goal

Home AI voice input needs better Chinese and Chinese-English mixed dictation
than a single Whisper large-v3-turbo path can reliably provide. The first
implementation goal is not to replace Whisper immediately. It is to install
and expose a bounded local comparison lane so the voice training surface can run
multiple ASR engines on the same short clip and compare output, latency, phrase
hits, correction hits, and user edits.

The first comparison set is:

- existing `whisper-large-v3-turbo`, current baseline on port `8001`;
- `funasr-local`, first candidate for Chinese dictation, punctuation, and
  hotword/context bias support;
- `sensevoice-local`, first candidate for Chinese-English mixed utterances and
  short low-latency local transcription;
- `fireredasr-local`, watch-list candidate for Mandarin, dialect/accent,
  code-switching, VAD, language-id, and punctuation after local install
  maturity is confirmed.

Only engines that pass local health and privacy checks should participate in a
comparison run. Missing optional engines must degrade to a per-engine
`unavailable` row instead of failing the whole voice input flow.

## Product Boundary

Multi-engine comparison is a Home AI host service capability, not a plugin
feature and not a system input method. The host owns:

- model installation and local service lifecycle;
- audio upload, temporary storage, retention, and deletion;
- transcript comparison and correction learning;
- selection of the engine used for final composer insertion.

Plugins and native composer surfaces must not call FunASR, SenseVoice,
FireRedASR, or Whisper directly. They receive only the final inserted text or
bridge events defined by the host voice-input protocol.

The normal send path remains single-result by default. The first user-facing
multi-engine surface is the `Voice Learning` / training mode because that mode
is explicitly for diagnosis and learning and can show multiple transcript
rows without disrupting ordinary chat.

## Deployment Shape

Use separate local services so one engine cannot crash or block another.

| Engine | Local label | Default port | Protocol | First role |
| --- | --- | ---: | --- | --- |
| Whisper large-v3-turbo | `com.hermesmobile.whisper-large-v3-turbo` | `8001` | OpenAI multipart `/v1/audio/transcriptions` | Baseline and fallback |
| FunASR | `com.hermesmobile.funasr-local` | `8002` | OpenAI multipart `/v1/audio/transcriptions` preferred | Chinese dictation candidate |
| SenseVoice | `com.hermesmobile.sensevoice-local` | `8003` | Home AI JSON or OpenAI multipart wrapper | Chinese-English mixed candidate |
| FireRedASR2S | `com.hermesmobile.fireredasr-local` | `8004` | Home AI JSON wrapper first | Watch-list candidate |

Every service must provide:

- `GET /health` returning bounded metadata: engine id, model id, loaded state,
  device, compute type, and last model error summary;
- `POST /v1/audio/transcriptions` when feasible, so the existing Home AI
  provider can reuse `openai-multipart`;
- no cloud upload;
- no request logging of raw audio or full transcript;
- temp audio under the service data directory, not under the source checkout;
- model files under the production service root and excluded from Git.

The installer scripts must be public-deployable. A fresh public install without
downloaded models should report clear missing-model diagnostics, not depend on
maintainer-private paths.

## Provider Registry Changes

The current `voice-input-asr-provider` supports one configured backend. The
multi-engine phase needs a registry shape:

```js
{
  defaultBackend: "whisper-large-v3-turbo",
  comparisonBackends: [
    {
      backend: "whisper-large-v3-turbo",
      protocol: "openai-multipart",
      url: "http://127.0.0.1:8001/v1/audio/transcriptions"
    },
    {
      backend: "funasr-local",
      protocol: "openai-multipart",
      url: "http://127.0.0.1:8002/v1/audio/transcriptions"
    },
    {
      backend: "sensevoice-local",
      protocol: "openai-multipart",
      url: "http://127.0.0.1:8003/v1/audio/transcriptions"
    }
  ]
}
```

Environment variables should remain simple:

- `HERMES_MOBILE_VOICE_INPUT_ASR_BACKEND` for the default insertion backend;
- `HERMES_MOBILE_VOICE_INPUT_ASR_URL` for the default insertion URL;
- `HERMES_MOBILE_VOICE_INPUT_COMPARE_BACKENDS` as a JSON array or compact
  comma list for training-mode comparison only;
- `HERMES_MOBILE_VOICE_INPUT_COMPARE_TIMEOUT_MS` with a bounded per-engine
  timeout;
- `HERMES_MOBILE_VOICE_INPUT_COMPARE_MAX_ENGINES`, default `3`.

The service API should expose a new internal method such as
`transcribeAudioWithComparison(input)` that:

1. runs the default backend first or in parallel with candidates;
2. runs optional candidates with bounded concurrency;
3. applies the same phrasebook hints to every engine where the protocol
   supports it;
4. applies the same post-ASR correction pipeline to every result;
5. returns a comparison receipt with no raw audio and no long full transcript
   persistence.

The ordinary `/api/voice-input/transcribe` route should keep returning one
final transcript unless the request explicitly asks for comparison and the
caller is the voice-learning surface.

## Benchmark Metrics

For each engine result store only bounded metadata in `voice_input_audit`:

- engine id and protocol;
- clip duration bucket, not raw audio;
- elapsed milliseconds;
- status: `ok`, `timeout`, `unavailable`, or `error`;
- transcript character count;
- language;
- punctuation count and CJK punctuation count;
- active phrasebook hit count;
- correction applied count;
- user selected/accepted flag when the learning surface records it;
- bounded diff summary counts after final sent text is available.

Do not store full transcripts in audit. The learning store may still record
bounded phrasebook terms and short correction pairs under the existing privacy
rules.

## Chinese Pinyin And Homophone Correction

Pinyin/homophone correction is required for Chinese voice input. It should be a
post-ASR correction layer independent from the ASR engine.

The first robust implementation should replace the current small hand-written
homophone map with a real pinyin/fuzzy-pinyin candidate generator. The rule is
not "rewrite anything that sounds similar." The rule is:

1. generate pinyin keys for active phrasebook entries, especially short Chinese
   names and terms;
2. generate pinyin keys for transcript spans of similar length;
3. consider a replacement only when the phrasebook term is active in the same
   actor/workspace/surface/plugin/thread scope;
4. require exact pinyin or explicitly allowed fuzzy pairs such as
   `wu -> wu`, `ping -> ping/ping2`, not broad semantic guesses;
5. auto-apply only to short, bounded spans with safe CJK boundaries;
6. never auto-apply inside numbers, dates, amounts, URLs, code, file paths,
   commands, or long paragraphs;
7. record low-confidence cases as suggestions or aliases first;
8. expose applied/suggested counts in the voice-learning receipt.

For a two-character active phrase such as a personal name, whole-utterance
rescue can be aggressive enough to fix `无凭。 -> 吴萍。` when the phrasebook
has enough support. In a longer sentence, replacement must require boundaries
and should avoid common idioms such as `无凭无据`.

## Engine-Specific Notes

### FunASR

Use FunASR first because it has a local OpenAI-compatible API path and Chinese
ASR/hotword positioning. The first deployment target should be a local service
on port `8002` that accepts the same multipart request shape as Whisper where
possible.

Acceptance criteria:

- health endpoint reports model loaded or a bounded missing-model error;
- transcribes a short Mandarin clip;
- accepts phrasebook hotword/context hints if exposed by the runtime;
- returns Chinese punctuation when the model/runtime supports it;
- fails independently from Whisper.

### SenseVoice

Use SenseVoice as the Chinese-English mixed candidate. It may be deployed
through FunASR, sherpa-onnx, or a thin Home AI wrapper, but Home AI should see a
stable local HTTP contract.

Acceptance criteria:

- health endpoint reports model loaded or a bounded missing-model error;
- transcribes a short Mandarin clip and a short mixed Chinese-English clip;
- preserves English product/tool words when phrasebook hints are available;
- fails independently from Whisper and FunASR.

### FireRedASR2S

Treat FireRedASR2S as a watch-list candidate until local install cost, model
size, Apple Silicon/CPU behavior, and service wrapper maturity are verified.
It should not block the first comparison deployment. Add it only after FunASR
and SenseVoice are stable.

## Execution Phases

### Phase 1: Install And Health-Smoke Candidate Services

1. Add public-safe service skeletons and installer scripts for FunASR and
   SenseVoice.
2. Install them on Mac production under
   `/Users/hermes-host/HermesMobile/services/`.
3. Keep launchd labels separate from the existing Whisper service.
4. Smoke `GET /health` for ports `8001`, `8002`, and `8003`.
5. Do not change the default Home AI insertion backend yet.

Current repo entry points for this phase:

- `services/funasr-local/` exposes the first FunASR OpenAI-compatible wrapper.
- `services/sensevoice-local/` exposes the first SenseVoice wrapper through
  FunASR `AutoModel`.
- `scripts/install-macos-local-asr-service.js --engine funasr --execute`
  installs or repairs `com.hermesmobile.funasr-local`.
- `scripts/install-macos-local-asr-service.js --engine sensevoice --execute`
  installs or repairs `com.hermesmobile.sensevoice-local`.
- `tests/local-asr-service-installer.test.js` guards the launchd labels,
  ports, service roots, and model-cache locations.

### Phase 2: Training-Mode Multi-Engine Comparison

1. Extend the ASR provider registry with comparison backend support.
2. Add a voice-learning-only comparison request path.
3. Show each engine's transcript, elapsed time, applied correction count, and
   phrasebook hits in the learning receipt.
4. Persist only bounded comparison metrics.
5. Keep ordinary chat insertion on the configured default backend.

Implementation contract:

- The frontend sends `comparison: true` only while `Voice Learning` mode is
  active.
- The normal Home AI composer voice path keeps returning and inserting one
  default transcript.
- In learning mode, the receipt displays all available engine rows, but the
  composer receives only the selected default backend text so the user can edit
  and Send one final training sample.
- The backend may return full per-engine transcripts to the current client
  response, but durable audit stores only bounded metrics such as character
  counts, elapsed time, correction counts, phrasebook-hit counts, and status.

### Phase 3: Pinyin Correction Upgrade

1. Add a pinyin candidate generator behind the correction service.
2. Backfill active phrasebook pinyin keys lazily or compute them at runtime.
3. Add tests for personal names, product terms, Chinese-English mixed terms,
   common idiom false positives, and structured-span rejection.
4. Apply the same correction layer to every ASR engine result.

### Phase 4: Default Backend Selection

Only after production comparison data exists, select a default policy:

- fastest acceptable engine for ordinary short dictation;
- highest-quality engine for explicit training/diagnostic runs;
- fallback to Whisper when candidate services are unavailable.

The policy should be configurable per deployment and should not be hard-coded
to the maintainer's Mac.

## Harness And Validation

This work is H1 once service installation, ASR routing, training-mode
comparison, or correction behavior changes. Required checks include:

- `node tests/voice-input-asr-provider.test.js`;
- `node tests/voice-input-correction-service.test.js`;
- `node tests/voice-input-service.test.js`;
- `node tests/voice-input-api-routes.test.js`;
- `node tests/architecture-refactor-boundary.test.js`;
- `node scripts/privacy-scan.js`;
- `git diff --check`;
- service syntax checks for any Python wrappers;
- production health smokes for every installed local ASR service;
- `/api/voice-input/status` and one comparison-mode smoke without storing raw
  audio in docs or handoff.

When a frontend learning receipt changes, add the relevant static/UI tests and
PWA visual evidence from the harness matrix.

## Source References

- FunASR: https://github.com/modelscope/FunASR
- FunASR OpenAI-compatible API docs: https://modelscope.github.io/FunASR/
- SenseVoice: https://github.com/FunAudioLLM/SenseVoice
- sherpa-onnx SenseVoice docs: https://k2-fsa.github.io/sherpa/onnx/sense-voice/index.html
- sherpa-onnx hotword note: https://k2-fsa.github.io/sherpa/onnx/hotwords/index.html
- FireRedASR2S: https://github.com/FireRedTeam/FireRedASR2S
