"""Scoped HTTP request plugin for Hermes Mobile Gateway profiles."""

from __future__ import annotations

import json
import mimetypes
import os
import re
import secrets
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
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
UPLOAD_ALLOWED_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"}
UPLOAD_CONTENT_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".heic": "image/heic",
    ".heif": "image/heif",
}


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
            "file_body": {
                "type": "object",
                "description": (
                    "Optional in-scope local image file to send as the raw request body. "
                    "Use this for endpoints such as POST /api/v1/items/{code}/photos with Content-Type image/jpeg. "
                    "The HTTP request carries file bytes; the target API does not receive a local path string."
                ),
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "In-scope local image path under HERMES_MOBILE_HTTP_FILE_ROOTS.",
                    },
                    "content_type": {
                        "type": "string",
                        "description": "Image content type, for example image/jpeg. Inferred from suffix when omitted.",
                    },
                    "filename": {
                        "type": "string",
                        "description": "Optional filename to send as X-Filename; defaults to the local file name.",
                    },
                },
                "required": ["path"],
            },
            "multipart_fields": {
                "type": "object",
                "description": "Optional non-file multipart form fields. Use with multipart_files.",
                "additionalProperties": {"type": ["string", "number", "boolean"]},
            },
            "multipart_files": {
                "type": "array",
                "description": (
                    "Optional in-scope local image files to send as multipart/form-data file parts. "
                    "Use for Program APIs that accept photos[] / photo / file parts."
                ),
                "items": {
                    "type": "object",
                    "properties": {
                        "field": {
                            "type": "string",
                            "description": "Multipart field name. Defaults to file.",
                        },
                        "path": {
                            "type": "string",
                            "description": "In-scope local image path under HERMES_MOBILE_HTTP_FILE_ROOTS.",
                        },
                        "content_type": {
                            "type": "string",
                            "description": "Image content type. Inferred from suffix when omitted.",
                        },
                        "filename": {
                            "type": "string",
                            "description": "Multipart filename. Defaults to the local file name.",
                        },
                    },
                    "required": ["path"],
                },
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


CRONJOB_MOBILE_SCHEMA = {
    "name": "cronjob_mobile",
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
                "enum": ["list", "create", "update", "pause", "resume", "delete", "read_output", "read_deliverable"],
                "default": "list",
            },
            "owner_principal_id": {"type": "string"},
            "job_id": {"type": "string"},
            "name": {"type": "string"},
            "prompt": {"type": "string"},
            "schedule": {"type": "string"},
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


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D401
        return None


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


def _string_list(value: Any, limit: int = 12) -> list[str]:
    raw = value if isinstance(value, list) else ([value] if value else [])
    out: list[str] = []
    for item in raw:
        text = str(item or "").strip()
        if text and text not in out:
            out.append(text)
        if len(out) >= limit:
            break
    return out


def _cronjob_mobile_payload(args: dict[str, Any]) -> dict[str, Any]:
    action = str(args.get("action") or "list").strip().lower()
    owner = str(args.get("owner_principal_id") or args.get("ownerPrincipalId") or "").strip()
    if not owner:
        raise ValueError("owner_principal_id is required")
    payload: dict[str, Any] = {"action": action, "owner_principal_id": owner}
    if args.get("dry_run") or args.get("dryRun"):
        payload["dry_run"] = True
    if action == "list":
        payload["include_disabled"] = bool(args.get("include_disabled") or args.get("includeDisabled"))
        payload["limit"] = int(args.get("limit") or 100)
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
            "skills": _string_list(args.get("skills")),
            "enabled_toolsets": _string_list(args.get("enabled_toolsets") or args.get("enabledToolsets")),
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
            patch["skills"] = _string_list(args.get("skills"))
        if "enabled_toolsets" in args or "enabledToolsets" in args:
            patch["enabled_toolsets"] = _string_list(args.get("enabled_toolsets") or args.get("enabledToolsets"))
        if not patch:
            raise ValueError("update requires at least one patch field")
        payload["patch"] = patch
        return payload
    if action == "pause":
        payload["reason"] = str(args.get("reason") or "cronjob_mobile").strip() or "cronjob_mobile"
        return payload
    if action == "read_output":
        payload["file"] = str(args.get("file") or "").strip()
        return payload
    if action == "read_deliverable":
        payload["run"] = str(args.get("run") or "").strip()
        payload["index"] = int(args.get("index") or 0)
        return payload
    if action in {"resume", "delete"}:
        return payload
    raise ValueError(f"Unsupported cronjob_mobile action: {action}")


def _cronjob_mobile_handler(args: dict[str, Any], **_: Any) -> str:
    try:
        payload = _cronjob_mobile_payload(args if isinstance(args, dict) else {})
        key = _bridge_host_key()
        if not key:
            return _json({"ok": False, "status": 503, "error": "Hermes Mobile bridge host key is not configured"})
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            f"{_bridge_host_url()}/bridge/cron",
            data=body,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Content-Length": str(len(body)),
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=20) as response:
            data = response.read(2 * 1024 * 1024)
        parsed = json.loads(data.decode("utf-8") or "{}")
        return _json(parsed if isinstance(parsed, dict) else {"ok": False, "error": "Invalid bridge response"})
    except urllib.error.HTTPError as error:
        try:
            parsed = json.loads(error.read(1024 * 1024).decode("utf-8") or "{}")
        except Exception:
            parsed = {}
        if isinstance(parsed, dict) and parsed:
            parsed.setdefault("status", error.code)
            return _json(parsed)
        return _json({"ok": False, "status": error.code, "error": "Mobile cron bridge HTTP error"})
    except Exception as error:
        return _json({"ok": False, "status": 400, "error": str(error)})


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


def _file_roots() -> list[Path]:
    roots = []
    for item in _split_env_list("HERMES_MOBILE_HTTP_FILE_ROOTS", DEFAULT_CREDENTIAL_ROOTS):
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
        "content-length",
        "proxy-authorization",
        "transfer-encoding",
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


def _max_upload_bytes() -> int:
    try:
        number = int(os.environ.get("HERMES_MOBILE_HTTP_FILE_MAX_BYTES", str(MAX_UPLOAD_BYTES)))
    except Exception:
        number = MAX_UPLOAD_BYTES
    return max(1024, min(80 * 1024 * 1024, number))


def _safe_form_name(value: Any, default: str = "file") -> str:
    name = str(value or default).strip()
    if not re.match(r"^[A-Za-z0-9_.\-\[\]]{1,80}$", name):
        raise ValueError(f"invalid_multipart_field: {name}")
    return name


def _safe_filename(value: Any, fallback: str) -> str:
    name = Path(str(value or fallback).strip().replace("\\", "/")).name
    name = re.sub(r"[\r\n\x00]+", "", name).strip()
    if not name:
        name = fallback
    return name[:160]


def _upload_content_type(path: Path, supplied: Any) -> str:
    content_type = str(supplied or "").split(";", 1)[0].strip().lower()
    if not content_type:
        content_type = UPLOAD_CONTENT_TYPES.get(path.suffix.lower()) or (mimetypes.guess_type(path.name)[0] or "")
    if not content_type:
        content_type = "application/octet-stream"
    return content_type


def _load_upload_file(spec: Any, index: int = 1) -> dict[str, Any]:
    if not isinstance(spec, dict):
        raise ValueError(f"upload_file_{index}_invalid")
    path_text = str(spec.get("path") or "").strip()
    if not path_text:
        raise ValueError(f"upload_file_{index}_missing_path")
    path = Path(_windows_to_wsl_path(path_text))
    if not _inside_roots(path, _file_roots()):
        raise PermissionError("file_path_outside_allowed_roots")
    try:
        resolved = path.resolve()
        stat = resolved.stat()
    except FileNotFoundError:
        raise FileNotFoundError("file_path_not_found") from None
    if not resolved.is_file():
        raise ValueError("file_path_not_file")
    suffix = resolved.suffix.lower()
    if suffix not in UPLOAD_ALLOWED_SUFFIXES:
        raise ValueError(f"unsupported_file_suffix: {suffix or '<none>'}")
    limit = _max_upload_bytes()
    if stat.st_size > limit:
        raise ValueError("file_too_large")
    content_type = _upload_content_type(resolved, spec.get("content_type"))
    if not content_type.startswith("image/"):
        raise ValueError(f"unsupported_file_content_type: {content_type}")
    content = resolved.read_bytes()
    if len(content) > limit:
        raise ValueError("file_too_large")
    return {
        "filename": _safe_filename(spec.get("filename"), resolved.name),
        "content_type": content_type,
        "content": content,
        "bytes": len(content),
    }


def _body_mode_count(args: dict[str, Any]) -> int:
    return sum(
        1
        for present in (
            "json" in args and args.get("json") is not None,
            args.get("body") is not None,
            args.get("file_body") is not None,
            bool(args.get("multipart_files")),
        )
        if present
    )


def _multipart_body(args: dict[str, Any], headers: dict[str, str]) -> tuple[bytes, dict[str, Any]]:
    files = args.get("multipart_files")
    if not isinstance(files, list) or not files:
        raise ValueError("multipart_files_required")
    fields = args.get("multipart_fields") or {}
    if not isinstance(fields, dict):
        raise ValueError("multipart_fields_must_be_object")
    boundary = f"----HermesMobileHTTP{secrets.token_hex(16)}"
    chunks: list[bytes] = []
    for raw_name, raw_value in fields.items():
        name = _safe_form_name(raw_name, "field")
        chunks.extend(
            [
                f"--{boundary}\r\n".encode("ascii"),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("ascii"),
                str(raw_value).encode("utf-8"),
                b"\r\n",
            ]
        )
    file_names: list[str] = []
    total_file_bytes = 0
    for index, spec in enumerate(files, start=1):
        if not isinstance(spec, dict):
            raise ValueError(f"multipart_file_{index}_invalid")
        field = _safe_form_name(spec.get("field"), "file")
        loaded = _load_upload_file(spec, index)
        file_names.append(loaded["filename"])
        total_file_bytes += int(loaded["bytes"])
        chunks.extend(
            [
                f"--{boundary}\r\n".encode("ascii"),
                (
                    f'Content-Disposition: form-data; name="{field}"; '
                    f'filename="{loaded["filename"]}"\r\n'
                ).encode("utf-8"),
                f'Content-Type: {loaded["content_type"]}\r\n\r\n'.encode("ascii"),
                loaded["content"],
                b"\r\n",
            ]
        )
    chunks.append(f"--{boundary}--\r\n".encode("ascii"))
    body = b"".join(chunks)
    if total_file_bytes > _max_upload_bytes() or len(body) > _max_upload_bytes() + 1024 * 1024:
        raise ValueError("multipart_body_too_large")
    headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    return body, {
        "request_body_mode": "multipart",
        "request_file_count": len(file_names),
        "request_file_names": file_names,
        "request_body_bytes": len(body),
    }


def _body(args: dict[str, Any], headers: dict[str, str]) -> tuple[bytes | None, dict[str, Any]]:
    if _body_mode_count(args) > 1:
        raise ValueError("multiple_request_bodies")
    if args.get("multipart_files"):
        return _multipart_body(args, headers)
    if args.get("file_body") is not None:
        loaded = _load_upload_file(args.get("file_body"), 1)
        headers.setdefault("Content-Type", loaded["content_type"])
        headers.setdefault("X-Filename", loaded["filename"])
        return loaded["content"], {
            "request_body_mode": "file_body",
            "request_file_count": 1,
            "request_file_names": [loaded["filename"]],
            "request_body_bytes": int(loaded["bytes"]),
        }
    if "json" in args and args.get("json") is not None:
        headers.setdefault("Content-Type", "application/json")
        body = json.dumps(args.get("json"), ensure_ascii=False).encode("utf-8")
        return body, {"request_body_mode": "json", "request_body_bytes": len(body)}
    body = args.get("body")
    if body is None:
        return None, {"request_body_mode": "none", "request_body_bytes": 0}
    encoded = str(body).encode("utf-8")
    return encoded, {"request_body_mode": "text", "request_body_bytes": len(encoded)}


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
        data, request_meta = _body(args, headers)
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
                payload.update(request_meta)
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
            payload.update(request_meta)
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
    ctx.register_tool(
        name="cronjob_mobile",
        toolset="http",
        schema=CRONJOB_MOBILE_SCHEMA,
        handler=_cronjob_mobile_handler,
        description="Scoped Hermes Mobile automation management through the live Mobile bridge.",
        emoji="automation",
    )
