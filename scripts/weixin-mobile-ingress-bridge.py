#!/usr/bin/env python3
"""Bridge native Weixin polling into Hermes Mobile ingress.

The native Hermes Weixin adapter owns iLink polling and media download. This
bridge overrides the message handler so inbound events are posted to Hermes
Mobile instead of being answered by the legacy standalone Gateway process.
Hermes Mobile then applies workspace routing, access policy, Gateway Pool
scheduling, and outbound delivery state.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit


DEFAULT_MOBILE_BASE_URL = "http://127.0.0.1:8797"
DEFAULT_STATE_DIR = "weixin-mobile-ingress"
DEFAULT_ROUTE_MAP = "/mnt/c/ProgramData/HermesMobile/data/config/access-control/weixin-routing-map.json"


def add_runtime_path() -> None:
    runtime_source = os.environ.get("HERMES_MOBILE_WEIXIN_RUNTIME_SOURCE", "").strip()
    if not runtime_source:
        runtime_root = os.environ.get("HERMES_MOBILE_WEIXIN_RUNTIME_ROOT", "/opt/hermes-gateway-runtime").strip()
        runtime_source = f"{runtime_root.rstrip('/')}/official-clean"
    if runtime_source and runtime_source not in sys.path:
        sys.path.insert(0, runtime_source)


def hermes_home() -> Path:
    return Path(os.environ.get("HERMES_HOME") or Path.home() / ".hermes").expanduser()


def load_dotenv() -> None:
    add_runtime_path()
    try:
        from hermes_cli.config import load_env
    except Exception:
        return
    for key, value in load_env().items():
        os.environ.setdefault(key, value)


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def log(message: str) -> None:
    print(f"{now_iso()} {message}", flush=True)


def wsl_path(value: str) -> str:
    text = str(value or "").strip().strip('"')
    if not text:
        return ""
    if not running_under_wsl():
        return text
    text = text.replace("\\", "/")
    if len(text) >= 3 and text[1] == ":" and text[2] == "/":
        drive = text[0].lower()
        return f"/mnt/{drive}/{text[3:]}"
    return text


def state_dir_from_env() -> Path:
    raw = os.environ.get("HERMES_MOBILE_WEIXIN_BRIDGE_STATE_DIR", "").strip()
    if raw:
        return Path(wsl_path(raw)).expanduser()
    return hermes_home() / DEFAULT_STATE_DIR


def running_under_wsl() -> bool:
    try:
        text = Path("/proc/sys/kernel/osrelease").read_text(encoding="utf-8", errors="ignore").lower()
        return "microsoft" in text or "wsl" in text
    except Exception:
        return False


def windows_host_from_wsl() -> str:
    try:
        output = subprocess.check_output(
            ["sh", "-lc", "ip route | awk '/default/{print $3; exit}'"],
            text=True,
            timeout=2,
        ).strip()
        return output
    except Exception:
        return ""


def resolve_mobile_base_url(value: str) -> str:
    raw = (value or DEFAULT_MOBILE_BASE_URL).strip().rstrip("/")
    parsed = urlsplit(raw)
    if not running_under_wsl() or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        return raw
    host = windows_host_from_wsl()
    if not host:
        return raw
    netloc = host
    if parsed.port:
        netloc = f"{host}:{parsed.port}"
    return urlunsplit((parsed.scheme or "http", netloc, parsed.path or "", parsed.query or "", parsed.fragment or "")).rstrip("/")


def first_existing_path(*values: str) -> str:
    for value in values:
        path = wsl_path(value)
        if path and Path(path).exists():
            return path
    return ""


def read_first_line(path: str) -> str:
    if not path:
        return ""
    try:
        return Path(wsl_path(path)).read_text(encoding="utf-8").splitlines()[0].strip()
    except Exception:
        return ""


def ingress_key() -> str:
    value = os.environ.get("HERMES_MOBILE_WEIXIN_INGRESS_KEY", "").strip()
    if value:
        return value
    for key in (
        "HERMES_MOBILE_WEIXIN_INGRESS_KEY_FILE",
        "HERMES_MOBILE_WEIXIN_INGRESS_KEY_PATH",
        "HERMES_WEB_WEIXIN_INGRESS_KEY_PATH",
    ):
        value = read_first_line(os.environ.get(key, ""))
        if value:
            return value
    return ""


def route_map_path() -> str:
    return first_existing_path(
        os.environ.get("HERMES_MOBILE_WEIXIN_ROUTE_MAP_PATH", ""),
        os.environ.get("HERMES_WEB_WEIXIN_ROUTE_MAP_PATH", ""),
        DEFAULT_ROUTE_MAP,
    )


def safe_size(path: str) -> int:
    try:
        return Path(path).stat().st_size
    except Exception:
        return 0


def mime_from_path(path: str) -> str:
    ext = Path(path).suffix.lower()
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".wav": "audio/wav",
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".md": "text/markdown",
        ".txt": "text/plain",
        ".json": "application/json",
        ".csv": "text/csv",
        ".zip": "application/zip",
    }.get(ext, "application/octet-stream")


def stable_event_id(account_id: str, chat_id: str, user_id: str, text: str, paths: list[str], timestamp: str) -> str:
    payload = json.dumps(
        {
            "accountId": account_id,
            "chatId": chat_id,
            "userId": user_id,
            "text": text,
            "paths": paths,
            "timestamp": timestamp,
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    return "wx_" + hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]


@dataclass
class Route:
    account_id: str
    chat_id: str
    user_id: str
    principal_id: str
    principal_label: str
    workspace_id: str
    default_workspace: str


class RouteBook:
    def __init__(self, path: str) -> None:
        self.path = path
        self.routes = self._load(path)

    def _load(self, path: str) -> list[Route]:
        if not path:
            return []
        try:
            data = json.loads(Path(path).read_text(encoding="utf-8"))
        except Exception as exc:
            log(f"route map unavailable: {exc}")
            return []
        raw_routes = data.get("routes") if isinstance(data, dict) else data
        if isinstance(raw_routes, dict):
            items = list(raw_routes.values())
        elif isinstance(raw_routes, list):
            items = raw_routes
        else:
            items = []
        routes: list[Route] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            principal_id = str(item.get("principal_id") or item.get("principalId") or "").strip()
            if not principal_id:
                continue
            routes.append(
                Route(
                    account_id=str(item.get("adapter_account_id") or item.get("account_id") or "").strip(),
                    chat_id=str(item.get("chat_id") or "").strip(),
                    user_id=str(item.get("user_id") or "").strip(),
                    principal_id=principal_id,
                    principal_label=str(item.get("principal_label") or principal_id).strip(),
                    workspace_id="owner" if principal_id == "owner" else principal_id,
                    default_workspace=wsl_path(str(item.get("default_workspace") or "").strip()),
                )
            )
        return routes

    def match(self, account_id: str, chat_id: str, user_id: str) -> Route | None:
        account_id = str(account_id or "").strip()
        chat_id = str(chat_id or "").strip()
        user_id = str(user_id or "").strip()
        for route in self.routes:
            if route.account_id and route.account_id != account_id:
                continue
            if route.chat_id and route.chat_id in {chat_id, user_id}:
                return route
            if route.user_id and route.user_id in {chat_id, user_id}:
                return route
        for route in self.routes:
            if route.account_id == account_id and route.principal_id == "owner":
                return route
        return None


class MobileIngressBridge:
    def __init__(self, args: argparse.Namespace) -> None:
        self.base_url = resolve_mobile_base_url(args.base_url or os.environ.get("HERMES_MOBILE_BASE_URL") or DEFAULT_MOBILE_BASE_URL)
        self.key = ingress_key()
        if not self.key:
            raise SystemExit("missing Hermes Mobile Weixin ingress key")
        self.state_dir = Path(wsl_path(args.state_dir or "")) if args.state_dir else state_dir_from_env()
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.pid_file = self.state_dir / "bridge.pid"
        self.status_file = self.state_dir / "status.json"
        self.route_book = RouteBook(args.route_map or route_map_path())
        self.poll_interval = max(1.0, float(args.outbound_interval))
        self.http_timeout = max(5.0, float(args.http_timeout))
        self.adapters: dict[str, Any] = {}
        self.stop_event = asyncio.Event()
        self._http_session: Any = None

    async def request_json(self, method: str, path: str, body: Any | None = None) -> Any:
        import aiohttp

        if self._http_session is None or self._http_session.closed:
            timeout = aiohttp.ClientTimeout(total=self.http_timeout)
            self._http_session = aiohttp.ClientSession(timeout=timeout)
        headers = {
            "Accept": "application/json",
            "X-Hermes-Mobile-Ingress-Key": self.key,
        }
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json; charset=utf-8"
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        async with self._http_session.request(method, f"{self.base_url}{path}", data=data, headers=headers) as response:
            text = await response.text()
            try:
                payload = json.loads(text) if text else {}
            except Exception:
                payload = {"raw": text[:500]}
            if response.status >= 400:
                raise RuntimeError(f"Mobile ingress HTTP {response.status}: {payload}")
            return payload

    async def close(self) -> None:
        if self._http_session is not None and not self._http_session.closed:
            await self._http_session.close()
        for adapter in list(self.adapters.values()):
            try:
                await adapter.disconnect()
            except Exception as exc:
                log(f"adapter disconnect warning: {exc}")

    def write_status(self, extra: dict[str, Any] | None = None) -> None:
        status = {
            "pid": os.getpid(),
            "updatedAt": now_iso(),
            "baseUrl": self.base_url,
            "routeMap": self.route_book.path,
            "connectedAccounts": sorted(self.adapters.keys()),
            "mode": "mobile-ingress",
        }
        if extra:
            status.update(extra)
        self.pid_file.write_text(str(os.getpid()), encoding="utf-8")
        self.status_file.write_text(json.dumps(status, ensure_ascii=False, indent=2), encoding="utf-8")

    def materialize_attachment(self, source_path: str, route: Route | None) -> str:
        local = Path(wsl_path(source_path))
        if not local.exists() or not local.is_file() or route is None or not route.default_workspace:
            return str(local)
        root = Path(route.default_workspace)
        if not root.exists():
            return str(local)
        target_dir = root / "系统分享"
        target_dir.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha1(str(local).encode("utf-8")).hexdigest()[:8]
        target = target_dir / f"{local.stem}-{digest}{local.suffix}"
        try:
            shutil.copy2(local, target)
            return str(target)
        except Exception as exc:
            log(f"attachment copy warning: {local.name}: {exc}")
            return str(local)

    async def post_inbound_event(self, adapter: Any, event: Any) -> None:
        source = event.source
        account_id = str(getattr(adapter, "_account_id", "") or "").strip()
        chat_id = str(getattr(source, "chat_id", "") or "").strip()
        user_id = str(getattr(source, "user_id", "") or "").strip()
        route = self.route_book.match(account_id, chat_id, user_id)
        timestamp = event.timestamp.isoformat() if getattr(event, "timestamp", None) else now_iso()
        raw_paths = [str(path) for path in (event.media_urls or []) if path]
        attachments = []
        for index, raw_path in enumerate(raw_paths):
            materialized = self.materialize_attachment(raw_path, route)
            mime = ""
            if index < len(event.media_types or []):
                mime = str(event.media_types[index] or "")
            attachments.append(
                {
                    "name": Path(materialized).name,
                    "mime": mime or mime_from_path(materialized),
                    "path": materialized,
                    "size": safe_size(materialized),
                }
            )
        event_id = str(getattr(event, "message_id", "") or "").strip()
        if not event_id:
            event_id = stable_event_id(account_id, chat_id, user_id, event.text or "", raw_paths, timestamp)
        body: dict[str, Any] = {
            "eventId": event_id,
            "accountId": account_id,
            "chatId": chat_id,
            "userId": user_id,
            "senderLabel": str(getattr(source, "user_name", "") or (route.principal_label if route else "")),
            "text": event.text or "",
            "attachments": attachments,
            "timestamp": timestamp,
            "type": getattr(getattr(event, "message_type", None), "value", "") or "text",
        }
        if route:
            body["principalId"] = route.principal_id
            body["workspaceId"] = route.workspace_id
        result = await self.request_json("POST", "/api/ingress/weixin/events", body)
        log(
            "posted inbound event "
            f"account={account_id} route={body.get('workspaceId', '') or 'unmatched'} "
            f"event={event_id} status={'duplicate' if result.get('duplicate') else 'accepted'}"
        )

    def _delivery_content(self, delivery: dict[str, Any]) -> str:
        parts = []
        content = str(delivery.get("content") or "").strip()
        if content:
            parts.append(content)
        for artifact in delivery.get("artifacts") or []:
            if not isinstance(artifact, dict):
                continue
            path = wsl_path(str(artifact.get("path") or ""))
            if path and Path(path).exists():
                parts.append(f"MEDIA:{path}")
        return "\n\n".join(parts).strip()

    async def deliver_one(self, delivery: dict[str, Any]) -> None:
        delivery_id = str(delivery.get("deliveryId") or "")
        account_id = str(delivery.get("accountId") or "")
        chat_id = str(delivery.get("chatId") or delivery.get("userId") or "")
        adapter = self.adapters.get(account_id)
        if adapter is None:
            raise RuntimeError(f"no Weixin adapter for account {account_id}")
        content = self._delivery_content(delivery)
        if not content:
            content = "Hermes Mobile did not produce visible output."
        result = await adapter.send(chat_id, content)
        if not result.success:
            raise RuntimeError(result.error or "send failed")
        await self.request_json(
            "POST",
            f"/api/ingress/weixin/outbound/{delivery_id}/ack",
            {"status": "sent", "providerMessageId": result.message_id or "", "rawStatus": "mobile-ingress-bridge"},
        )
        log(f"delivered outbound delivery={delivery_id} account={account_id}")

    async def ack_failed(self, delivery_id: str, error: str) -> None:
        await self.request_json(
            "POST",
            f"/api/ingress/weixin/outbound/{delivery_id}/ack",
            {"status": "failed", "error": error[:1000], "rawStatus": "mobile-ingress-bridge"},
        )

    async def outbound_loop(self) -> None:
        while not self.stop_event.is_set():
            try:
                result = await self.request_json("GET", "/api/ingress/weixin/outbound?limit=50")
                deliveries = result.get("data") if isinstance(result, dict) else []
                if isinstance(deliveries, list):
                    for delivery in deliveries:
                        if not isinstance(delivery, dict):
                            continue
                        delivery_id = str(delivery.get("deliveryId") or "")
                        try:
                            await self.deliver_one(delivery)
                        except Exception as exc:
                            log(f"outbound delivery failed delivery={delivery_id}: {exc}")
                            if delivery_id:
                                try:
                                    await self.ack_failed(delivery_id, str(exc))
                                except Exception as ack_exc:
                                    log(f"failed ack warning delivery={delivery_id}: {ack_exc}")
                self.write_status()
            except Exception as exc:
                log(f"outbound poll warning: {exc}")
                self.write_status({"lastError": str(exc)[:500]})
            try:
                await asyncio.wait_for(self.stop_event.wait(), timeout=self.poll_interval)
            except asyncio.TimeoutError:
                pass

    async def start_adapters(self) -> None:
        from gateway.config import Platform, PlatformConfig, load_gateway_config
        from gateway.platforms.weixin import WeixinAdapter

        class MobileIngressWeixinAdapter(WeixinAdapter):
            def __init__(self, config: PlatformConfig, owner: MobileIngressBridge):
                super().__init__(config)
                self._mobile_ingress_bridge = owner

            async def handle_message(self, event: Any) -> None:
                try:
                    await self._mobile_ingress_bridge.post_inbound_event(self, event)
                except Exception as exc:
                    text = str(exc)
                    account_id = getattr(self, "_account_id", "")
                    if "Mobile ingress HTTP 404" in text and "No workspace route matched this Weixin ingress event" in text:
                        log(f"inbound post ignored unmatched route account={account_id}")
                        return
                    log(f"inbound post failed account={account_id}: {exc}")

        config = load_gateway_config()
        platform_config = config.platforms.get(Platform.WEIXIN)
        if not platform_config or not platform_config.enabled:
            raise SystemExit("Weixin platform is not enabled in Hermes config")
        base_extra = dict(platform_config.extra or {})
        account_items = base_extra.get("accounts")
        if not isinstance(account_items, list) or not account_items:
            account_items = [base_extra]
        base_extra.pop("accounts", None)
        env_account = os.environ.get("WEIXIN_ACCOUNT_ID", "").strip()
        for item in account_items:
            if not isinstance(item, dict):
                continue
            extra = {**base_extra, **item}
            account_id = str(extra.get("account_id") or env_account).strip()
            if not account_id:
                continue
            token = str(extra.get("token") or "").strip()
            if not token and account_id == env_account:
                token = str(platform_config.token or os.environ.get("WEIXIN_TOKEN", "")).strip()
            adapter_config = PlatformConfig(
                enabled=True,
                token=token or None,
                extra=extra,
                home_channel=platform_config.home_channel,
                reply_to_mode=platform_config.reply_to_mode,
            )
            adapter = MobileIngressWeixinAdapter(adapter_config, self)
            ok = await adapter.connect()
            if not ok:
                log(f"Weixin adapter failed to connect account={account_id}")
                continue
            self.adapters[account_id] = adapter
        if not self.adapters:
            raise SystemExit("no Weixin accounts connected")
        self.write_status()
        log(f"mobile ingress bridge connected accounts={','.join(sorted(self.adapters.keys()))}")

    async def run(self) -> None:
        self.pid_file.write_text(str(os.getpid()), encoding="utf-8")
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, self.stop_event.set)
            except NotImplementedError:
                pass
        try:
            await self.start_adapters()
            await self.outbound_loop()
        finally:
            await self.close()
            self.write_status({"stoppedAt": now_iso()})


def check_state(args: argparse.Namespace) -> int:
    state_dir = Path(wsl_path(args.state_dir or "")) if args.state_dir else state_dir_from_env()
    pid_file = state_dir / "bridge.pid"
    status_file = state_dir / "status.json"
    try:
        pid = int(pid_file.read_text(encoding="utf-8").strip())
    except Exception:
        print("MOBILE_WEIXIN_INGRESS_BRIDGE_NOT_RUNNING")
        return 1
    if not process_exists(pid):
        print("MOBILE_WEIXIN_INGRESS_BRIDGE_NOT_RUNNING")
        return 1
    try:
        status = json.loads(status_file.read_text(encoding="utf-8"))
    except Exception:
        status = {}
    accounts = status.get("connectedAccounts") or []
    if not accounts:
        print(f"MOBILE_WEIXIN_INGRESS_BRIDGE_NO_CONNECTED_ACCOUNTS pid={pid}")
        return 1
    print(f"MOBILE_WEIXIN_INGRESS_BRIDGE_OK pid={pid} accounts={len(accounts)}")
    return 0


def process_exists(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name == "nt":
        import ctypes

        process_query_limited_information = 0x1000
        still_active = 259
        handle = ctypes.windll.kernel32.OpenProcess(process_query_limited_information, False, pid)
        if not handle:
            return False
        try:
            exit_code = ctypes.c_ulong()
            ok = ctypes.windll.kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code))
            return bool(ok and exit_code.value == still_active)
        finally:
            ctypes.windll.kernel32.CloseHandle(handle)
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Hermes Mobile Weixin ingress bridge")
    parser.add_argument("--base-url", default=os.environ.get("HERMES_MOBILE_BASE_URL", DEFAULT_MOBILE_BASE_URL))
    parser.add_argument("--state-dir", default=os.environ.get("HERMES_MOBILE_WEIXIN_BRIDGE_STATE_DIR", ""))
    parser.add_argument("--route-map", default=os.environ.get("HERMES_MOBILE_WEIXIN_ROUTE_MAP_PATH", ""))
    parser.add_argument("--outbound-interval", type=float, default=float(os.environ.get("HERMES_MOBILE_WEIXIN_OUTBOUND_INTERVAL", "3")))
    parser.add_argument("--http-timeout", type=float, default=float(os.environ.get("HERMES_MOBILE_WEIXIN_HTTP_TIMEOUT", "30")))
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("loop", help="Run the bridge loop")
    sub.add_parser("check", help="Check bridge state")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    load_dotenv()
    if args.command == "check":
        return check_state(args)
    bridge = MobileIngressBridge(args)
    asyncio.run(bridge.run())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
