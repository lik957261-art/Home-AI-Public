import os
import tempfile
import threading
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse, PlainTextResponse
from faster_whisper import BatchedInferencePipeline, WhisperModel


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIGURED_MODEL_NAME = os.getenv("WHISPER_MODEL", "mobiuslabsgmbh/faster-whisper-large-v3-turbo")
DEFAULT_LOCAL_MODEL_DIR = os.path.join(BASE_DIR, "models", "mobiuslabsgmbh-faster-whisper-large-v3-turbo")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
BEAM_SIZE = int(os.getenv("WHISPER_BEAM_SIZE", "5"))
BATCH_SIZE = int(os.getenv("WHISPER_BATCH_SIZE", "4"))
DEFAULT_LANGUAGE = os.getenv("WHISPER_LANGUAGE", "auto")
TMP_DIR = os.getenv("WHISPER_TMP_DIR", os.path.join(BASE_DIR, "tmp"))

os.makedirs(TMP_DIR, exist_ok=True)

app = FastAPI(title="Home AI Whisper Large V3 Turbo", version="1.0.0")
_model_lock = threading.Lock()
_model = None
_batched_model = None
_model_error = None


def resolve_model_name(model_name):
    if os.path.isdir(model_name):
        return model_name
    if os.path.isfile(os.path.join(DEFAULT_LOCAL_MODEL_DIR, "model.bin")):
        return DEFAULT_LOCAL_MODEL_DIR
    return model_name


def get_model():
    global _model, _batched_model, _model_error
    if _batched_model is not None:
        return _batched_model
    with _model_lock:
        if _batched_model is not None:
            return _batched_model
        try:
            _model = WhisperModel(resolve_model_name(CONFIGURED_MODEL_NAME), device=DEVICE, compute_type=COMPUTE_TYPE)
            _batched_model = BatchedInferencePipeline(model=_model)
            _model_error = None
            return _batched_model
        except Exception as exc:
            _model_error = f"{type(exc).__name__}: {exc}"
            raise


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "running",
        "model_loaded": _batched_model is not None,
        "last_model_error": _model_error,
        "model": CONFIGURED_MODEL_NAME,
        "resolved_model": resolve_model_name(CONFIGURED_MODEL_NAME),
        "local_model_available": os.path.isfile(os.path.join(DEFAULT_LOCAL_MODEL_DIR, "model.bin")),
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
        "beam_size": BEAM_SIZE,
        "batch_size": BATCH_SIZE,
        "hf_home": os.getenv("HF_HOME"),
        "hf_endpoint": os.getenv("HF_ENDPOINT"),
    }


@app.post("/v1/audio/transcriptions")
async def transcribe_openai_style(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    response_format: str = Form("json"),
    vad_filter: bool = Form(True),
    word_timestamps: bool = Form(False),
):
    try:
        batched_model = get_model()
    except Exception as exc:
        return JSONResponse(
            status_code=503,
            content={
                "error": "model_not_available",
                "detail": f"{type(exc).__name__}: {exc}",
                "hint": "Install the Python dependencies and pre-cache the configured faster-whisper model.",
            },
        )

    suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=TMP_DIR) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        lang = language or DEFAULT_LANGUAGE
        if str(lang).strip().lower() in {"auto", "detect", "none", "null", ""}:
            lang = None
        segments, info = batched_model.transcribe(
            tmp_path,
            language=lang,
            beam_size=BEAM_SIZE,
            batch_size=BATCH_SIZE,
            vad_filter=vad_filter,
            word_timestamps=word_timestamps,
        )
        segment_list = list(segments)
        text = "".join(segment.text for segment in segment_list).strip()
        if response_format == "text":
            return PlainTextResponse(text)
        return JSONResponse({
            "text": text,
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": info.duration,
            "segments": [
                {
                    "id": index,
                    "start": segment.start,
                    "end": segment.end,
                    "text": segment.text,
                    "words": [
                        {
                            "word": word.word,
                            "start": word.start,
                            "end": word.end,
                            "probability": word.probability,
                        }
                        for word in (segment.words or [])
                    ] if word_timestamps else None,
                }
                for index, segment in enumerate(segment_list)
            ],
        })
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
