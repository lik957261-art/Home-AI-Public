"""Grok video generation for Hermes Mobile Gateway profiles."""

from __future__ import annotations

import base64
import json
import mimetypes
import os
import re
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse


DEFAULT_MODEL = "grok-imagine-video"
DEFAULT_XAI_BASE_URL = "https://api.x.ai/v1"
DEFAULT_DURATION = 8
DEFAULT_ASPECT_RATIO = "16:9"
DEFAULT_RESOLUTION = "720p"
PROVIDER_NAME = "hermes-mobile-xai"
PROVIDER_DISPLAY_NAME = "Hermes Mobile xAI (local image_url paths supported)"
MAX_IMAGE_BYTES = 25 * 1024 * 1024
MAX_VIDEO_BYTES = 300 * 1024 * 1024
SUPPORTED_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
SUPPORTED_ASPECT_RATIOS = {"1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"}
SUPPORTED_RESOLUTIONS = {"480p", "720p"}

DEFAULT_ALLOWED_ROOTS = (
    "/mnt/c/ProgramData/HermesMobile/data/drive",
    "/mnt/c/ProgramData/HermesMobile/data/uploads",
    "/mnt/c/ProgramData/HermesMobile/data/artifacts",
)
DEFAULT_OUTPUT_ROOT = "/mnt/c/ProgramData/HermesMobile/data/artifacts/grok-videos"


def _json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False)


def _split_env_list(name: str, defaults: tuple[str, ...]) -> list[str]:
    raw = os.environ.get(name, "")
    if not raw.strip():
        return list(defaults)
    return [item.strip() for item in re.split(r"[;,\n]+", raw) if item.strip()]


def _windows_to_wsl_path(value: str) -> str:
    text = str(value or "").strip().strip('"').strip("'")
    if text.lower().startswith("file://"):
        parsed = urlparse(text)
        text = unquote(parsed.path or "")
        if re.match(r"^/[A-Za-z]:/", text):
            text = text[1:]
    match = re.match(r"^([A-Za-z]):[\\/](.*)$", text)
    if match:
        if os.name == "nt":
            return text.replace("/", "\\")
        drive = match.group(1).lower()
        rest = match.group(2).replace("\\", "/")
        return f"/mnt/{drive}/{rest}"
    return text


def _allowed_roots() -> list[Path]:
    roots: list[Path] = []
    for item in _split_env_list("HERMES_MOBILE_VIDEO_ALLOWED_ROOTS", DEFAULT_ALLOWED_ROOTS):
        try:
            roots.append(Path(_windows_to_wsl_path(item)).resolve())
        except Exception:
            continue
    return roots


def _inside_roots(path: Path, roots: list[Path]) -> bool:
    try:
        resolved = path.resolve()
    except Exception:
        return False
    for root in roots:
        try:
            resolved.relative_to(root)
            return True
        except ValueError:
            continue
    return False


def _validate_input_image(value: Any) -> Path:
    raw = str(value or "").strip()
    if not raw:
        raise ValueError("input_image_path_required")
    path = Path(_windows_to_wsl_path(raw)).expanduser()
    if not path.exists() or not path.is_file():
        raise FileNotFoundError("input_image_path_not_found")
    if path.suffix.lower() not in SUPPORTED_SUFFIXES:
        raise ValueError("unsupported_input_image_type")
    if path.stat().st_size > MAX_IMAGE_BYTES:
        raise ValueError("input_image_too_large")
    if not _inside_roots(path, _allowed_roots()):
        raise PermissionError("input_image_path_outside_allowed_roots")
    return path.resolve()


def _output_root() -> Path:
    raw = os.environ.get("HERMES_MOBILE_VIDEO_OUTPUT_ROOT", DEFAULT_OUTPUT_ROOT)
    return Path(_windows_to_wsl_path(raw)).expanduser()


def _default_output_path(input_path: Path | None) -> Path:
    stamp = time.strftime("%Y%m%d-%H%M%S")
    suffix = uuid.uuid4().hex[:8]
    if input_path is not None:
        output_dir = input_path.parent / "_hermes-videos"
        stem = input_path.stem
    else:
        output_dir = _output_root()
        stem = "grok-video"
    return output_dir / f"{stem}-grok-video-{stamp}-{suffix}.mp4"


def _validate_output_path(value: Any, input_path: Path | None) -> Path:
    raw = str(value or "").strip()
    output_path = Path(_windows_to_wsl_path(raw)).expanduser() if raw else _default_output_path(input_path)
    if output_path.suffix.lower() != ".mp4":
        raise ValueError("output_path_must_be_mp4")
    if not _inside_roots(output_path.parent, _allowed_roots()):
        raise PermissionError("output_path_outside_allowed_roots")
    return output_path.resolve()


def _image_data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    if mime not in {"image/png", "image/jpeg", "image/webp"}:
        if path.suffix.lower() in {".jpg", ".jpeg"}:
            mime = "image/jpeg"
        else:
            raise ValueError("unsupported_input_image_mime")
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def _image_reference_url(value: Any) -> tuple[str | None, Path | None]:
    raw = str(value or "").strip()
    if not raw:
        return None, None
    lowered = raw.lower()
    if lowered.startswith("data:image/"):
        return raw, None
    if lowered.startswith("https://"):
        return raw, None
    if lowered.startswith("http://"):
        raise ValueError("image_url_must_be_https_or_data_or_local_path")
    local_image = _validate_input_image(raw)
    return _image_data_uri(local_image), local_image


def _duration(value: Any) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = DEFAULT_DURATION
    return min(15, max(1, parsed))


def _aspect_ratio(value: Any) -> str:
    text = str(value or DEFAULT_ASPECT_RATIO).strip()
    return text if text in SUPPORTED_ASPECT_RATIOS else DEFAULT_ASPECT_RATIO


def _resolution(value: Any) -> str:
    text = str(value or DEFAULT_RESOLUTION).strip().lower()
    return text if text in SUPPORTED_RESOLUTIONS else DEFAULT_RESOLUTION


def _model(value: Any) -> str:
    text = str(value or DEFAULT_MODEL).strip()
    return text or DEFAULT_MODEL


def _timeout_seconds() -> int:
    try:
        return max(30, min(600, int(os.environ.get("HERMES_MOBILE_VIDEO_TIMEOUT_SECONDS", "300"))))
    except ValueError:
        return 300


def _poll_interval_seconds() -> float:
    try:
        return max(2.0, min(30.0, float(os.environ.get("HERMES_MOBILE_VIDEO_POLL_SECONDS", "5"))))
    except ValueError:
        return 5.0


def _resolve_xai_credentials() -> dict[str, str]:
    try:
        from tools.xai_http import resolve_xai_http_credentials

        credentials = resolve_xai_http_credentials() or {}
    except Exception:
        credentials = {}
    api_key = str(credentials.get("api_key") or os.environ.get("XAI_API_KEY", "")).strip()
    base_url = str(
        credentials.get("base_url")
        or os.environ.get("XAI_BASE_URL")
        or DEFAULT_XAI_BASE_URL
    ).strip().rstrip("/")
    provider = str(credentials.get("provider") or ("xai-api-key" if api_key else "")).strip()
    return {"api_key": api_key, "base_url": base_url, "provider": provider}


def _check_requirements() -> bool:
    return bool(_resolve_xai_credentials().get("api_key"))


def _make_http_client(timeout_seconds: int):
    import httpx

    return httpx.Client(timeout=timeout_seconds, follow_redirects=True)


def _headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "hermes-mobile/grok-video",
    }


def _submit_generation(client, payload: dict[str, Any], *, api_key: str, base_url: str) -> str:
    response = client.post(
        f"{base_url}/videos/generations",
        headers={**_headers(api_key), "x-idempotency-key": str(uuid.uuid4())},
        json=payload,
        timeout=60,
    )
    response.raise_for_status()
    body = response.json()
    request_id = str(body.get("request_id") or "").strip()
    if not request_id:
        raise RuntimeError("xai_video_response_missing_request_id")
    return request_id


def _poll_generation(
    client,
    request_id: str,
    *,
    api_key: str,
    base_url: str,
    timeout_seconds: int,
    poll_interval_seconds: float,
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_seconds
    last_status = "queued"
    while time.monotonic() < deadline:
        response = client.get(
            f"{base_url}/videos/{request_id}",
            headers=_headers(api_key),
            timeout=30,
        )
        response.raise_for_status()
        body = response.json()
        last_status = str(body.get("status") or "").lower()
        if last_status == "done":
            return {"status": "done", "body": body}
        if last_status in {"failed", "error", "expired", "cancelled"}:
            return {"status": last_status, "body": body}
        time.sleep(poll_interval_seconds)
    return {"status": "timeout", "body": {"status": last_status}}


def _download_video(client, video_url: str, output_path: Path) -> dict[str, Any]:
    response = client.get(video_url, timeout=120)
    response.raise_for_status()
    raw = response.content
    if len(raw) > MAX_VIDEO_BYTES:
        raise ValueError("generated_video_too_large")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(raw)
    return {
        "mime": response.headers.get("content-type") or "video/mp4",
        "bytes": len(raw),
    }


def _build_payload(args: dict[str, Any], image_url: str | None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": _model(args.get("model")),
        "prompt": str(args.get("prompt") or "").strip(),
        "duration": _duration(args.get("duration")),
        "aspect_ratio": _aspect_ratio(args.get("aspect_ratio")),
        "resolution": _resolution(args.get("resolution")),
    }
    if image_url:
        payload["image"] = {"url": image_url}
    return payload


def _compact_http_error(error: Exception) -> str:
    response = getattr(error, "response", None)
    status_code = getattr(response, "status_code", None)
    text = ""
    try:
        text = str(response.text or "")[:400] if response is not None else ""
    except Exception:
        text = ""
    if status_code:
        return f"http_{status_code}: {text or type(error).__name__}"
    return str(error)[:400]


def _run_video_generation(args: dict[str, Any]) -> dict[str, Any]:
    try:
        prompt = str(args.get("prompt") or "").strip()
        if not prompt:
            return {"ok": False, "success": False, "error": "prompt_required"}

        local_image = None
        local_image_raw = str(args.get("input_image_path") or "").strip()
        image_url_raw = str(args.get("image_url") or "").strip()
        image_url = None
        if local_image_raw and image_url_raw:
            return {
                "ok": False,
                "success": False,
                "error": "input_image_path_and_image_url_are_mutually_exclusive",
            }
        if local_image_raw:
            local_image = _validate_input_image(local_image_raw)
            image_url = _image_data_uri(local_image)
        elif image_url_raw:
            image_url, local_image = _image_reference_url(image_url_raw)

        output_path = _validate_output_path(args.get("output_path"), local_image)
        credentials = _resolve_xai_credentials()
        api_key = credentials.get("api_key") or ""
        if not api_key:
            return {
                "ok": False,
                "success": False,
                "tool": "video_generate",
                "provider": credentials.get("provider") or "xai",
                "error": "xai_credentials_unavailable",
            }

        payload = _build_payload(args, image_url)
        timeout_seconds = _timeout_seconds()
        poll_interval = _poll_interval_seconds()
        with _make_http_client(timeout_seconds) as client:
            request_id = _submit_generation(
                client,
                payload,
                api_key=api_key,
                base_url=credentials["base_url"],
            )
            result = _poll_generation(
                client,
                request_id,
                api_key=api_key,
                base_url=credentials["base_url"],
                timeout_seconds=timeout_seconds,
                poll_interval_seconds=poll_interval,
            )
            status = str(result.get("status") or "").lower()
            body = result.get("body") if isinstance(result.get("body"), dict) else {}
            if status != "done":
                error = (
                    ((body.get("error") or {}) if isinstance(body.get("error"), dict) else {}).get("message")
                    or body.get("message")
                    or f"xai_video_status_{status or 'unknown'}"
                )
                return {
                    "ok": False,
                    "success": False,
                    "tool": "video_generate",
                    "provider": credentials.get("provider") or "xai",
                    "request_id": request_id,
                    "status": status,
                    "error": str(error)[:400],
                }
            video = body.get("video") if isinstance(body.get("video"), dict) else {}
            video_url = str(video.get("url") or "").strip()
            if not video_url:
                return {
                    "ok": False,
                    "success": False,
                    "tool": "video_generate",
                    "request_id": request_id,
                    "error": "xai_video_url_missing",
                }
            download = _download_video(client, video_url, output_path)

        return {
            "ok": True,
            "success": True,
            "tool": "video_generate",
            "source": "xai",
            "provider": credentials.get("provider") or "xai",
            "model": payload["model"],
            "request_id": request_id,
            "modality": "image" if image_url else "text",
            "duration": payload["duration"],
            "aspect_ratio": payload["aspect_ratio"],
            "resolution": payload["resolution"],
            "video_url": video_url,
            "output_path": str(output_path),
            "media_line": f"MEDIA:{output_path}",
            "mime": download.get("mime") or "video/mp4",
            "bytes": download.get("bytes") or output_path.stat().st_size,
        }
    except Exception as error:
        return {
            "ok": False,
            "success": False,
            "tool": "video_generate",
            "error": _compact_http_error(error),
            "error_type": type(error).__name__,
        }


def _handle_video_generate(args: dict[str, Any], **_kw: Any) -> str:
    return _json(_run_video_generation(args))


def _provider_result_from_generation(args: dict[str, Any]) -> dict[str, Any]:
    from agent.video_gen_provider import error_response, success_response

    prompt = str(args.get("prompt") or "").strip()
    result = _run_video_generation(args)
    model = str(result.get("model") or _model(args.get("model")) or DEFAULT_MODEL)
    aspect_ratio = str(result.get("aspect_ratio") or _aspect_ratio(args.get("aspect_ratio")))
    if result.get("success"):
        return success_response(
            video=str(result.get("output_path") or result.get("video_url") or ""),
            model=model,
            prompt=prompt,
            modality=str(result.get("modality") or "text"),
            aspect_ratio=aspect_ratio,
            duration=int(result.get("duration") or 0),
            provider=PROVIDER_NAME,
            extra={
                "request_id": result.get("request_id"),
                "video_url": result.get("video_url"),
                "output_path": result.get("output_path"),
                "media_line": result.get("media_line"),
                "mime": result.get("mime"),
                "bytes": result.get("bytes"),
                "source_provider": result.get("provider"),
            },
        )
    return error_response(
        error=str(result.get("error") or "grok_video_generation_failed"),
        error_type=str(result.get("error_type") or result.get("status") or "provider_error"),
        provider=PROVIDER_NAME,
        model=model,
        prompt=prompt,
        aspect_ratio=aspect_ratio,
    )


def _create_provider():
    from agent.video_gen_provider import VideoGenProvider

    class HermesMobileXAIVideoGenProvider(VideoGenProvider):
        @property
        def name(self) -> str:
            return PROVIDER_NAME

        @property
        def display_name(self) -> str:
            return PROVIDER_DISPLAY_NAME

        def is_available(self) -> bool:
            return _check_requirements()

        def list_models(self) -> list[dict[str, Any]]:
            return [{
                "id": DEFAULT_MODEL,
                "display": "Grok Imagine Video",
                "speed": "30s-several minutes",
                "strengths": "Text-to-video and image-to-video with Hermes Mobile local image path support.",
                "modalities": ["text", "image"],
            }]

        def default_model(self) -> str:
            return DEFAULT_MODEL

        def get_setup_schema(self) -> dict[str, Any]:
            return {
                "name": PROVIDER_DISPLAY_NAME,
                "badge": "paid",
                "tag": "grok-imagine-video via xAI OAuth; accepts HTTPS/data image_url and Hermes Mobile local image paths",
                "env_vars": [],
                "post_setup": "xai_grok",
            }

        def capabilities(self) -> dict[str, Any]:
            return {
                "modalities": ["text", "image"],
                "aspect_ratios": sorted(SUPPORTED_ASPECT_RATIOS),
                "resolutions": sorted(SUPPORTED_RESOLUTIONS),
                "max_duration": 15,
                "min_duration": 1,
                "supports_audio": False,
                "supports_negative_prompt": False,
                "max_reference_images": 0,
            }

        def generate(
            self,
            prompt: str,
            *,
            model: str | None = None,
            image_url: str | None = None,
            reference_image_urls: list[str] | None = None,
            duration: int | None = None,
            aspect_ratio: str = DEFAULT_ASPECT_RATIO,
            resolution: str = DEFAULT_RESOLUTION,
            negative_prompt: str | None = None,
            audio: bool | None = None,
            seed: int | None = None,
            **_kwargs: Any,
        ) -> dict[str, Any]:
            if reference_image_urls:
                from agent.video_gen_provider import error_response

                return error_response(
                    error="reference_image_urls are not supported by the Hermes Mobile xAI video provider",
                    error_type="unsupported_reference_images",
                    provider=PROVIDER_NAME,
                    model=model or DEFAULT_MODEL,
                    prompt=prompt,
                    aspect_ratio=aspect_ratio,
                )
            return _provider_result_from_generation({
                "prompt": prompt,
                "image_url": image_url or "",
                "model": model or DEFAULT_MODEL,
                "duration": duration if duration is not None else DEFAULT_DURATION,
                "aspect_ratio": aspect_ratio,
                "resolution": resolution,
            })

    return HermesMobileXAIVideoGenProvider()


def register(ctx) -> None:
    ctx.register_video_gen_provider(_create_provider())
