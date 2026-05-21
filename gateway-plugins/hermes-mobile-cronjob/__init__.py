"""Scoped Hermes Mobile automation plugin for low-permission Gateway profiles."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any


DEFAULT_BRIDGE_URL = "http://127.0.0.1:8798"
DEFAULT_KEY_PATH = "/mnt/c/ProgramData/HermesMobile/data/secrets/bridge-host.secret"
MAX_BODY_BYTES = 2 * 1024 * 1024


MOBILE_CRONJOB_SCHEMA = {
    "name": "mobile_cronjob",
    "description": (
        "Manage current-principal Hermes Mobile automations through the live Mobile bridge host. "
        "Use this instead of raw profile-local cronjob for Hermes Mobile automation jobs. "
        "owner_principal_id is required and must match the current run Principal."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": [
                    "list",
                    "create",
                    "update",
                    "pause",
                    "resume",
                    "delete",
                    "read_output",
                    "read_deliverable",
                ],
                "default": "list",
            },
            "owner_principal_id": {
                "type": "string",
                "description": "Required current Hermes Mobile principal id, for example the current workspace account id.",
            },
            "job_id": {"type": "string"},
            "name": {"type": "string"},
            "prompt": {"type": "string"},
            "schedule": {
                "type": "string",
                "description": "Cron expression or supported Hermes schedule string for create/update.",
            },
            "skills": {"type": "array", "items": {"type": "string"}},
            "enabled_toolsets": {"type": "array", "items": {"type": "string"}},
            "model": {"type": "string"},
            "provider": {"type": "string"},
            "deliver": {"type": "string"},
            "workdir": {"type": "string"},
            "reason": {"type": "string"},
            "dry_run": {"type": "boolean", "default": False},
            "include_disabled": {"type": "boolean", "default": False},
            "limit": {"type": "integer", "default": 100},
            "file": {"type": "string"},
            "run": {"type": "string"},
            "index": {"type": "integer"},
        },
        "required": ["action", "owner_principal_id"],
    },
}


def _json_result(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def _bridge_url() -> str:
    return (
        os.environ.get("HERMES_MOBILE_BRIDGE_HOST_URL")
        or os.environ.get("HERMES_WEB_BRIDGE_HOST_URL")
        or DEFAULT_BRIDGE_URL
    ).rstrip("/")


def _read_text(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read().strip()
    except OSError:
        return ""


def _bridge_key() -> str:
    raw = os.environ.get("HERMES_MOBILE_BRIDGE_HOST_KEY") or os.environ.get("HERMES_WEB_BRIDGE_HOST_KEY")
    if raw:
        return raw.strip()
    path = (
        os.environ.get("HERMES_MOBILE_BRIDGE_HOST_KEY_PATH")
        or os.environ.get("HERMES_WEB_BRIDGE_HOST_KEY_PATH")
        or DEFAULT_KEY_PATH
    )
    return _read_text(path)


def _compact_list(value: Any, limit: int = 12) -> list[str]:
    raw = value if isinstance(value, list) else ([value] if value else [])
    out: list[str] = []
    for item in raw:
        text = str(item or "").strip()
        if text and text not in out:
            out.append(text)
        if len(out) >= limit:
            break
    return out


def _payload(args: dict[str, Any]) -> dict[str, Any]:
    action = str(args.get("action") or "list").strip().lower()
    owner = str(args.get("owner_principal_id") or args.get("ownerPrincipalId") or "").strip()
    if not owner:
        raise ValueError("owner_principal_id is required")

    payload: dict[str, Any] = {
        "action": action,
        "owner_principal_id": owner,
    }
    if args.get("dry_run") or args.get("dryRun"):
        payload["dry_run"] = True

    if action == "list":
        payload["include_disabled"] = bool(args.get("include_disabled") or args.get("includeDisabled"))
        try:
            payload["limit"] = int(args.get("limit") or 100)
        except (TypeError, ValueError):
            payload["limit"] = 100
        return payload

    if action in {"update", "pause", "resume", "delete", "read_output", "read_deliverable"}:
        job_id = str(args.get("job_id") or args.get("jobId") or "").strip()
        if not job_id:
            raise ValueError("job_id is required")
        payload["job_id"] = job_id

    if action == "create":
        prompt = str(args.get("prompt") or "").strip()
        schedule = str(args.get("schedule") or "").strip()
        if not prompt:
            raise ValueError("prompt is required")
        if not schedule:
            raise ValueError("schedule is required")
        payload["job"] = {
            "name": str(args.get("name") or "Hermes Mobile automation").strip()[:120],
            "prompt": prompt,
            "schedule": schedule,
            "skills": _compact_list(args.get("skills")),
            "enabled_toolsets": _compact_list(args.get("enabled_toolsets") or args.get("enabledToolsets")),
            "model": str(args.get("model") or "").strip() or None,
            "provider": str(args.get("provider") or "").strip() or None,
            "deliver": str(args.get("deliver") or "local").strip() or "local",
            "workdir": str(args.get("workdir") or "").strip() or None,
        }
        return payload

    if action == "update":
        patch: dict[str, Any] = {}
        for key in ["name", "prompt", "schedule", "model", "provider", "deliver", "workdir"]:
            if key in args:
                patch[key] = args.get(key)
        if "skills" in args:
            patch["skills"] = _compact_list(args.get("skills"))
        if "enabled_toolsets" in args or "enabledToolsets" in args:
            patch["enabled_toolsets"] = _compact_list(args.get("enabled_toolsets") or args.get("enabledToolsets"))
        if not patch:
            raise ValueError("update requires at least one patch field")
        payload["patch"] = patch
        return payload

    if action == "pause":
        payload["reason"] = str(args.get("reason") or "mobile_cronjob").strip() or "mobile_cronjob"
        return payload

    if action == "read_output":
        payload["file"] = str(args.get("file") or "").strip()
        return payload

    if action == "read_deliverable":
        payload["run"] = str(args.get("run") or "").strip()
        try:
            payload["index"] = int(args.get("index") or 0)
        except (TypeError, ValueError):
            payload["index"] = 0
        return payload

    if action in {"resume", "delete"}:
        return payload

    raise ValueError(f"Unsupported mobile_cronjob action: {action}")


def _request(payload: dict[str, Any]) -> dict[str, Any]:
    key = _bridge_key()
    if not key:
        return {
            "ok": False,
            "status": 503,
            "error": "Hermes Mobile bridge host key is not configured",
        }
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"{_bridge_url()}/bridge/cron",
        data=body,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            data = response.read(MAX_BODY_BYTES + 1)
            if len(data) > MAX_BODY_BYTES:
                return {"ok": False, "status": 502, "error": "Mobile cron bridge response was too large"}
            parsed = json.loads(data.decode("utf-8") or "{}")
            return parsed if isinstance(parsed, dict) else {"ok": False, "status": 502, "error": "Invalid bridge response"}
    except urllib.error.HTTPError as exc:
        data = exc.read(MAX_BODY_BYTES)
        try:
            parsed = json.loads(data.decode("utf-8") or "{}")
        except Exception:
            parsed = {}
        if isinstance(parsed, dict) and parsed:
            parsed.setdefault("status", exc.code)
            return parsed
        return {"ok": False, "status": exc.code, "error": "Mobile cron bridge HTTP error"}
    except Exception as exc:
        return {"ok": False, "status": 503, "error": f"Mobile cron bridge unavailable: {type(exc).__name__}"}


def mobile_cronjob(**kwargs: Any) -> str:
    try:
        payload = _payload(kwargs)
    except ValueError as exc:
        return _json_result({"ok": False, "status": 400, "error": str(exc)})
    return _json_result(_request(payload))


def register(ctx: Any) -> None:
    ctx.register_tool(
        "mobile_cronjob",
        mobile_cronjob,
        schema=MOBILE_CRONJOB_SCHEMA,
        toolset="cronjob",
    )
