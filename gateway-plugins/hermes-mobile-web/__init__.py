"""Fallback public web tools for Hermes Mobile Gateway profiles."""

from __future__ import annotations

import html
import ipaddress
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from typing import Any


MAX_EXTRACT_URLS = 5
MAX_EXTRACT_BYTES = 2_000_000
MAX_TEXT_CHARS = 20_000


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


def _json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False)


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
