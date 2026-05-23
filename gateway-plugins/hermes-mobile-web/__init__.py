"""Fallback public web tools for Hermes Mobile Gateway profiles."""

from __future__ import annotations

import copy
import html
import ipaddress
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from typing import Any


MAX_EXTRACT_URLS = 5
MAX_EXTRACT_BYTES = 2_000_000
MAX_TEXT_CHARS = 20_000
MAX_X_SEARCH_CHARS = 12_000
DEFAULT_X_SEARCH_PROXY_PORT = 18762


WEB_SEARCH_SCHEMA = {
    "name": "web_search",
    "description": (
        "Search public web pages. Uses the configured official Hermes web backend when available, "
        "otherwise uses the Hermes Mobile no-key public fallback."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query."},
            "limit": {
                "type": "integer",
                "description": "Maximum result count from 1 to 10. Defaults to 5.",
                "minimum": 1,
                "maximum": 10,
                "default": 5,
            },
        },
        "required": ["query"],
    },
}


WEB_EXTRACT_SCHEMA = {
    "name": "web_extract",
    "description": (
        "Extract text from public http(s) URLs. Uses the configured official Hermes web backend when "
        "available, otherwise uses the Hermes Mobile no-key public fallback. Private/local URLs are refused."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "urls": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Public http(s) URLs to extract, max 5.",
                "maxItems": MAX_EXTRACT_URLS,
            },
        },
        "required": ["urls"],
    },
}


def _schema_alias(schema: dict[str, Any], name: str) -> dict[str, Any]:
    aliased = copy.deepcopy(schema)
    aliased["name"] = name
    return aliased


MOBILE_WEB_SEARCH_SCHEMA = _schema_alias(WEB_SEARCH_SCHEMA, "mobile_web_search")
MOBILE_WEB_EXTRACT_SCHEMA = _schema_alias(WEB_EXTRACT_SCHEMA, "mobile_web_extract")


X_SEARCH_SCHEMA = {
    "name": "x_search",
    "description": (
        "Search public X/Twitter content through the dedicated Hermes Mobile Grok Gateway. "
        "Use this for current public discussion on X while keeping the current ChatGPT Gateway "
        "as the main answering model. The tool returns bounded Grok Gateway search findings for "
        "the current run to interpret."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "X/Twitter search query."},
            "limit": {
                "type": "integer",
                "description": "Maximum result count to request from 1 to 10. Defaults to 5.",
                "minimum": 1,
                "maximum": 10,
                "default": 5,
            },
        },
        "required": ["query"],
    },
}


def _json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False)


def _compact_text(value: Any, max_chars: int = MAX_X_SEARCH_CHARS) -> str:
    text = str(value or "").strip()
    if len(text) <= max_chars:
        return text
    side = max_chars // 2
    return f"{text[:side]}\n\n[truncated: {len(text)} chars]\n\n{text[-side:]}"


def _gateway_api_key() -> str:
    for path in (
        os.environ.get("HERMES_MOBILE_GATEWAY_API_KEY_PATH", ""),
        os.environ.get("HERMES_WEB_HERMES_API_KEY_PATH", ""),
        "/home/hermes/.hermes/api-server-key.secret",
    ):
        if not path:
            continue
        try:
            with open(path, "r", encoding="utf-8") as handle:
                key = handle.read().strip()
            if key:
                return key
        except OSError:
            continue
    key = os.environ.get("API_SERVER_KEY", "").strip()
    if key:
        return key
    return ""


def _x_search_proxy_url() -> str:
    raw = (
        os.environ.get("HERMES_MOBILE_X_SEARCH_PROXY_URL")
        or os.environ.get("HERMES_GROK_GATEWAY_URL")
        or ""
    ).strip()
    if raw:
        return raw.rstrip("/")
    port = os.environ.get("HERMES_MOBILE_X_SEARCH_PROXY_PORT", "").strip()
    try:
        parsed_port = int(port or DEFAULT_X_SEARCH_PROXY_PORT)
    except ValueError:
        parsed_port = DEFAULT_X_SEARCH_PROXY_PORT
    return f"http://127.0.0.1:{parsed_port}"


def _current_profile_name() -> str:
    explicit = os.environ.get("HERMES_PROFILE", "").strip()
    if explicit:
        return explicit
    home = os.environ.get("HERMES_HOME", "").strip().replace("\\", "/").rstrip("/")
    return home.rsplit("/", 1)[-1] if home else ""


def _is_grok_gateway_profile() -> bool:
    disabled = os.environ.get("HERMES_MOBILE_DISABLE_X_SEARCH_PROXY_TOOL", "").strip().lower()
    if disabled not in {"1", "true", "yes", "on"}:
        return False
    home = os.environ.get("HERMES_HOME", "").strip().replace("\\", "/").rstrip("/")
    profile = _current_profile_name().lower()
    return "/profiles/" in home and profile.startswith("grokgw")


def _parse_sse_frame(frame: str) -> dict[str, Any] | None:
    data_lines: list[str] = []
    event_name = ""
    for raw_line in str(frame or "").splitlines():
        line = raw_line.rstrip()
        if not line or line.startswith(":"):
            continue
        if line.startswith("event:"):
            event_name = line[6:].strip()
        elif line.startswith("data:"):
            data_lines.append(line[5:].lstrip())
    if not data_lines:
        return None
    try:
        parsed = json.loads("\n".join(data_lines))
    except json.JSONDecodeError:
        return None
    if event_name and isinstance(parsed, dict) and not parsed.get("event"):
        parsed["event"] = event_name
    return parsed if isinstance(parsed, dict) else None


def _completed_output(event: dict[str, Any]) -> str:
    response = event.get("response") if isinstance(event.get("response"), dict) else {}
    chunks: list[str] = []
    for item in response.get("output") if isinstance(response.get("output"), list) else []:
        if not isinstance(item, dict) or item.get("type") != "message":
            continue
        for part in item.get("content") if isinstance(item.get("content"), list) else []:
            if isinstance(part, dict) and part.get("type") == "output_text" and part.get("text"):
                chunks.append(str(part.get("text")))
    return "\n\n".join(chunks).strip()


def _proxy_x_search_response(query: str, limit: int) -> dict[str, Any]:
    key = _gateway_api_key()
    if not key:
        return {"ok": False, "error": "gateway_api_key_unavailable", "source": "grok-gateway-proxy"}

    prompt = (
        "Use the available x_search tool exactly once for this query, then return a concise JSON object "
        "with fields ok, query, results, and notes. Keep each result bounded with title/user/time/url/snippet "
        "when available. Do not invent X results.\n\n"
        f"Query: {query}\nLimit: {limit}"
    )
    body = json.dumps({
        "input": prompt,
        "stream": True,
        "store": False,
        "conversation": f"hermes-mobile-x-search-proxy-{abs(hash(query))}",
        "instructions": (
            "You are a Hermes Mobile XSearch proxy running on the dedicated Grok Gateway. "
            "Call x_search when available. Return only bounded search findings; no broad final answer."
        ),
    }, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"{_x_search_proxy_url()}/v1/responses",
        data=body,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            content_type = response.headers.get("content-type", "")
            raw = response.read(2_000_000).decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        detail = exc.read(800).decode("utf-8", errors="replace")
        return {
            "ok": False,
            "error": f"grok_gateway_http_{exc.code}",
            "detail": detail[:500],
            "source": "grok-gateway-proxy",
        }
    except Exception as exc:
        return {
            "ok": False,
            "error": "grok_gateway_proxy_failed",
            "detail": str(exc)[:500],
            "source": "grok-gateway-proxy",
        }

    output = ""
    if "text/event-stream" in content_type:
        for frame in raw.split("\n\n"):
            event = _parse_sse_frame(frame)
            if not event:
                continue
            if event.get("event") in {"response.output_text.delta", "message.delta"}:
                output += str(event.get("delta") or event.get("text") or "")
            if event.get("event") in {"response.completed", "run.completed"}:
                output = _completed_output(event) or output
    else:
        try:
            parsed = json.loads(raw)
            output = _completed_output({"response": parsed}) or json.dumps(parsed, ensure_ascii=False)
        except json.JSONDecodeError:
            output = raw
    return {
        "ok": True,
        "source": "grok-gateway-proxy",
        "query": query,
        "limit": limit,
        "data": _compact_text(output),
    }


def _official_web_available() -> bool:
    try:
        from tools.web_tools import check_web_api_key

        return bool(check_web_api_key())
    except Exception:
        return False


def _official_search(query: str, limit: int) -> str | None:
    if not _official_web_available():
        return None
    try:
        from tools.web_tools import web_search_tool

        return web_search_tool(query, limit=limit)
    except Exception:
        return None


async def _official_extract(urls: list[str]) -> str | None:
    if not _official_web_available():
        return None
    try:
        from tools.web_tools import web_extract_tool

        return await web_extract_tool(urls[:MAX_EXTRACT_URLS], "markdown")
    except Exception:
        return None


class _SearchParser(HTMLParser):
    def __init__(self, limit: int) -> None:
        super().__init__()
        self.limit = limit
        self.results: list[dict[str, Any]] = []
        self._active_href = ""
        self._active_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if len(self.results) >= self.limit:
            return
        if tag.lower() != "a":
            return
        attr = {key.lower(): (value or "") for key, value in attrs}
        class_value = attr.get("class", "")
        href = attr.get("href", "")
        if "result__a" not in class_value or not href:
            return
        self._active_href = href
        self._active_text = []

    def handle_data(self, data: str) -> None:
        if self._active_href:
            self._active_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != "a" or not self._active_href:
            return
        title = " ".join("".join(self._active_text).split())
        url = _unwrap_duckduckgo_url(self._active_href)
        if title and url:
            self.results.append({
                "title": html.unescape(title),
                "url": url,
                "description": "",
                "position": len(self.results) + 1,
            })
        self._active_href = ""
        self._active_text = []


class _TextExtractor(HTMLParser):
    SKIP_TAGS = {"script", "style", "noscript", "svg", "canvas"}

    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        lower = tag.lower()
        if lower in self.SKIP_TAGS:
            self._skip_depth += 1
        if lower in {"p", "div", "section", "article", "br", "li", "h1", "h2", "h3", "h4"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        lower = tag.lower()
        if lower in self.SKIP_TAGS and self._skip_depth:
            self._skip_depth -= 1
        if lower in {"p", "div", "section", "article", "li", "h1", "h2", "h3", "h4"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        text = " ".join(data.split())
        if text:
            self.parts.append(text)
            self.parts.append(" ")

    def text(self) -> str:
        compact = re.sub(r"\n{3,}", "\n\n", "".join(self.parts))
        compact = "\n".join(line.strip() for line in compact.splitlines())
        return compact.strip()


def _clamp_limit(value: Any) -> int:
    try:
        limit = int(value)
    except Exception:
        limit = 5
    return max(1, min(10, limit))


def _x_search_handler(args: dict[str, Any], **_: Any) -> str:
    query = str(args.get("query") or "").strip()
    if not query:
        return _json({"ok": False, "error": "query is required", "source": "grok-gateway-proxy"})
    limit = _clamp_limit(args.get("limit", 5))
    return _json(_proxy_x_search_response(query, limit))


def _fetch_text(url: str, timeout: int = 12, max_bytes: int = MAX_EXTRACT_BYTES) -> tuple[str, str]:
    request = urllib.request.Request(url, headers={"User-Agent": "HermesMobileWeb/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        content_type = response.headers.get("content-type", "")
        data = response.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ValueError("response_too_large")
    return data.decode("utf-8", errors="replace"), content_type


def _unwrap_duckduckgo_url(url: str) -> str:
    absolute = urllib.parse.urljoin("https://duckduckgo.com/", url)
    parsed = urllib.parse.urlparse(absolute)
    query = urllib.parse.parse_qs(parsed.query)
    if "uddg" in query and query["uddg"]:
        return query["uddg"][0]
    return absolute


def _is_private_or_local_host(hostname: str) -> bool:
    host = hostname.strip().lower().strip("[]")
    if not host:
        return True
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".localhost"):
        return True
    try:
        ip = ipaddress.ip_address(host)
        return bool(ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved)
    except ValueError:
        return False


def _validate_public_url(value: str) -> str:
    url = str(value or "").strip()
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("url must be an absolute public http(s) URL")
    if _is_private_or_local_host(parsed.hostname or ""):
        raise PermissionError("private_or_local_url_not_allowed")
    return url


def _fallback_search(query: str, limit: int) -> str:
    url = "https://html.duckduckgo.com/html/?" + urllib.parse.urlencode({"q": query})
    text, _ = _fetch_text(url, timeout=12, max_bytes=700_000)
    parser = _SearchParser(limit)
    parser.feed(text)
    return _json({
        "ok": True,
        "source": "duckduckgo-html-fallback",
        "query": query,
        "data": {"web": parser.results[:limit]},
    })


def _web_search_handler(args: dict[str, Any], **_: Any) -> str:
    query = str(args.get("query") or "").strip()
    if not query:
        return _json({"ok": False, "error": "query is required"})
    limit = _clamp_limit(args.get("limit", 5))
    official = _official_search(query, limit)
    if official is not None:
        return official
    try:
        return _fallback_search(query, limit)
    except Exception as exc:
        return _json({
            "ok": False,
            "error": "web_search_failed",
            "detail": str(exc),
            "source": "duckduckgo-html-fallback",
        })


def _extract_one(url: str) -> dict[str, Any]:
    public_url = _validate_public_url(url)
    text, content_type = _fetch_text(public_url)
    if "html" in content_type.lower() or "<html" in text[:500].lower():
        parser = _TextExtractor()
        parser.feed(text)
        body = parser.text()
    else:
        body = text.strip()
    truncated = len(body) > MAX_TEXT_CHARS
    if truncated:
        body = body[:MAX_TEXT_CHARS]
    return {
        "url": public_url,
        "content_type": content_type,
        "text": body,
        "truncated": truncated,
    }


async def _web_extract_handler(args: dict[str, Any], **_: Any) -> str:
    raw_urls = args.get("urls")
    urls = raw_urls if isinstance(raw_urls, list) else []
    urls = [str(item or "").strip() for item in urls if str(item or "").strip()][:MAX_EXTRACT_URLS]
    if not urls:
        return _json({"ok": False, "error": "urls are required"})
    official = await _official_extract(urls)
    if official is not None:
        return official
    results = []
    errors = []
    for url in urls:
        try:
            results.append(_extract_one(url))
        except Exception as exc:
            errors.append({"url": url, "error": str(exc)})
    return _json({
        "ok": bool(results),
        "source": "urllib-public-fallback",
        "data": results,
        "errors": errors,
    })


def register(ctx) -> None:
    if not _is_grok_gateway_profile():
        ctx.register_tool(
            name="x_search",
            toolset="web",
            schema=X_SEARCH_SCHEMA,
            handler=_x_search_handler,
            description="Proxy X/Twitter search through the dedicated Hermes Mobile Grok Gateway.",
            emoji="x",
            override=True,
        )
    ctx.register_tool(
        name="web_search",
        toolset="web",
        schema=WEB_SEARCH_SCHEMA,
        handler=_web_search_handler,
        description="Public web search with official backend preference and no-key fallback.",
        emoji="search",
    )
    ctx.register_tool(
        name="web_extract",
        toolset="web",
        schema=WEB_EXTRACT_SCHEMA,
        handler=_web_extract_handler,
        is_async=True,
        description="Public URL text extraction with official backend preference and no-key fallback.",
        emoji="web",
    )
    ctx.register_tool(
        name="mobile_web_search",
        toolset="web",
        schema=MOBILE_WEB_SEARCH_SCHEMA,
        handler=_web_search_handler,
        description="Stable Hermes Mobile public web search alias with official backend preference and no-key fallback.",
        emoji="search",
    )
    ctx.register_tool(
        name="mobile_web_extract",
        toolset="web",
        schema=MOBILE_WEB_EXTRACT_SCHEMA,
        handler=_web_extract_handler,
        is_async=True,
        description="Stable Hermes Mobile public URL extraction alias with official backend preference and no-key fallback.",
        emoji="web",
    )
