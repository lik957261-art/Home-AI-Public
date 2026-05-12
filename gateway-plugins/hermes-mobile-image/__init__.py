"""Scoped ChatGPT Image editing tools for Hermes Mobile Gateway profiles."""

from __future__ import annotations

import base64
import json
import mimetypes
import os
import re
import time
from pathlib import Path
from typing import Any


API_MODEL = "gpt-image-2"
DEFAULT_CHAT_MODEL = "gpt-5.4"
CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex"
MAX_IMAGE_BYTES = 50 * 1024 * 1024
SUPPORTED_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
SUPPORTED_QUALITIES = {"low", "medium", "high"}
SUPPORTED_SIZES = {"auto", "1024x1024", "1024x1536", "1536x1024"}

DEFAULT_ALLOWED_ROOTS = (
    "/mnt/c/ProgramData/HermesMobile/data/drive",
    "/mnt/c/ProgramData/HermesMobile/data/uploads",
    "/mnt/c/ProgramData/HermesMobile/data/artifacts",
)

IMAGE_EDIT_SCHEMA = {
    "name": "image_edit",
    "description": (
        "Edit an existing image with ChatGPT Image 2. Use this for current-account "
        "image editing, retouching, background cleanup, object removal, style edits, "
        "and other image modifications. Input and output paths must stay inside the "
        "current Hermes Mobile workspace/upload/artifact roots."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "input_image_path": {
                "type": "string",
                "description": "Path to a PNG, JPG, JPEG, or WEBP image inside an allowed Hermes Mobile root.",
            },
            "prompt": {
                "type": "string",
                "description": "Detailed edit instruction. Say what must change and what must be preserved.",
            },
            "output_path": {
                "type": "string",
                "description": "Optional PNG output path inside an allowed Hermes Mobile root. Defaults beside the input image.",
            },
            "quality": {
                "type": "string",
                "enum": ["low", "medium", "high"],
                "default": "medium",
                "description": "Image quality tier.",
            },
            "size": {
                "type": "string",
                "enum": ["auto", "1024x1024", "1024x1536", "1536x1024"],
                "default": "auto",
                "description": "Output size. Use auto unless the user asks for a specific orientation.",
            },
        },
        "required": ["input_image_path", "prompt"],
    },
}

IMAGE_ERASE_SCHEMA = {
    "name": "image_erase",
    "description": (
        "Remove described objects or distractions from an existing image with ChatGPT Image 2, "
        "reconstructing the background naturally while preserving the rest of the image."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "input_image_path": {
                "type": "string",
                "description": "Path to a PNG, JPG, JPEG, or WEBP image inside an allowed Hermes Mobile root.",
            },
            "target": {
                "type": "string",
                "description": "Object, person, text, vehicle, clutter, or area to remove.",
            },
            "output_path": {
                "type": "string",
                "description": "Optional PNG output path inside an allowed Hermes Mobile root. Defaults beside the input image.",
            },
            "preserve": {
                "type": "string",
                "description": "Optional detail about what must remain unchanged.",
            },
            "quality": {
                "type": "string",
                "enum": ["low", "medium", "high"],
                "default": "medium",
                "description": "Image quality tier.",
            },
            "size": {
                "type": "string",
                "enum": ["auto", "1024x1024", "1024x1536", "1536x1024"],
                "default": "auto",
                "description": "Output size. Use auto unless the user asks for a specific orientation.",
            },
        },
        "required": ["input_image_path", "target"],
    },
}


def _json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False)


def _split_env_list(name: str, defaults: tuple[str, ...]) -> list[str]:
    raw = os.environ.get(name, "")
    if not raw.strip():
        return list(defaults)
    return [item.strip() for item in re.split(r"[;,\n]+", raw) if item.strip()]


def _windows_to_wsl_path(value: str) -> str:
    text = str(value or "").strip().strip('"').strip("'")
    match = re.match(r"^([A-Za-z]):[\\/](.*)$", text)
    if match:
        drive = match.group(1).lower()
        rest = match.group(2).replace("\\", "/")
        return f"/mnt/{drive}/{rest}"
    return text


def _allowed_roots() -> list[Path]:
    roots: list[Path] = []
    for item in _split_env_list("HERMES_MOBILE_IMAGE_ALLOWED_ROOTS", DEFAULT_ALLOWED_ROOTS):
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


def _workspace_scope(path: Path) -> tuple[str, str] | None:
    normalized = str(path.resolve()).replace("\\", "/")
    for marker in (
        "/ProgramData/HermesMobile/data/drive/users/",
        "/ProgramData/HermesMobile/data/uploads/",
        "/ProgramData/HermesMobile/data/artifacts/",
    ):
        index = normalized.find(marker)
        if index < 0:
            continue
        remainder = normalized[index + len(marker):].strip("/")
        first = remainder.split("/", 1)[0].strip()
        if first:
            return marker, first
    return None


def _validate_input_image(value: Any) -> Path:
    path = Path(_windows_to_wsl_path(str(value or ""))).expanduser()
    if not path.exists() or not path.is_file():
        raise FileNotFoundError("input_image_path_not_found")
    if path.suffix.lower() not in SUPPORTED_SUFFIXES:
        raise ValueError("unsupported_input_image_type")
    if path.stat().st_size > MAX_IMAGE_BYTES:
        raise ValueError("input_image_too_large")
    if not _inside_roots(path, _allowed_roots()):
        raise PermissionError("input_image_path_outside_allowed_roots")
    return path.resolve()


def _default_output_path(input_path: Path) -> Path:
    stamp = time.strftime("%Y%m%d-%H%M%S")
    output_dir = input_path.parent / "_hermes-image-edits"
    return output_dir / f"{input_path.stem}-edited-{stamp}.png"


def _validate_output_path(value: Any, input_path: Path) -> Path:
    output_path = Path(_windows_to_wsl_path(str(value or ""))).expanduser() if str(value or "").strip() else _default_output_path(input_path)
    if output_path.suffix.lower() != ".png":
        raise ValueError("output_path_must_be_png")
    if not _inside_roots(output_path.parent, _allowed_roots()):
        raise PermissionError("output_path_outside_allowed_roots")
    input_scope = _workspace_scope(input_path)
    output_scope = _workspace_scope(output_path)
    if input_scope and output_scope and input_scope != output_scope:
        raise PermissionError("output_path_crosses_workspace_scope")
    return output_path.resolve()


def _quality(value: Any) -> str:
    quality = str(value or "medium").strip().lower()
    return quality if quality in SUPPORTED_QUALITIES else "medium"


def _size(value: Any) -> str:
    size = str(value or "auto").strip().lower()
    return size if size in SUPPORTED_SIZES else "auto"


def _image_data_url(path: Path) -> str:
    mime = mimetypes.guess_type(str(path))[0] or "image/png"
    data = path.read_bytes()
    return f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"


def _read_codex_access_token() -> str | None:
    try:
        from agent.auxiliary_client import _read_codex_access_token as reader

        token = reader()
        if isinstance(token, str) and token.strip():
            return token.strip()
    except Exception:
        return None
    return None


def _build_codex_client():
    token = _read_codex_access_token()
    if not token:
        return None
    try:
        import openai
        from agent.auxiliary_client import _codex_cloudflare_headers

        return openai.OpenAI(
            api_key=token,
            base_url=CODEX_BASE_URL,
            default_headers=_codex_cloudflare_headers(token),
        )
    except Exception:
        return None


def _collect_image_b64(client: Any, *, prompt: str, input_image: Path, quality: str, size: str) -> tuple[str | None, dict[str, Any]]:
    image_b64: str | None = None
    meta: dict[str, Any] = {}
    tool_options: dict[str, Any] = {
        "type": "image_generation",
        "model": API_MODEL,
        "action": "edit",
        "input_fidelity": "high",
        "quality": quality,
        "output_format": "png",
        "background": "opaque",
        "partial_images": 1,
    }
    if size != "auto":
        tool_options["size"] = size

    chat_model = os.environ.get("HERMES_MOBILE_IMAGE_CHAT_MODEL", DEFAULT_CHAT_MODEL).strip() or DEFAULT_CHAT_MODEL
    instructions = (
        "Use the image_generation tool to edit the provided input image. "
        "Preserve all image regions that are not explicitly requested to change."
    )
    content = [
        {"type": "input_text", "text": prompt},
        {"type": "input_image", "image_url": _image_data_url(input_image)},
    ]

    with client.responses.stream(
        model=chat_model,
        store=False,
        instructions=instructions,
        input=[{"type": "message", "role": "user", "content": content}],
        tools=[tool_options],
        tool_choice={
            "type": "allowed_tools",
            "mode": "required",
            "tools": [{"type": "image_generation"}],
        },
    ) as stream:
        for event in stream:
            event_type = getattr(event, "type", "")
            if event_type == "response.output_item.done":
                item = getattr(event, "item", None)
                if getattr(item, "type", None) == "image_generation_call":
                    result = getattr(item, "result", None)
                    if isinstance(result, str) and result:
                        image_b64 = result
                    revised = getattr(item, "revised_prompt", None)
                    action = getattr(item, "action", None)
                    if revised:
                        meta["revised_prompt"] = revised
                    if action:
                        meta["action"] = action
            elif event_type == "response.image_generation_call.partial_image":
                partial = getattr(event, "partial_image_b64", None)
                if isinstance(partial, str) and partial:
                    image_b64 = partial
        final = stream.get_final_response()

    for item in getattr(final, "output", None) or []:
        if getattr(item, "type", None) != "image_generation_call":
            continue
        result = getattr(item, "result", None)
        if isinstance(result, str) and result:
            image_b64 = result
        revised = getattr(item, "revised_prompt", None)
        action = getattr(item, "action", None)
        if revised:
            meta["revised_prompt"] = revised
        if action:
            meta["action"] = action

    return image_b64, meta


def _run_edit(args: dict[str, Any], *, prompt: str, tool_name: str) -> str:
    try:
        input_path = _validate_input_image(args.get("input_image_path"))
        output_path = _validate_output_path(args.get("output_path"), input_path)
        clean_prompt = str(prompt or "").strip()
        if not clean_prompt:
            return _json({"ok": False, "error": "prompt_required"})
        client = _build_codex_client()
        if client is None:
            return _json({"ok": False, "error": "codex_auth_or_openai_client_unavailable"})
        image_b64, meta = _collect_image_b64(
            client,
            prompt=clean_prompt,
            input_image=input_path,
            quality=_quality(args.get("quality")),
            size=_size(args.get("size")),
        )
        if not image_b64:
            return _json({"ok": False, "error": "image_edit_returned_no_image"})
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(base64.b64decode(image_b64))
        return _json({
            "ok": True,
            "tool": tool_name,
            "source": "chatgpt-codex",
            "model": API_MODEL,
            "input_image_path": str(input_path),
            "output_path": str(output_path),
            "bytes": output_path.stat().st_size,
            "quality": _quality(args.get("quality")),
            "size": _size(args.get("size")),
            "metadata": meta,
        })
    except Exception as error:
        return _json({
            "ok": False,
            "tool": tool_name,
            "error": str(error),
            "allowed_roots": [str(root) for root in _allowed_roots()],
        })


def _image_edit_handler(args: dict[str, Any], **_: Any) -> str:
    return _run_edit(args, prompt=str(args.get("prompt") or ""), tool_name="image_edit")


def _image_erase_handler(args: dict[str, Any], **_: Any) -> str:
    target = str(args.get("target") or "").strip()
    if not target:
        return _json({"ok": False, "error": "target_required"})
    preserve = str(args.get("preserve") or "").strip()
    prompt = (
        f"Edit this image by removing {target}. Reconstruct the background naturally. "
        "Preserve composition, perspective, lighting, colors, faces, clothing, subject identity, "
        "and every area not directly related to the removal."
    )
    if preserve:
        prompt += f" Must preserve: {preserve}."
    return _run_edit(args, prompt=prompt, tool_name="image_erase")


def register(ctx) -> None:
    ctx.register_tool(
        name="image_edit",
        toolset="image_gen",
        schema=IMAGE_EDIT_SCHEMA,
        handler=_image_edit_handler,
        description="Scoped ChatGPT Image 2 editing for Hermes Mobile workspace images.",
        emoji="image",
    )
    ctx.register_tool(
        name="image_erase",
        toolset="image_gen",
        schema=IMAGE_ERASE_SCHEMA,
        handler=_image_erase_handler,
        description="Scoped ChatGPT Image 2 object/background erasure for Hermes Mobile workspace images.",
        emoji="image",
    )
