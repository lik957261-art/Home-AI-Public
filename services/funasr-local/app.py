import os
import base64
import subprocess
import tempfile
import threading
import time
import wave
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse

try:
    from funasr import AutoModel
except Exception:
    AutoModel = None

try:
    import imageio_ffmpeg
except Exception:
    imageio_ffmpeg = None

try:
    import numpy as np
except Exception:
    np = None


SERVICE_ID = os.getenv("LOCAL_ASR_SERVICE_ID", "funasr-local")
DEFAULT_MODEL = os.getenv("FUNASR_MODEL", "paraformer-zh")
DEFAULT_VAD_MODEL = os.getenv("FUNASR_VAD_MODEL", "fsmn-vad")
DEFAULT_PUNC_MODEL = os.getenv("FUNASR_PUNC_MODEL", "ct-punc")
STREAMING_MODEL = os.getenv("FUNASR_STREAMING_MODEL", "paraformer-zh-streaming")
STREAMING_SAMPLE_RATE = int(os.getenv("FUNASR_STREAMING_SAMPLE_RATE", "16000"))
STREAMING_CHUNK_SIZE = [
    int(part.strip() or "0")
    for part in os.getenv("FUNASR_STREAMING_CHUNK_SIZE", "0,5,2").split(",")[:3]
]
while len(STREAMING_CHUNK_SIZE) < 3:
    STREAMING_CHUNK_SIZE.append(0)
STREAMING_ENCODER_LOOK_BACK = int(os.getenv("FUNASR_STREAMING_ENCODER_LOOK_BACK", "4"))
STREAMING_DECODER_LOOK_BACK = int(os.getenv("FUNASR_STREAMING_DECODER_LOOK_BACK", "1"))
STREAMING_MAX_SECONDS = int(os.getenv("FUNASR_STREAMING_MAX_SECONDS", "45"))
DEVICE = os.getenv("FUNASR_DEVICE", "cpu")
BATCH_SIZE_S = int(os.getenv("FUNASR_BATCH_SIZE_S", "60"))
MERGE_VAD = os.getenv("FUNASR_MERGE_VAD", "1").strip().lower() not in {"0", "false", "no", "off"}
MERGE_LENGTH_S = int(os.getenv("FUNASR_MERGE_LENGTH_S", "15"))
TMP_DIR = os.getenv("FUNASR_TMP_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "tmp"))

os.makedirs(TMP_DIR, exist_ok=True)

app = FastAPI(title="Home AI FunASR Local", version="1.0.0")
_model_lock = threading.Lock()
_model = None
_model_error = None
_stream_model_lock = threading.Lock()
_stream_model = None
_stream_model_error = None
_stream_sessions = {}
_stream_sessions_lock = threading.Lock()


def clean_text(value):
    return str(value or "").strip()


def clean_id(value, max_length=160):
    text = clean_text(value)[:max_length]
    return "".join(char if char.isalnum() or char in {"_", "-", "."} else "_" for char in text)


def ffmpeg_executable():
    if imageio_ffmpeg is None:
        return ""
    try:
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return ""


def audio_path_for_model(source_path):
    suffix = os.path.splitext(source_path)[1].lower()
    if suffix in {".wav", ".flac"}:
        return source_path, None
    ffmpeg = ffmpeg_executable()
    if not ffmpeg:
        return source_path, None
    fd, wav_path = tempfile.mkstemp(prefix="home-ai-funasr-normalized-", suffix=".wav", dir=TMP_DIR)
    os.close(fd)
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        source_path,
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "wav",
        wav_path,
    ]
    subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return wav_path, wav_path


def load_model():
    global _model, _model_error
    if _model is not None:
        return _model
    if AutoModel is None:
        raise RuntimeError("funasr package is not installed")
    with _model_lock:
        if _model is not None:
            return _model
        kwargs = {
            "model": DEFAULT_MODEL,
            "device": DEVICE,
        }
        if DEFAULT_VAD_MODEL:
            kwargs["vad_model"] = DEFAULT_VAD_MODEL
            kwargs["vad_kwargs"] = {"max_single_segment_time": 30000}
        if DEFAULT_PUNC_MODEL:
            kwargs["punc_model"] = DEFAULT_PUNC_MODEL
        try:
            _model = AutoModel(**kwargs)
            _model_error = None
            return _model
        except Exception as exc:
            _model_error = f"{type(exc).__name__}: {exc}"
            raise


def load_stream_model():
    global _stream_model, _stream_model_error
    if _stream_model is not None:
        return _stream_model
    if AutoModel is None:
        raise RuntimeError("funasr package is not installed")
    if np is None:
        raise RuntimeError("numpy package is not installed")
    with _stream_model_lock:
        if _stream_model is not None:
            return _stream_model
        try:
            _stream_model = AutoModel(model=STREAMING_MODEL, device=DEVICE)
            _stream_model_error = None
            return _stream_model
        except Exception as exc:
            _stream_model_error = f"{type(exc).__name__}: {exc}"
            raise


def normalize_result(result, elapsed_ms):
    items = result if isinstance(result, list) else [result]
    texts = []
    segments = []
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        text = clean_text(item.get("text") or item.get("sentence_info") or "")
        if text:
            texts.append(text)
        segments.append({
            "id": index,
            "text": text,
            "raw_keys": sorted(str(key) for key in item.keys())[:20],
        })
    return {
        "text": clean_text("".join(texts)),
        "language": "zh",
        "confidence": 0,
        "segments": segments[:200],
        "backend": SERVICE_ID,
        "durationMs": elapsed_ms,
    }


def pcm16_base64_to_float32(value):
    if np is None:
        raise RuntimeError("numpy package is not installed")
    raw = base64.b64decode(clean_text(value), validate=False)
    if not raw:
        return np.zeros(0, dtype=np.float32), b""
    if len(raw) % 2:
        raw = raw[:-1]
    audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    return audio, raw


def write_pcm16_wav(raw_parts, sample_rate):
    fd, wav_path = tempfile.mkstemp(prefix="home-ai-funasr-stream-final-", suffix=".wav", dir=TMP_DIR)
    os.close(fd)
    with wave.open(wav_path, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(int(sample_rate or STREAMING_SAMPLE_RATE))
        handle.writeframes(b"".join(raw_parts))
    return wav_path


def streaming_chunk_stride():
    stride_units = max(1, int(STREAMING_CHUNK_SIZE[1] or 10))
    return max(1600, stride_units * 960)


def normalize_stream_text(result):
    payload = normalize_result(result, 0)
    return clean_text(payload.get("text"))


def prune_old_stream_sessions():
    cutoff = time.monotonic() - max(5, STREAMING_MAX_SECONDS + 30)
    with _stream_sessions_lock:
        stale = [key for key, session in _stream_sessions.items() if session.get("created_monotonic", 0) < cutoff]
        for key in stale:
            _stream_sessions.pop(key, None)


@app.get("/health")
def health():
    package_available = AutoModel is not None
    return {
        "status": "ok" if package_available else "degraded",
        "service": SERVICE_ID,
        "package_available": package_available,
        "model_loaded": _model is not None,
        "last_model_error": _model_error,
        "model": DEFAULT_MODEL,
        "vad_model": DEFAULT_VAD_MODEL,
        "punc_model": DEFAULT_PUNC_MODEL,
        "device": DEVICE,
        "batch_size_s": BATCH_SIZE_S,
        "merge_vad": MERGE_VAD,
        "merge_length_s": MERGE_LENGTH_S,
        "tmp_dir": TMP_DIR,
        "ffmpeg_available": bool(ffmpeg_executable()),
        "streaming_available": package_available and np is not None,
        "streaming_model_loaded": _stream_model is not None,
        "last_streaming_model_error": _stream_model_error,
        "streaming_model": STREAMING_MODEL,
        "streaming_sample_rate": STREAMING_SAMPLE_RATE,
        "streaming_chunk_size": STREAMING_CHUNK_SIZE,
        "streaming_endpoint": "/v1/audio/transcriptions/stream",
    }


@app.post("/v1/audio/transcriptions")
async def transcribe_openai_style(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    task: Optional[str] = Form(None),
    initial_prompt: Optional[str] = Form(None),
    response_format: str = Form("json"),
):
    suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    fd, tmp_path = tempfile.mkstemp(prefix="home-ai-funasr-", suffix=suffix, dir=TMP_DIR)
    os.close(fd)
    normalized_path = None
    try:
        with open(tmp_path, "wb") as handle:
            handle.write(await file.read())
        model = load_model()
        started = time.monotonic()
        hotword = clean_text(initial_prompt)
        model_input, normalized_path = audio_path_for_model(tmp_path)
        kwargs = {
            "input": model_input,
            "batch_size_s": BATCH_SIZE_S,
        }
        if hotword:
            kwargs["hotword"] = hotword
        if language:
            kwargs["language"] = language
        if MERGE_VAD:
            kwargs["merge_vad"] = True
            kwargs["merge_length_s"] = MERGE_LENGTH_S
        result = model.generate(**kwargs)
        elapsed_ms = int((time.monotonic() - started) * 1000)
        return normalize_result(result, elapsed_ms)
    except Exception as exc:
        return JSONResponse(
            status_code=502,
            content={
                "error": "asr_backend_failed",
                "backend": SERVICE_ID,
                "message": f"{type(exc).__name__}: {exc}"[:500],
            },
        )
    finally:
        try:
            if normalized_path:
                os.unlink(normalized_path)
            os.unlink(tmp_path)
        except Exception:
            pass


@app.post("/v1/audio/transcriptions/stream/start")
async def stream_start(payload: dict):
    prune_old_stream_sessions()
    try:
        model = load_stream_model()
        stream_id = clean_id(payload.get("streamId") or payload.get("requestId")) or f"stream_{int(time.time() * 1000)}"
        sample_rate = int(payload.get("sampleRate") or STREAMING_SAMPLE_RATE)
        with _stream_sessions_lock:
            _stream_sessions[stream_id] = {
                "id": stream_id,
                "created_monotonic": time.monotonic(),
                "model": model,
                "cache": {},
                "pending": np.zeros(0, dtype=np.float32),
                "raw_parts": [],
                "sample_rate": sample_rate,
                "partial_text": "",
                "chunks": 0,
                "started": time.monotonic(),
            }
        return {
            "ok": True,
            "streamId": stream_id,
            "backend": SERVICE_ID,
            "sampleRate": sample_rate,
            "streamingModel": STREAMING_MODEL,
        }
    except Exception as exc:
        return JSONResponse(
            status_code=502,
            content={
                "error": "asr_stream_start_failed",
                "backend": SERVICE_ID,
                "message": f"{type(exc).__name__}: {exc}"[:500],
            },
        )


@app.post("/v1/audio/transcriptions/stream/chunk")
async def stream_chunk(payload: dict):
    stream_id = clean_id(payload.get("streamId"))
    with _stream_sessions_lock:
        session = _stream_sessions.get(stream_id)
    if not session:
        return JSONResponse(status_code=404, content={"error": "asr_stream_not_found", "backend": SERVICE_ID})
    if time.monotonic() - session["created_monotonic"] > STREAMING_MAX_SECONDS + 5:
        with _stream_sessions_lock:
            _stream_sessions.pop(stream_id, None)
        return JSONResponse(status_code=413, content={"error": "asr_stream_too_long", "backend": SERVICE_ID})
    try:
        audio, raw = pcm16_base64_to_float32(payload.get("audioBase64") or payload.get("pcm16Base64"))
        if raw:
            session["raw_parts"].append(raw)
        if audio.size:
            session["pending"] = np.concatenate([session["pending"], audio])
        stride = streaming_chunk_stride()
        partial_text = session.get("partial_text", "")
        while session["pending"].size >= stride:
            current = session["pending"][:stride]
            session["pending"] = session["pending"][stride:]
            result = session["model"].generate(
                input=current,
                cache=session["cache"],
                is_final=False,
                chunk_size=STREAMING_CHUNK_SIZE,
                encoder_chunk_look_back=STREAMING_ENCODER_LOOK_BACK,
                decoder_chunk_look_back=STREAMING_DECODER_LOOK_BACK,
            )
            text = normalize_stream_text(result)
            if text:
                partial_text += text
                session["partial_text"] = partial_text
        session["chunks"] += 1
        return {
            "ok": True,
            "streamId": stream_id,
            "type": "partial",
            "text": clean_text(partial_text),
            "backend": SERVICE_ID,
            "chunks": session["chunks"],
        }
    except Exception as exc:
        return JSONResponse(
            status_code=502,
            content={
                "error": "asr_stream_chunk_failed",
                "backend": SERVICE_ID,
                "message": f"{type(exc).__name__}: {exc}"[:500],
            },
        )


@app.post("/v1/audio/transcriptions/stream/final")
async def stream_final(payload: dict):
    stream_id = clean_id(payload.get("streamId"))
    with _stream_sessions_lock:
        session = _stream_sessions.pop(stream_id, None)
    if not session:
        return JSONResponse(status_code=404, content={"error": "asr_stream_not_found", "backend": SERVICE_ID})
    wav_path = None
    started = time.monotonic()
    try:
        if session["pending"].size:
            result = session["model"].generate(
                input=session["pending"],
                cache=session["cache"],
                is_final=True,
                chunk_size=STREAMING_CHUNK_SIZE,
                encoder_chunk_look_back=STREAMING_ENCODER_LOOK_BACK,
                decoder_chunk_look_back=STREAMING_DECODER_LOOK_BACK,
            )
            text = normalize_stream_text(result)
            if text:
                session["partial_text"] = clean_text(session.get("partial_text", "") + text)
        if not session["raw_parts"]:
            return JSONResponse(status_code=422, content={"error": "asr_stream_empty_audio", "backend": SERVICE_ID})
        wav_path = write_pcm16_wav(session["raw_parts"], session["sample_rate"])
        offline_result = load_model().generate(input=wav_path, batch_size_s=BATCH_SIZE_S)
        elapsed_ms = int((time.monotonic() - started) * 1000)
        normalized = normalize_result(offline_result, elapsed_ms)
        text = clean_text(normalized.get("text") or session.get("partial_text"))
        normalized.update({
            "ok": True,
            "streamId": stream_id,
            "type": "final",
            "text": text,
            "partialText": clean_text(session.get("partial_text")),
            "streamingModel": STREAMING_MODEL,
        })
        return normalized
    except Exception as exc:
        partial = clean_text(session.get("partial_text"))
        if partial:
            return {
                "ok": True,
                "streamId": stream_id,
                "type": "final",
                "text": partial,
                "partialText": partial,
                "backend": SERVICE_ID,
                "language": "zh",
                "confidence": 0,
                "segments": [],
                "durationMs": int((time.monotonic() - started) * 1000),
                "warning": f"{type(exc).__name__}: {exc}"[:500],
            }
        return JSONResponse(
            status_code=502,
            content={
                "error": "asr_stream_final_failed",
                "backend": SERVICE_ID,
                "message": f"{type(exc).__name__}: {exc}"[:500],
            },
        )
    finally:
        if wav_path:
            try:
                os.unlink(wav_path)
            except Exception:
                pass


@app.post("/v1/audio/transcriptions/stream/cancel")
async def stream_cancel(payload: dict):
    stream_id = clean_id(payload.get("streamId"))
    with _stream_sessions_lock:
        removed = _stream_sessions.pop(stream_id, None)
    return {"ok": True, "streamId": stream_id, "cancelled": removed is not None, "backend": SERVICE_ID}
