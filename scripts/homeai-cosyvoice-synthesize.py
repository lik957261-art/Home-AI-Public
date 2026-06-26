#!/usr/bin/env python3
"""Home AI CosyVoice synthesis bridge.

Reads a bounded JSON request from stdin and writes a small JSON result to stdout.
The caller owns request auth, asset ids, persistence, and file serving.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
import time


TEXT_MAX = 8000


def fail(code: str, message: str, status: int = 1) -> None:
    sys.stderr.write(f"{code}: {message}\n")
    raise SystemExit(status)


def load_request() -> dict:
    raw = sys.stdin.read(TEXT_MAX * 2)
    try:
        payload = json.loads(raw or "{}")
    except json.JSONDecodeError:
        fail("tts_request_invalid_json", "request stdin is not valid json")
    if not isinstance(payload, dict):
        fail("tts_request_invalid", "request must be a json object")
    text = str(payload.get("text") or "").strip()
    if not text:
        fail("tts_text_required", "text is required")
    payload["text"] = text[:TEXT_MAX]
    return payload


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Synthesize a Home AI TTS file with CosyVoice")
    parser.add_argument("--repo-dir", default=os.environ.get("HOMEAI_TTS_COSYVOICE_REPO_DIR", ""))
    parser.add_argument("--model-dir", default=os.environ.get("HOMEAI_TTS_COSYVOICE_MODEL_DIR", ""))
    parser.add_argument("--cache-dir", default=os.environ.get("HOMEAI_TTS_COSYVOICE_CACHE_DIR", ""))
    parser.add_argument("--prompt-audio", default=os.environ.get("HOMEAI_TTS_COSYVOICE_PROMPT_AUDIO", ""))
    parser.add_argument("--prompt-text", default=os.environ.get("HOMEAI_TTS_COSYVOICE_PROMPT_TEXT", ""))
    parser.add_argument("--instruction", default=os.environ.get("HOMEAI_TTS_COSYVOICE_INSTRUCTION", ""))
    parser.add_argument("--speaker", default=os.environ.get("HOMEAI_TTS_COSYVOICE_SPEAKER", "中文女"))
    parser.add_argument("--mode", default=os.environ.get("HOMEAI_TTS_COSYVOICE_MODE", "zero_shot"))
    parser.add_argument("--format", default="wav", choices=["wav", "aiff", "mp3", "flac"])
    parser.add_argument("--output", required=True)
    return parser.parse_args()


def configure_cache(cache_dir: str) -> None:
    if not cache_dir:
        return
    root = Path(cache_dir).expanduser().resolve()
    cache_paths = {
        "MODELSCOPE_CACHE": root / "modelscope",
        "HF_HOME": root / "huggingface",
        "XDG_CACHE_HOME": root / "xdg",
        "MPLCONFIGDIR": root / "matplotlib",
    }
    for key, cache_path in cache_paths.items():
        cache_path.mkdir(parents=True, exist_ok=True)
        os.environ.setdefault(key, str(cache_path))


def import_cosyvoice(repo_dir: str) -> None:
    if repo_dir:
        root = Path(repo_dir).expanduser().resolve()
        sys.path.insert(0, str(root))
        sys.path.insert(0, str(root / "third_party" / "Matcha-TTS"))
    try:
        import torch  # noqa: F401
        import torchaudio  # noqa: F401
        from cosyvoice.cli.cosyvoice import AutoModel  # noqa: F401
    except Exception as exc:  # pragma: no cover - exercised in production smoke
        fail("cosyvoice_import_failed", str(exc))


def save_audio(path: Path, waveform, sample_rate: int) -> None:
    import torchaudio

    path.parent.mkdir(parents=True, exist_ok=True)
    torchaudio.save(str(path), waveform, sample_rate)


def synthesize(args: argparse.Namespace, payload: dict) -> dict:
    from cosyvoice.cli.cosyvoice import AutoModel

    model_dir = args.model_dir.strip()
    if not model_dir:
        fail("cosyvoice_model_dir_required", "model dir is required")
    output = Path(args.output).expanduser().resolve()
    text = payload["text"]
    started = time.monotonic()
    model = AutoModel(model_dir=model_dir)
    mode = args.mode.strip().lower()

    if mode in {"sft", "speaker"}:
        generator = model.inference_sft(text, args.speaker, stream=False)
    elif mode in {"instruct", "instruct2"}:
        prompt_audio = args.prompt_audio.strip()
        if hasattr(model, "inference_instruct2") and prompt_audio:
            instruction = args.instruction.strip() or "You are a professional Chinese hi-fi narration host.<|endofprompt|>"
            generator = model.inference_instruct2(text, instruction, prompt_audio, stream=False)
        else:
            instruction = args.instruction.strip() or "用自然、克制、专业的中文旁白语气朗读。<|endofprompt|>"
            generator = model.inference_instruct(text, args.speaker, instruction, stream=False)
    else:
        prompt_audio = args.prompt_audio.strip()
        prompt_text = args.prompt_text.strip()
        if not prompt_audio or not prompt_text:
            fail("cosyvoice_prompt_required", "zero-shot mode requires prompt audio and prompt text")
        generator = model.inference_zero_shot(text, prompt_text, prompt_audio, stream=False)

    chunks = list(generator)
    if not chunks:
        fail("cosyvoice_empty_output", "cosyvoice returned no audio")
    first = chunks[0]
    waveform = first.get("tts_speech") if isinstance(first, dict) else None
    if waveform is None:
        fail("cosyvoice_missing_waveform", "cosyvoice output is missing tts_speech")
    save_audio(output, waveform, int(getattr(model, "sample_rate", 22050)))
    duration_seconds = 0.0
    try:
        duration_seconds = float(waveform.shape[-1]) / float(getattr(model, "sample_rate", 22050))
    except Exception:
        duration_seconds = 0.0
    return {
        "ok": True,
        "provider": f"cosyvoice:{mode}",
        "duration_seconds": duration_seconds,
        "elapsed_seconds": round(time.monotonic() - started, 3),
    }


def main() -> None:
    args = parse_args()
    payload = load_request()
    configure_cache(args.cache_dir)
    import_cosyvoice(args.repo_dir)
    result = synthesize(args, payload)
    sys.stdout.write(json.dumps(result, ensure_ascii=True))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
