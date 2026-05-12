"""Scoped HTTP request plugin for Hermes Mobile Gateway profiles."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_ALLOWED_ORIGINS = (
    "http://192.168.10.99:8765",
    "https://wardrobe-xuxin.synology.me",
)
DEFAULT_CREDENTIAL_ROOTS = (
    "/mnt/c/ProgramData/HermesMobile/data/drive/users",
)
TOKEN_RE = re.compile(r"\bwd_live_[A-Za-z0-9._-]{12,}\b")
MAX_RESPONSE_BYTES = 1024 * 1024


HTTP_REQUEST_SCHEMA = {
    "name": "http_request",
    "description": (
        "Make a scoped HTTP(S) request to a documented current-workspace Program API. "
        "Use this for low-permission workspace APIs such as the wardrobe manifest/bundle "
        "when the endpoint and credential are documented in an allowed workspace file. "
        "Do not pass raw Authorization headers; pass credential_path so the tool can load "
        "and redact the Bearer token internally."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "url": {
                "type": "string",
                "description": "Full http:// or https:// URL. The origin must be on the Hermes Mobile HTTP allowlist.",
            },
            "method": {
                "type": "string",
                "description": "HTTP method. Defaults to GET.",
                "enum": ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
                "default": "GET",
            },
            "headers": {
                "type": "object",
                "description": "Non-secret headers. Authorization, Cookie, Host, and proxy headers are rejected.",
                "additionalProperties": {"type": "string"},
            },
            "json": {
                "type": "object",
                "description": "Optional JSON request body for POST/PUT/PATCH requests.",
            },
            "body": {
                "type": "string",
                "description": "Optional raw UTF-8 request body. Prefer json for JSON APIs.",
            },
            "credential_path": {
                "type": "string",
                "description": (
                    "Optional in-scope workspace rule file containing the Program API Access Key. "
                    "For wardrobe APIs, the tool extracts wd_live_... and sends it as Bearer without echoing it."
                ),
            },
            "credential_kind": {
                "type": "string",
                "description": "Credential parser to use. Defaults to wardrobe_live_key.",
                "enum": ["wardrobe_live_key"],
                "default": "wardrobe_live_key",
            },
            "timeout_seconds": {
                "type": "integer",
                "description": "Request timeout from 1 to 20 seconds. Defaults to 10.",
                "minimum": 1,
                "maximum": 20,
                "default": 10,
            },
            "max_bytes": {
                "type": "integer",
                "description": "Maximum response bytes to return, from 1024 to 1048576. Defaults to 262144.",
                "minimum": 1024,
                "maximum": MAX_RESPONSE_BYTES,
                "default": 262144,
            },
        },
        "required": ["url"],
    },
}


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D401
        return None


def _json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False)


def _split_env_list(name: str, defaults: tuple[str, ...]) -> list[str]:
    raw = os.environ.get(name, "")
    if not raw.strip():
        return list(defaults)
    return [item.strip() for item in re.split(r"[;,\s]+", raw) if item.strip()]


def _origin(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("url must be an absolute http:// or https:// URL")
    host = parsed.hostname or ""
    port = f":{parsed.port}" if parsed.port else ""
    return f"{parsed.scheme}://{host.lower()}{port}"


def _allowed_origins() -> list[str]:
    origins = []
    for item in _split_env_list("HERMES_MOBILE_HTTP_ALLOWED_ORIGINS", DEFAULT_ALLOWED_ORIGINS):
        try:
            origins.append(_origin(item))
        except Exception:
            continue
    return sorted(set(origins))


def _check_allowed_url(url: str) -> str:
    origin = _origin(url)
    if origin not in _allowed_origins():
        raise PermissionError(f"origin_not_allowed: {origin}")
    return origin


def _windows_to_wsl_path(value: str) -> str:
    text = value.strip().strip('"').strip("'")
    match = re.match(r"^([A-Za-z]):[\\/](.*)$", text)
    if match:
        drive = match.group(1).lower()
        rest = match.group(2).replace("\\", "/")
        return f"/mnt/{drive}/{rest}"
    return text


def _credential_roots() -> list[Path]:
    roots = []
    for item in _split_env_list("HERMES_MOBILE_HTTP_CREDENTIAL_ROOTS", DEFAULT_CREDENTIAL_ROOTS):
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


def _load_credential(path_value: Any, kind: str) -> tuple[str | None, str | None]:
    path_text = str(path_value or "").strip()
    if not path_text:
        return None, None
    if kind != "wardrobe_live_key":
        raise ValueError("unsupported credential_kind")
    path = Path(_windows_to_wsl_path(path_text))
    if not _inside_roots(path, _credential_roots()):
        raise PermissionError("credential_path_outside_allowed_roots")
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except FileNotFoundError:
        raise FileNotFoundError("credential_path_not_found") from None
    if len(text) > 1024 * 1024:
        text = text[: 1024 * 1024]
    match = TOKEN_RE.search(text)
    if not match:
        raise ValueError("credential_not_found")
    return match.group(0), str(path)


def _clean_headers(value: Any) -> dict[str, str]:
    headers: dict[str, str] = {}
    if not isinstance(value, dict):
        return headers
    blocked = {
        "authorization",
        "cookie",
        "host",
        "proxy-authorization",
        "x-forwarded-for",
        "x-real-ip",
    }
    for raw_key, raw_value in value.items():
        key = str(raw_key or "").strip()
        if not key:
            continue
        lowered = key.lower()
        if lowered in blocked or lowered.startswith("sec-"):
            raise PermissionError(f"header_not_allowed: {key}")
        if not re.match(r"^[A-Za-z0-9!#$%&'*+.^_`|~-]+$", key):
            raise ValueError(f"invalid_header: {key}")
        headers[key] = str(raw_value)
    return headers


def _timeout(value: Any) -> int:
    try:
        number = int(value)
    except Exception:
        number = 10
    return max(1, min(20, number))


def _max_bytes(value: Any) -> int:
    try:
        number = int(value)
    except Exception:
        number = 262144
    return max(1024, min(MAX_RESPONSE_BYTES, number))


def _body(args: dict[str, Any], headers: dict[str, str]) -> bytes | None:
    if "json" in args and args.get("json") is not None:
        headers.setdefault("Content-Type", "application/json")
        return json.dumps(args.get("json"), ensure_ascii=False).encode("utf-8")
    body = args.get("body")
    if body is None:
        return None
    return str(body).encode("utf-8")


def _parse_response(data: bytes, content_type: str) -> dict[str, Any]:
    text = data.decode("utf-8", errors="replace")
    if "json" in content_type.lower():
        try:
            return {"json": json.loads(text)}
        except Exception:
            return {"text": text, "json_parse_error": True}
    stripped = text.lstrip()
    if stripped.startswith("{") or stripped.startswith("["):
        try:
            return {"json": json.loads(text)}
        except Exception:
            pass
    return {"text": text}


def _http_request_handler(args: dict[str, Any], **_: Any) -> str:
    url = str(args.get("url") or "").strip()
    method = str(args.get("method") or "GET").strip().upper() or "GET"
    if method not in {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"}:
        return _json({"ok": False, "error": "method_not_allowed", "method": method})
    try:
        origin = _check_allowed_url(url)
        headers = _clean_headers(args.get("headers"))
        token, credential_path = _load_credential(args.get("credential_path"), str(args.get("credential_kind") or "wardrobe_live_key"))
        if token:
            headers["Authorization"] = f"Bearer {token}"
        headers.setdefault("Accept", "application/json, text/plain;q=0.9, */*;q=0.1")
        headers.setdefault("User-Agent", "HermesMobileHTTP/1.0")
        data = _body(args, headers)
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        opener = urllib.request.build_opener(_NoRedirect)
        limit = _max_bytes(args.get("max_bytes"))
        try:
            with opener.open(request, timeout=_timeout(args.get("timeout_seconds"))) as response:
                raw = response.read(limit + 1)
                truncated = len(raw) > limit
                raw = raw[:limit]
                content_type = response.headers.get("content-type", "")
                payload = {
                    "ok": 200 <= int(response.status) < 300,
                    "status": int(response.status),
                    "reason": response.reason,
                    "url": response.geturl(),
                    "origin": origin,
                    "content_type": content_type,
                    "bytes": len(raw),
                    "truncated": truncated,
                    "credential_loaded": bool(token),
                    "credential_path": credential_path or "",
                }
                if method != "HEAD":
                    payload.update(_parse_response(raw, content_type))
                return _json(payload)
        except urllib.error.HTTPError as error:
            raw = error.read(limit + 1)
            truncated = len(raw) > limit
            raw = raw[:limit]
            content_type = error.headers.get("content-type", "")
            payload = {
                "ok": False,
                "status": int(error.code),
                "reason": error.reason,
                "url": url,
                "origin": origin,
                "content_type": content_type,
                "bytes": len(raw),
                "truncated": truncated,
                "credential_loaded": bool(token),
                "credential_path": credential_path or "",
            }
            payload.update(_parse_response(raw, content_type))
            return _json(payload)
    except Exception as error:
        return _json({
            "ok": False,
            "error": str(error),
            "allowed_origins": _allowed_origins(),
        })


def register(ctx) -> None:
    ctx.register_tool(
        name="http_request",
        toolset="http",
        schema=HTTP_REQUEST_SCHEMA,
        handler=_http_request_handler,
        description="Scoped HTTP request for documented Hermes Mobile workspace Program APIs.",
        emoji="http",
    )
