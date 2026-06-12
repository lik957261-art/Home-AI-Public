import os
import tempfile
import threading
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse, PlainTextResponse
from faster_whisper import BatchedInferencePipeline, WhisperModel
from faster_whisper.audio import decode_audio

try:
    import mlx.core as mx
    import mlx_whisper
    from mlx_whisper.transcribe import ModelHolder as MlxModelHolder
except Exception:
    mx = None
    mlx_whisper = None
    MlxModelHolder = None


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIGURED_MODEL_NAME = os.getenv("WHISPER_MODEL", "mobiuslabsgmbh/faster-whisper-large-v3-turbo")
DEFAULT_LOCAL_MODEL_DIR = os.path.join(BASE_DIR, "models", "mobiuslabsgmbh-faster-whisper-large-v3-turbo")
DEFAULT_MLX_MODEL_DIR = os.path.join(BASE_DIR, "models", "mlx-community-whisper-large-v3-turbo")
CONFIGURED_ENGINE = os.getenv("WHISPER_ENGINE", "auto").strip().lower() or "auto"
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
BEAM_SIZE = int(os.getenv("WHISPER_BEAM_SIZE", "5"))
BATCH_SIZE = int(os.getenv("WHISPER_BATCH_SIZE", "4"))
MLX_FP16 = os.getenv("WHISPER_MLX_FP16", "1").strip().lower() not in {"0", "false", "no", "off"}
DEFAULT_LANGUAGE = os.getenv("WHISPER_LANGUAGE", "zh")
DEFAULT_TASK = os.getenv("WHISPER_TASK", "transcribe")
DEFAULT_INITIAL_PROMPT = os.getenv("WHISPER_INITIAL_PROMPT", "以下是普通话语音转写，请使用简体中文，并加入合适的中文标点符号。")
DEFAULT_CONDITION_ON_PREVIOUS_TEXT = os.getenv("WHISPER_CONDITION_ON_PREVIOUS_TEXT", "1").strip().lower() not in {"0", "false", "no", "off"}
DEFAULT_VAD_FILTER = os.getenv("WHISPER_VAD_FILTER", "0").strip().lower() in {"1", "true", "yes", "on"}
TMP_DIR = os.getenv("WHISPER_TMP_DIR", os.path.join(BASE_DIR, "tmp"))

os.makedirs(TMP_DIR, exist_ok=True)

app = FastAPI(title="Home AI Whisper Large V3 Turbo", version="1.0.0")
_model_lock = threading.Lock()
_model = None
_batched_model = None
_mlx_model_loaded = False
_model_error = None


def resolve_model_name(model_name):
    if os.path.isdir(model_name):
        return model_name
    if os.path.isfile(os.path.join(DEFAULT_LOCAL_MODEL_DIR, "model.bin")):
        return DEFAULT_LOCAL_MODEL_DIR
    return model_name


def local_mlx_model_available():
    return os.path.isfile(os.path.join(DEFAULT_MLX_MODEL_DIR, "weights.safetensors"))


def resolve_mlx_model_name():
    model_name = os.getenv("WHISPER_MLX_MODEL", "").strip()
    if model_name:
        return model_name
    if local_mlx_model_available():
        return DEFAULT_MLX_MODEL_DIR
    return "mlx-community/whisper-large-v3-turbo"


def resolve_engine():
    if CONFIGURED_ENGINE in {"mlx", "mlx-whisper"}:
        return "mlx"
    if CONFIGURED_ENGINE in {"faster", "faster-whisper", "ctranslate2", "ct2"}:
        return "faster-whisper"
    if local_mlx_model_available() and mlx_whisper is not None:
        return "mlx"
    return "faster-whisper"


def get_faster_model():
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


def get_mlx_model():
    global _mlx_model_loaded, _model_error
    if mlx_whisper is None or MlxModelHolder is None or mx is None:
        raise RuntimeError("mlx-whisper dependencies are not installed")
    model_name = resolve_mlx_model_name()
    dtype = mx.float16 if MLX_FP16 else mx.float32
    try:
        MlxModelHolder.get_model(model_name, dtype)
        _mlx_model_loaded = True
        _model_error = None
    except Exception as exc:
        _model_error = f"{type(exc).__name__}: {exc}"
        raise


def normalize_language(language):
    lang = language or DEFAULT_LANGUAGE
    if str(lang).strip().lower() in {"auto", "detect", "none", "null", ""}:
        return None
    return lang


def clean_optional_text(value):
    text = str(value or "").strip()
    return text or None


def mlx_transcribe(tmp_path, language, word_timestamps, initial_prompt, condition_on_previous_text):
    get_mlx_model()
    audio = decode_audio(tmp_path, sampling_rate=16000)
    result = mlx_whisper.transcribe(
        audio,
        path_or_hf_repo=resolve_mlx_model_name(),
        language=language,
        task=DEFAULT_TASK,
        verbose=None,
        initial_prompt=initial_prompt,
        condition_on_previous_text=condition_on_previous_text,
        word_timestamps=word_timestamps,
        fp16=MLX_FP16,
    )
    segments = result.get("segments") or []
    return {
        "text": str(result.get("text") or "").strip(),
        "language": result.get("language") or language or "",
        "language_probability": result.get("language_probability") or 0,
        "duration": float(len(audio) / 16000.0) if len(audio) else 0,
        "segments": [
            {
                "id": index,
                "start": segment.get("start"),
                "end": segment.get("end"),
                "text": segment.get("text"),
                "words": segment.get("words") if word_timestamps else None,
            }
            for index, segment in enumerate(segments)
        ],
    }


def faster_transcribe(tmp_path, language, vad_filter, word_timestamps, initial_prompt, condition_on_previous_text):
    batched_model = get_faster_model()
    segments, info = batched_model.transcribe(
        tmp_path,
        language=language,
        task=DEFAULT_TASK,
        beam_size=BEAM_SIZE,
        batch_size=BATCH_SIZE,
        vad_filter=vad_filter,
        initial_prompt=initial_prompt,
        condition_on_previous_text=condition_on_previous_text,
        word_timestamps=word_timestamps,
    )
    segment_list = list(segments)
    return {
        "text": "".join(segment.text for segment in segment_list).strip(),
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
    }


@app.get("/health")
def health():
    engine = resolve_engine()
    return {
        "status": "ok",
        "service": "running",
        "engine": engine,
        "configured_engine": CONFIGURED_ENGINE,
        "model_loaded": _mlx_model_loaded if engine == "mlx" else _batched_model is not None,
        "last_model_error": _model_error,
        "model": CONFIGURED_MODEL_NAME,
        "resolved_model": resolve_model_name(CONFIGURED_MODEL_NAME),
        "mlx_model": resolve_mlx_model_name(),
        "mlx_model_available": local_mlx_model_available(),
        "mlx_dependencies_available": mlx_whisper is not None,
        "local_model_available": os.path.isfile(os.path.join(DEFAULT_LOCAL_MODEL_DIR, "model.bin")),
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
        "beam_size": BEAM_SIZE,
        "batch_size": BATCH_SIZE,
        "mlx_fp16": MLX_FP16,
        "language": DEFAULT_LANGUAGE,
        "task": DEFAULT_TASK,
        "initial_prompt_configured": bool(DEFAULT_INITIAL_PROMPT),
        "condition_on_previous_text": DEFAULT_CONDITION_ON_PREVIOUS_TEXT,
        "vad_filter_default": DEFAULT_VAD_FILTER,
        "hf_home": os.getenv("HF_HOME"),
        "hf_endpoint": os.getenv("HF_ENDPOINT"),
    }


@app.post("/v1/audio/transcriptions")
async def transcribe_openai_style(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    task: Optional[str] = Form(None),
    initial_prompt: Optional[str] = Form(None),
    condition_on_previous_text: Optional[bool] = Form(None),
    response_format: str = Form("json"),
    vad_filter: Optional[bool] = Form(None),
    word_timestamps: bool = Form(False),
):
    suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=TMP_DIR) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        lang = normalize_language(language)
        prompt = clean_optional_text(initial_prompt) or clean_optional_text(DEFAULT_INITIAL_PROMPT)
        condition_previous = DEFAULT_CONDITION_ON_PREVIOUS_TEXT if condition_on_previous_text is None else bool(condition_on_previous_text)
        vad_enabled = DEFAULT_VAD_FILTER if vad_filter is None else bool(vad_filter)
        effective_task = (task or DEFAULT_TASK or "transcribe").strip().lower()
        if effective_task != "transcribe":
            return JSONResponse(
                status_code=400,
                content={"error": "unsupported_task", "detail": "Only transcribe is supported."},
            )
        if resolve_engine() == "mlx":
            transcription = mlx_transcribe(tmp_path, lang, word_timestamps, prompt, condition_previous)
        else:
            transcription = faster_transcribe(tmp_path, lang, vad_enabled, word_timestamps, prompt, condition_previous)
        text = transcription["text"]
        if response_format == "text":
            return PlainTextResponse(text)
        return JSONResponse(transcription)
    except Exception as exc:
        return JSONResponse(
            status_code=503,
            content={
                "error": "model_not_available",
                "detail": f"{type(exc).__name__}: {exc}",
                "hint": "Install the Python dependencies and pre-cache the configured MLX or faster-whisper model.",
            },
        )
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
