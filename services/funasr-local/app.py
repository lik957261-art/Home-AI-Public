import os
import subprocess
import tempfile
import threading
import time
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


SERVICE_ID = os.getenv("LOCAL_ASR_SERVICE_ID", "funasr-local")
DEFAULT_MODEL = os.getenv("FUNASR_MODEL", "paraformer-zh")
DEFAULT_VAD_MODEL = os.getenv("FUNASR_VAD_MODEL", "fsmn-vad")
DEFAULT_PUNC_MODEL = os.getenv("FUNASR_PUNC_MODEL", "ct-punc")
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


def clean_text(value):
    return str(value or "").strip()


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
