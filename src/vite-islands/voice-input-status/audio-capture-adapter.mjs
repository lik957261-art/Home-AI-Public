const VOICE_INPUT_AUDIO_CAPTURE_ADAPTER_VERSION = "20260703-vite-voice-audio-capture-adapter-v1";
const STREAMING_CHUNK_TARGET_MS = 300;
const DEFAULT_STREAMING_SAMPLE_RATE = 16000;
const MIN_STREAMING_SAMPLE_RATE = 8000;
const DEFAULT_MIME_TYPE_CANDIDATES = Object.freeze([
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
]);

function microphoneCaptureSupported(mediaDevices) {
  return typeof mediaDevices?.getUserMedia === "function";
}

function recorderCaptureSupported(recorderCtor) {
  return typeof recorderCtor === "function";
}

function streamingCaptureSupported(audioContextCtor) {
  return typeof audioContextCtor === "function";
}

function preferredRecordingMimeType(recorderCtor, candidates = DEFAULT_MIME_TYPE_CANDIDATES) {
  if (!recorderCaptureSupported(recorderCtor)) return "";
  if (typeof recorderCtor.isTypeSupported !== "function") return "";
  return candidates.find((type) => {
    try {
      return Boolean(recorderCtor.isTypeSupported(type));
    } catch (_error) {
      return false;
    }
  }) || "";
}

function normalizeStreamingSampleRate(serviceStatus = {}) {
  return Math.max(
    MIN_STREAMING_SAMPLE_RATE,
    Number(serviceStatus?.provider?.streaming?.sampleRate || DEFAULT_STREAMING_SAMPLE_RATE) || DEFAULT_STREAMING_SAMPLE_RATE,
  );
}

function streamingConfigured(serviceStatus = {}) {
  return Boolean(serviceStatus?.provider?.streaming?.configured);
}

function voiceAudioCaptureReadiness(options = {}) {
  const microphone = microphoneCaptureSupported(options.mediaDevices);
  const recorder = recorderCaptureSupported(options.recorderCtor);
  const streaming = streamingCaptureSupported(options.audioContextCtor);
  const mimeType = preferredRecordingMimeType(options.recorderCtor, options.mimeTypeCandidates);
  return Object.freeze({
    version: VOICE_INPUT_AUDIO_CAPTURE_ADAPTER_VERSION,
    microphone,
    recorder,
    streaming,
    ready: microphone && recorder,
    streamingReady: microphone && streaming,
    mimeType,
    sampleRate: normalizeStreamingSampleRate(options.serviceStatus),
    streamingConfigured: streamingConfigured(options.serviceStatus),
  });
}

function streamTracks(stream) {
  try {
    const audioTracks = stream?.getAudioTracks?.();
    if (Array.isArray(audioTracks) && audioTracks.length) return audioTracks;
    const tracks = stream?.getTracks?.();
    return Array.isArray(tracks) ? tracks : [];
  } catch (_error) {
    return [];
  }
}

function streamIsLive(stream) {
  return streamTracks(stream).some((track) => track && track.readyState !== "ended");
}

function stopStreamTracks(stream) {
  let stopped = 0;
  for (const track of streamTracks(stream)) {
    try {
      track?.stop?.();
      stopped += 1;
    } catch (_error) {}
  }
  return stopped;
}

function attachHeldMicrophoneStream(previousStream, nextStream, options = {}) {
  const changed = Boolean(previousStream && previousStream !== nextStream);
  const stoppedPrevious = changed ? stopStreamTracks(previousStream) : 0;
  for (const track of streamTracks(nextStream)) {
    try {
      if (track.__homeAiVoiceInputHoldBound) continue;
      track.__homeAiVoiceInputHoldBound = true;
      track.addEventListener?.("ended", () => {
        options.onEnded?.({
          stream: nextStream,
          track,
          lostAt: Number(options.now?.() || Date.now()) || Date.now(),
        });
      }, { once: true });
    } catch (_error) {}
  }
  return Object.freeze({
    stream: nextStream || null,
    live: streamIsLive(nextStream),
    stoppedPrevious,
  });
}

async function acquireMicrophoneStream(options = {}) {
  const mediaDevices = options.mediaDevices;
  if (!microphoneCaptureSupported(mediaDevices)) {
    const error = new Error("microphone_capture_unsupported");
    error.code = "microphone_capture_unsupported";
    throw error;
  }
  const stream = await mediaDevices.getUserMedia({ audio: true });
  return attachHeldMicrophoneStream(options.previousStream, stream, {
    onEnded: options.onEnded,
    now: options.now,
  }).stream;
}

function createRecordingSession(options = {}) {
  const RecorderCtor = options.recorderCtor;
  if (!recorderCaptureSupported(RecorderCtor)) {
    const error = new Error("recorder_capture_unsupported");
    error.code = "recorder_capture_unsupported";
    throw error;
  }
  if (!options.stream) {
    const error = new Error("recording_stream_required");
    error.code = "recording_stream_required";
    throw error;
  }
  const recorderOptions = options.mimeType ? { mimeType: options.mimeType } : undefined;
  const recorder = new RecorderCtor(options.stream, recorderOptions);
  const chunks = [];
  const session = {
    recorder,
    chunks,
    started: false,
    stopped: false,
    cancelled: false,
    start(timesliceMs) {
      session.started = true;
      recorder.start?.(timesliceMs);
      return session;
    },
    stop() {
      session.stopped = true;
      recorder.stop?.();
      return session;
    },
    cancel() {
      session.cancelled = true;
      if (recorder.state && recorder.state !== "inactive") recorder.stop?.();
      return session;
    },
  };
  recorder.ondataavailable = (event) => {
    const data = event?.data;
    if (data && Number(data.size || 0) > 0) {
      chunks.push(data);
      options.onData?.(data);
    }
  };
  recorder.onstop = () => {
    session.stopped = true;
    options.onStop?.(chunks.slice());
  };
  recorder.onerror = (event) => {
    options.onError?.(event?.error || event);
  };
  return session;
}

function bytesToBase64(bytes) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < input.length; index += 3) {
    const first = input[index];
    const second = index + 1 < input.length ? input[index + 1] : 0;
    const third = index + 2 < input.length ? input[index + 2] : 0;
    const triplet = (first << 16) | (second << 8) | third;
    output += alphabet[(triplet >> 18) & 63];
    output += alphabet[(triplet >> 12) & 63];
    output += index + 1 < input.length ? alphabet[(triplet >> 6) & 63] : "=";
    output += index + 2 < input.length ? alphabet[triplet & 63] : "=";
  }
  return output;
}

function downsampleToPcm16(input, sourceRate, targetRate) {
  const source = input instanceof Float32Array ? input : new Float32Array(input || []);
  const fromRate = Math.max(1, Number(sourceRate || targetRate || DEFAULT_STREAMING_SAMPLE_RATE) || DEFAULT_STREAMING_SAMPLE_RATE);
  const toRate = Math.max(MIN_STREAMING_SAMPLE_RATE, Number(targetRate || DEFAULT_STREAMING_SAMPLE_RATE) || DEFAULT_STREAMING_SAMPLE_RATE);
  const ratio = fromRate / toRate;
  const outputLength = Math.max(0, Math.floor(source.length / ratio));
  const bytes = new Uint8Array(outputLength * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.max(start + 1, Math.floor((index + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let cursor = start; cursor < end && cursor < source.length; cursor += 1) {
      sum += source[cursor];
      count += 1;
    }
    const sample = Math.max(-1, Math.min(1, count ? sum / count : 0));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return bytes;
}

function createStreamingBuffer(fields = {}) {
  return {
    buffer: [],
    bufferedSamples: 0,
    failed: false,
    sampleRate: Math.max(MIN_STREAMING_SAMPLE_RATE, Number(fields.sampleRate || DEFAULT_STREAMING_SAMPLE_RATE) || DEFAULT_STREAMING_SAMPLE_RATE),
    sequence: Number(fields.sequence || 0) || 0,
    voiceSessionId: String(fields.voiceSessionId || ""),
  };
}

function appendPcmToStreamingBuffer(streaming, pcmBytes) {
  if (!streaming || !pcmBytes?.length) return streaming;
  const bytes = pcmBytes instanceof Uint8Array ? pcmBytes : new Uint8Array(pcmBytes || []);
  if (!bytes.length) return streaming;
  streaming.buffer = Array.isArray(streaming.buffer) ? streaming.buffer : [];
  streaming.buffer.push(bytes);
  streaming.bufferedSamples = Math.max(0, Number(streaming.bufferedSamples || 0) + Math.floor(bytes.length / 2));
  return streaming;
}

function streamingTargetSamples(streaming) {
  const sampleRate = Math.max(MIN_STREAMING_SAMPLE_RATE, Number(streaming?.sampleRate || DEFAULT_STREAMING_SAMPLE_RATE) || DEFAULT_STREAMING_SAMPLE_RATE);
  return Math.max(1600, Math.floor((sampleRate * STREAMING_CHUNK_TARGET_MS) / 1000));
}

function streamingShouldFlush(streaming, options = {}) {
  if (!streaming || streaming.failed || streaming.chunkInFlight) return false;
  if (options.force) return Boolean(streaming.buffer?.length);
  return Number(streaming.bufferedSamples || 0) >= streamingTargetSamples(streaming);
}

function takeStreamingChunk(streaming) {
  if (!streaming?.buffer?.length) return null;
  const total = streaming.buffer.reduce((sum, chunk) => sum + chunk.length, 0);
  if (!total) return null;
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of streaming.buffer) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  streaming.buffer = [];
  streaming.bufferedSamples = 0;
  return merged;
}

function appendAudioFrameToStreamingBuffer(streaming, input, sourceRate) {
  const pcm = downsampleToPcm16(input, sourceRate, streaming?.sampleRate);
  appendPcmToStreamingBuffer(streaming, pcm);
  return Object.freeze({
    pcm,
    shouldFlush: streamingShouldFlush(streaming),
    bufferedSamples: Number(streaming?.bufferedSamples || 0),
  });
}

export {
  DEFAULT_MIME_TYPE_CANDIDATES,
  DEFAULT_STREAMING_SAMPLE_RATE,
  MIN_STREAMING_SAMPLE_RATE,
  STREAMING_CHUNK_TARGET_MS,
  VOICE_INPUT_AUDIO_CAPTURE_ADAPTER_VERSION,
  acquireMicrophoneStream,
  appendAudioFrameToStreamingBuffer,
  appendPcmToStreamingBuffer,
  attachHeldMicrophoneStream,
  bytesToBase64,
  createRecordingSession,
  createStreamingBuffer,
  downsampleToPcm16,
  microphoneCaptureSupported,
  normalizeStreamingSampleRate,
  preferredRecordingMimeType,
  recorderCaptureSupported,
  stopStreamTracks,
  streamIsLive,
  streamTracks,
  streamingCaptureSupported,
  streamingConfigured,
  streamingShouldFlush,
  streamingTargetSamples,
  takeStreamingChunk,
  voiceAudioCaptureReadiness,
};
