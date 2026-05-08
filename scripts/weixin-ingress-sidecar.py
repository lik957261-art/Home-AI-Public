#!/usr/bin/env python3
"""Minimal Hermes Mobile Weixin ingress sidecar client.

This script is intentionally transport-only: deployment-specific iLink polling
belongs in a thin wrapper that calls ``post-event`` and a delivery loop that
calls ``poll-outbound`` / ``ack``. Hermes Mobile owns routing and scheduling.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def read_text(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def read_key(args: argparse.Namespace) -> str:
    key = (args.key or "").strip()
    if key:
        return key
    if args.key_file:
        return read_text(args.key_file).splitlines()[0].strip()
    raise SystemExit("missing --key or --key-file")


def request_json(args: argparse.Namespace, method: str, path: str, body: object | None = None) -> object:
    base = args.base.rstrip("/")
    url = f"{base}{path}"
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    headers = {
        "Accept": "application/json",
        "X-Hermes-Mobile-Ingress-Key": read_key(args),
    }
    if data is not None:
        headers["Content-Type"] = "application/json; charset=utf-8"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=args.timeout) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(raw)
        except Exception:
            detail = raw
        raise SystemExit(f"{method} {url} failed: HTTP {exc.code} {detail}") from exc


def load_event(args: argparse.Namespace) -> object:
    if args.event_file:
        return json.loads(read_text(args.event_file))
    raw = sys.stdin.read()
    if not raw.strip():
        raise SystemExit("missing --event-file or stdin JSON")
    return json.loads(raw)


def post_event(args: argparse.Namespace) -> None:
    result = request_json(args, "POST", "/api/ingress/weixin/events", load_event(args))
    print(json.dumps(result, ensure_ascii=False, indent=2))


def poll_outbound(args: argparse.Namespace) -> None:
    params = {}
    if args.account_id:
        params["accountId"] = args.account_id
    if args.limit:
        params["limit"] = str(args.limit)
    query = f"?{urllib.parse.urlencode(params)}" if params else ""
    while True:
        result = request_json(args, "GET", f"/api/ingress/weixin/outbound{query}")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if args.once:
            return
        time.sleep(max(1.0, args.interval))


def ack_delivery(args: argparse.Namespace) -> None:
    body = {
        "status": args.status,
        "providerMessageId": args.provider_message_id or "",
        "error": args.error or "",
        "rawStatus": args.raw_status or "",
    }
    result = request_json(
        args,
        "POST",
        f"/api/ingress/weixin/outbound/{urllib.parse.quote(args.delivery_id, safe='')}/ack",
        body,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Hermes Mobile Weixin ingress sidecar client")
    parser.add_argument("--base", default="http://127.0.0.1:8797", help="Hermes Mobile base URL")
    parser.add_argument("--key", default="", help="Ingress key")
    parser.add_argument("--key-file", default="", help="File containing the ingress key")
    parser.add_argument("--timeout", type=float, default=30.0)
    sub = parser.add_subparsers(dest="command", required=True)

    post = sub.add_parser("post-event", help="Post one normalized inbound Weixin event")
    post.add_argument("--event-file", default="", help="JSON file; stdin is used when omitted")
    post.set_defaults(func=post_event)

    poll = sub.add_parser("poll-outbound", help="Poll pending outbound deliveries")
    poll.add_argument("--account-id", default="")
    poll.add_argument("--limit", type=int, default=20)
    poll.add_argument("--once", action="store_true")
    poll.add_argument("--interval", type=float, default=5.0)
    poll.set_defaults(func=poll_outbound)

    ack = sub.add_parser("ack", help="Acknowledge one outbound delivery")
    ack.add_argument("--delivery-id", required=True)
    ack.add_argument("--status", required=True, choices=["sent", "failed", "skipped"])
    ack.add_argument("--provider-message-id", default="")
    ack.add_argument("--error", default="")
    ack.add_argument("--raw-status", default="")
    ack.set_defaults(func=ack_delivery)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    args.func(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
