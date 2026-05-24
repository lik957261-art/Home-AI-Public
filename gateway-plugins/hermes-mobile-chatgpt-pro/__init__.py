"""Owner-maintenance ChatGPT Pro bridge tool for Hermes Mobile."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any


MAX_TEXT_CHARS = 120_000
DEFAULT_TIMEOUT_SECONDS = 600
OWNER_MAINTENANCE_PROFILE_PREFIX = "officialclean"


CHATGPT_PRO_GENERATE_SCHEMA = {
    "name": "chatgpt_pro_generate",
    "description": (
        "Generate or draft text through the Owner-approved ChatGPT Pro bridge. "
        "This tool is only registered in Hermes Mobile owner-maintenance profiles. "
        "Use it only after the latest user request explicitly selected @ChatGPT Pro or asked for Pro-model generation."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Short task title for the generated result.",
            },
            "prompt": {
                "type": "string",
                "description": "The concrete generation request to send to ChatGPT Pro.",
            },
            "source_summary": {
                "type": "string",
                "description": "Bounded context summary. Do not include secrets, raw credentials, or unnecessary private logs.",
            },
            "output_format": {
                "type": "string",
                "enum": ["text", "markdown", "docx", "pdf", "html"],
                "description": "Requested output shape. Defaults to markdown.",
            },
            "language": {
                "type": "string",
                "description": "Preferred output language, for example zh-CN or en.",
            },
            "delivery_mode": {
                "type": "string",
                "enum": ["reply", "artifact", "both"],
                "description": "How the caller wants to use the result. The bridge may return text and/or an artifact reference.",
            },
        },
        "required": ["prompt"],
        "additionalProperties": False,
    },
}


def _json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False)


def _compact(value: Any, max_chars: int = MAX_TEXT_CHARS) -> str:
    text = str(value or "").strip()
    if len(text) <= max_chars:
        return text
    half = max_chars // 2
    return f"{text[:half]}\n\n[truncated: {len(text)} chars]\n\n{text[-half:]}"


def _current_profile_name() -> str:
    explicit = (
        os.environ.get("HERMES_PROFILE")
        or os.environ.get("HERMES_PROFILE_NAME")
        or os.environ.get("HERMES_LOW_GATEWAY_PROFILE")
        or ""
    ).strip()
    if explicit:
        return explicit
    home = os.environ.get("HERMES_HOME", "").strip().replace("\\", "/").rstrip("/")
    if "/profiles/" in home:
        return home.rsplit("/", 1)[-1]
    return ""


def _is_owner_maintenance_profile() -> bool:
    profile = _current_profile_name().lower()
    if profile.startswith(OWNER_MAINTENANCE_PROFILE_PREFIX):
        return True
    enabled = os.environ.get("HERMES_MOBILE_CHATGPT_PRO_ENABLE", "").strip().lower()
    return enabled in {"1", "true", "yes", "on"}


def _bridge_url() -> str:
    return (
        os.environ.get("HERMES_MOBILE_CHATGPT_PRO_BRIDGE_URL")
        or os.environ.get("HERMES_WEB_CHATGPT_PRO_BRIDGE_URL")
        or ""
    ).strip().rstrip("/")


def _timeout_seconds() -> int:
    raw = (
        os.environ.get("HERMES_MOBILE_CHATGPT_PRO_TIMEOUT_SECONDS")
        or os.environ.get("HERMES_WEB_CHATGPT_PRO_TIMEOUT_SECONDS")
        or ""
    ).strip()
    try:
        seconds = int(raw or DEFAULT_TIMEOUT_SECONDS)
    except ValueError:
        seconds = DEFAULT_TIMEOUT_SECONDS
    return max(30, min(seconds, 1800))


def _safe_payload(args: dict[str, Any]) -> dict[str, Any]:
    output_format = str(args.get("output_format") or "markdown").strip().lower() or "markdown"
    if output_format not in {"text", "markdown", "docx", "pdf", "html"}:
        output_format = "markdown"
    delivery_mode = str(args.get("delivery_mode") or "reply").strip().lower() or "reply"
    if delivery_mode not in {"reply", "artifact", "both"}:
        delivery_mode = "reply"
    return {
        "title": _compact(args.get("title"), 400),
        "prompt": _compact(args.get("prompt")),
        "source_summary": _compact(args.get("source_summary"), 40_000),
        "output_format": output_format,
        "language": _compact(args.get("language") or "zh-CN", 40),
        "delivery_mode": delivery_mode,
        "caller": "hermes-mobile-owner-maintenance-gateway",
    }


def _post_bridge(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Content-Length": str(len(data)),
            "User-Agent": "HermesMobileChatGPTPro/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=_timeout_seconds()) as response:
        text = response.read(2_000_000).decode("utf-8", errors="replace")
    try:
        parsed = json.loads(text)
    except Exception:
        return {"ok": True, "result_text": text, "source": "chatgpt-pro-bridge"}
    if isinstance(parsed, dict):
        return parsed
    return {"ok": True, "result": parsed, "source": "chatgpt-pro-bridge"}


def _chatgpt_pro_generate_handler(args: dict[str, Any], **_: Any) -> str:
    payload = _safe_payload(args)
    if not payload["prompt"]:
        return _json({"ok": False, "tool": "chatgpt_pro_generate", "error": "prompt_required"})
    url = _bridge_url()
    if not url:
        return _json({
            "ok": False,
            "tool": "chatgpt_pro_generate",
            "error": "chatgpt_pro_bridge_unconfigured",
            "message": "Set HERMES_MOBILE_CHATGPT_PRO_BRIDGE_URL to the local Codex/Chrome ChatGPT Pro bridge endpoint.",
        })
    try:
        result = _post_bridge(url, payload)
        if "ok" not in result:
            result["ok"] = True
        result.setdefault("tool", "chatgpt_pro_generate")
        result.setdefault("source", "chatgpt-pro-bridge")
        return _json(result)
    except urllib.error.HTTPError as error:
        body = error.read(2000).decode("utf-8", errors="replace") if hasattr(error, "read") else ""
        return _json({
            "ok": False,
            "tool": "chatgpt_pro_generate",
            "error": "chatgpt_pro_bridge_http_error",
            "status": getattr(error, "code", 0),
            "detail": _compact(body, 1200),
        })
    except Exception as error:
        return _json({
            "ok": False,
            "tool": "chatgpt_pro_generate",
            "error": "chatgpt_pro_bridge_failed",
            "detail": str(error),
        })


def register(ctx: Any) -> None:
    if not _is_owner_maintenance_profile():
        return
    ctx.register_tool(
        name="chatgpt_pro_generate",
        toolset="chatgpt_pro",
        schema=CHATGPT_PRO_GENERATE_SCHEMA,
        handler=_chatgpt_pro_generate_handler,
        description="Owner-approved ChatGPT Pro generation bridge.",
        emoji="pro",
    )
