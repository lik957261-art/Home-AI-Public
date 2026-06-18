"""Current device environment context plugin for Home AI Gateway profiles."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any


CURRENT_ENVIRONMENT_SCHEMA = {
    "name": "current_environment",
    "description": (
        "Read Home AI's latest privacy-bounded current-device environment snapshot "
        "for the current account/workspace. Use this when the user asks about the "
        "current location, local weather, nearby context, outfit planning, travel, "
        "exercise, or other current-environment facts. If it is unavailable or the "
        "user asks about another city/destination, use normal weather/location tools "
        "or ask a bounded follow-up."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "workspace_id": {"type": "string", "description": "Current Home AI workspace id. Defaults to owner."},
            "principal_id": {"type": "string", "description": "Current run Principal/workspace principal. Defaults to workspace_id."},
            "device_id": {"type": "string", "description": "Optional native device/session id. Defaults to current."},
            "purpose": {
                "type": "string",
                "description": "Why the model needs the context.",
                "enum": ["weather", "outfit", "travel", "exercise", "nearby", "general"],
                "default": "general",
            },
            "target_at": {"type": "string", "description": "Optional target ISO time for the user's business request."},
            "precision": {
                "type": "string",
                "description": "Requested precision. The server may return less precise data.",
                "enum": ["city", "district", "approx_coordinate"],
                "default": "district",
            },
        },
    },
}


def _json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False)


def _bridge_host_url() -> str:
    return (
        os.environ.get("HERMES_MOBILE_BRIDGE_HOST_URL")
        or os.environ.get("HERMES_WEB_BRIDGE_HOST_URL")
        or "http://127.0.0.1:8798"
    ).rstrip("/")


def _bridge_host_key() -> str:
    raw = os.environ.get("HERMES_MOBILE_BRIDGE_HOST_KEY") or os.environ.get("HERMES_WEB_BRIDGE_HOST_KEY")
    if raw:
        return raw.strip()
    path = (
        os.environ.get("HERMES_MOBILE_BRIDGE_HOST_KEY_PATH")
        or os.environ.get("HERMES_WEB_BRIDGE_HOST_KEY_PATH")
        or "/mnt/c/ProgramData/HermesMobile/data/secrets/bridge-host.secret"
    )
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read().strip()
    except OSError:
        return ""


def _string(value: Any, fallback: str = "") -> str:
    text = str(value or "").strip()
    return text or fallback


def _payload(args: dict[str, Any]) -> dict[str, Any]:
    workspace_id = _string(args.get("workspace_id") or args.get("workspaceId"), "owner")
    return {
        "workspace_id": workspace_id,
        "principal_id": _string(args.get("principal_id") or args.get("principalId"), workspace_id),
        "device_id": _string(args.get("device_id") or args.get("deviceId"), "current"),
        "purpose": _string(args.get("purpose"), "general"),
        "target_at": _string(args.get("target_at") or args.get("targetAt")),
        "precision": _string(args.get("precision"), "district"),
    }


def _current_environment_handler(args: dict[str, Any], **_: Any) -> str:
    try:
        key = _bridge_host_key()
        if not key:
            return _json({"ok": False, "status": 503, "error": "Home AI bridge host key is not configured"})
        body = json.dumps(_payload(args if isinstance(args, dict) else {}), ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            f"{_bridge_host_url()}/bridge/current-environment",
            data=body,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Content-Length": str(len(body)),
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            raw = response.read(512 * 1024)
        parsed = json.loads(raw.decode("utf-8") or "{}")
        return _json(parsed if isinstance(parsed, dict) else {"ok": False, "error": "Invalid bridge response"})
    except urllib.error.HTTPError as error:
        try:
            parsed = json.loads(error.read(512 * 1024).decode("utf-8") or "{}")
        except Exception:
            parsed = {}
        if isinstance(parsed, dict) and parsed:
            parsed.setdefault("status", error.code)
            return _json(parsed)
        return _json({"ok": False, "status": error.code, "error": "current_environment_bridge_http_error"})
    except Exception as error:
        return _json({"ok": False, "status": 400, "error": str(error)})


def register(ctx) -> None:
    ctx.register_tool(
        name="current_environment",
        toolset="current_environment",
        schema=CURRENT_ENVIRONMENT_SCHEMA,
        handler=_current_environment_handler,
        description="Read the current Home AI native device environment snapshot.",
        emoji="location",
    )
    try:
        from model_tools import _tool_defs_cache
        _tool_defs_cache.clear()
    except Exception:
        pass
