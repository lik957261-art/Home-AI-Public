#!/usr/bin/env python3
"""Hermes Mobile Email MCP stdio wrapper.

The wrapper keeps long-lived Email workspace keys inside the workspace-local
`.hermes-email` directory. It exchanges that key for a short-lived Email launch
session, then calls Email's local HTTP API with the session context. Tool
responses intentionally project bounded mailbox data and never return keys or
launch tokens.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


TOOLS = [
    {
        "name": "list_accounts",
        "description": "List mailbox accounts visible to the current Email workspace session.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "list_mailboxes",
        "description": "List folders/mailboxes for one account or all visible Email accounts.",
        "inputSchema": {
            "type": "object",
            "properties": {"accountId": {"type": "string"}},
        },
    },
    {
        "name": "search_messages",
        "description": "Search bounded email message summaries by subject or bounded sender metadata.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "folderId": {"type": "string"},
                "limit": {"type": "number", "minimum": 1, "maximum": 100},
                "offset": {"type": "number", "minimum": 0},
            },
        },
    },
    {
        "name": "get_digest",
        "description": "Return a recent bounded email digest for visible mailbox data.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "folderId": {"type": "string"},
                "limit": {"type": "number", "minimum": 1, "maximum": 100},
                "offset": {"type": "number", "minimum": 0},
            },
        },
    },
    {
        "name": "get_message",
        "description": "Get one bounded message detail projection without raw MIME or full body text.",
        "inputSchema": {
            "type": "object",
            "properties": {"messageId": {"type": "string"}},
            "required": ["messageId"],
        },
    },
    {
        "name": "list_attachments",
        "description": "List attachment metadata for a message without returning attachment content.",
        "inputSchema": {
            "type": "object",
            "properties": {"messageId": {"type": "string"}},
            "required": ["messageId"],
        },
    },
    {
        "name": "sync_account",
        "description": "Read-only Email sync diagnostic. Provider sync remains owned by the Email service.",
        "inputSchema": {
            "type": "object",
            "properties": {"accountId": {"type": "string"}},
        },
    },
    {
        "name": "apply_mail_action",
        "description": "Apply an audited local-only mail action. V1 supports delete_local tombstones only.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["delete_local"]},
                "messageId": {"type": "string"},
            },
            "required": ["action", "messageId"],
        },
    },
]

TOOL_ALIASES = {
    "list_accounts": "list_accounts",
    "email.list_accounts": "list_accounts",
    "email_list_accounts": "list_accounts",
    "email_auth_status": "list_accounts",
    "list_mailboxes": "list_mailboxes",
    "email.list_mailboxes": "list_mailboxes",
    "email_list_mailboxes": "list_mailboxes",
    "email_list_folders": "list_mailboxes",
    "search_messages": "search_messages",
    "email.search_messages": "search_messages",
    "email_search_messages": "search_messages",
    "get_digest": "get_digest",
    "email.get_digest": "get_digest",
    "email_get_digest": "get_digest",
    "email_list_recent_messages": "get_digest",
    "get_message": "get_message",
    "email.get_message": "get_message",
    "email_get_message": "get_message",
    "email_get_message_summary": "get_message",
    "list_attachments": "list_attachments",
    "email.list_attachments": "list_attachments",
    "email_list_attachments": "list_attachments",
    "sync_account": "sync_account",
    "email.sync_account": "sync_account",
    "email_sync_account": "sync_account",
    "apply_mail_action": "apply_mail_action",
    "email.apply_mail_action": "apply_mail_action",
    "email_apply_mail_action": "apply_mail_action",
    "email.delete_message": "apply_mail_action",
    "email_delete_message": "apply_mail_action",
}


class WrapperError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def clamp_text(value: Any, limit: int) -> str:
    text = str(value or "")
    return text if len(text) <= limit else f"{text[: max(0, limit - 3)]}..."


def bounded_limit(value: Any) -> int:
    try:
        parsed = int(value)
    except Exception:
        parsed = 50
    return min(max(parsed, 1), 100)


def bounded_offset(value: Any) -> int:
    try:
        parsed = int(value)
    except Exception:
        parsed = 0
    return max(parsed, 0)


def read_json(path: Path) -> dict[str, Any]:
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise WrapperError("email_workspace_config_unreadable") from exc
    if not isinstance(parsed, dict):
        raise WrapperError("email_workspace_config_invalid")
    return parsed


def workspace_context(workspace: Path, api_base_url: str) -> dict[str, Any]:
    config_dir = workspace / ".hermes-email"
    config_path = config_dir / "config.json"
    config = read_json(config_path)
    key_name = str(config.get("access_key_file") or config.get("accessKeyFile") or "access-key.txt").strip()
    if not key_name:
        raise WrapperError("email_workspace_key_file_missing")
    key_path = Path(key_name)
    if key_path.is_absolute():
        raise WrapperError("email_workspace_key_path_must_be_relative")
    resolved_key = (config_dir / key_path).resolve()
    try:
        resolved_key.relative_to(config_dir.resolve())
    except Exception as exc:
        raise WrapperError("email_workspace_key_path_outside_config_dir") from exc
    try:
        workspace_key = resolved_key.read_text(encoding="utf-8").strip()
    except Exception as exc:
        raise WrapperError("email_workspace_key_unreadable") from exc
    if not workspace_key:
        raise WrapperError("email_workspace_key_empty")
    workspace_id = str(config.get("workspace_id") or config.get("workspaceId") or workspace.name).strip()
    if not workspace_id:
        raise WrapperError("email_workspace_id_missing")
    base_url = (api_base_url or str(config.get("base_url") or config.get("api_base_url") or "")).strip().rstrip("/")
    if not base_url:
        raise WrapperError("email_api_base_url_missing")
    launch_path = str(config.get("plugin_launch") or "/api/v1/hermes/plugin/launch").strip() or "/api/v1/hermes/plugin/launch"
    return {
        "workspace_id": workspace_id,
        "workspace_key": workspace_key,
        "base_url": base_url,
        "launch_path": launch_path,
    }


class EmailClient:
    def __init__(self, context: dict[str, Any], timeout: float):
        self.context = context
        self.timeout = timeout
        self.session_token = ""

    def launch_session(self) -> str:
        if self.session_token:
            return self.session_token
        payload = self.http_json(
            "POST",
            self.context["launch_path"],
            body={"workspace_id": self.context["workspace_id"]},
            bearer=self.context["workspace_key"],
        )
        token = str(payload.get("launch_token") or "").strip()
        if not token:
            raise WrapperError(str(payload.get("error") or "email_launch_token_missing"))
        self.session_token = token
        return token

    def http_json(
        self,
        method: str,
        path: str,
        *,
        query: dict[str, Any] | None = None,
        body: dict[str, Any] | None = None,
        bearer: str = "",
        retry_on_denied: bool = True,
    ) -> dict[str, Any]:
        url = self.url(path, query)
        data = None if body is None else json.dumps(body).encode("utf-8")
        headers = {"Accept": "application/json"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        if bearer:
            headers["Authorization"] = f"Bearer {bearer}"
        elif self.session_token:
            headers["x-email-session"] = self.session_token
        request = urllib.request.Request(url, data=data, headers=headers, method=method.upper())
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                raw = response.read(4 * 1024 * 1024).decode("utf-8")
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 403) and not bearer and retry_on_denied:
                self.session_token = ""
                self.launch_session()
                return self.http_json(method, path, query=query, body=body, retry_on_denied=False)
            try:
                parsed_error = json.loads(exc.read(64 * 1024).decode("utf-8"))
            except Exception:
                parsed_error = {}
            code = parsed_error.get("error") if isinstance(parsed_error, dict) else ""
            raise WrapperError(str(code or f"email_http_{exc.code}")) from exc
        except Exception as exc:
            raise WrapperError("email_http_unavailable") from exc
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
        except Exception as exc:
            raise WrapperError("email_http_invalid_json") from exc
        if not isinstance(parsed, dict):
            raise WrapperError("email_http_unexpected_payload")
        return parsed

    def url(self, path: str, query: dict[str, Any] | None = None) -> str:
        base = str(self.context["base_url"]).rstrip("/")
        suffix = path if path.startswith("/") else f"/{path}"
        url = f"{base}{suffix}"
        params = {key: value for key, value in (query or {}).items() if value is not None and value != ""}
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"
        return url

    def call_tool(self, name: str, args: dict[str, Any]) -> dict[str, Any]:
        tool = TOOL_ALIASES.get(name)
        if not tool:
            return {"ok": False, "error": "unknown_email_mcp_tool", "tool": name}
        self.launch_session()
        if tool == "list_accounts":
            payload = self.http_json("GET", "/api/accounts")
            accounts = payload.get("accounts") if isinstance(payload.get("accounts"), list) else []
            return {"ok": True, "accounts": accounts, "count": len(accounts)}
        if tool == "list_mailboxes":
            return self.list_mailboxes(args)
        if tool == "search_messages":
            return self.search_messages(args)
        if tool == "get_digest":
            return self.get_digest(args)
        if tool == "get_message":
            return self.get_message(args)
        if tool == "list_attachments":
            return self.list_attachments(args)
        if tool == "sync_account":
            account_id = str(args.get("accountId") or "").strip()
            return {
                "ok": True,
                "status": "read_only_mcp",
                "syncEnabled": False,
                "accountId": account_id or None,
                "reason": "MCP exposes a compatibility diagnostic; provider sync is handled by the Email scheduler/service.",
            }
        if tool == "apply_mail_action":
            return self.apply_mail_action(args)
        return {"ok": False, "error": "unknown_email_mcp_tool", "tool": name}

    def list_mailboxes(self, args: dict[str, Any]) -> dict[str, Any]:
        account_id = str(args.get("accountId") or "").strip()
        accounts_payload = self.http_json("GET", "/api/accounts")
        accounts = accounts_payload.get("accounts") if isinstance(accounts_payload.get("accounts"), list) else []
        if account_id:
            accounts = [item for item in accounts if isinstance(item, dict) and str(item.get("id") or "") == account_id]
            if not accounts:
                return {"ok": False, "error": "email_account_not_allowed", "accountId": account_id}
        mailboxes: list[dict[str, Any]] = []
        for account in accounts:
            current_account_id = str(account.get("id") or "").strip()
            if not current_account_id:
                continue
            payload = self.http_json("GET", "/api/folders", query={"accountId": current_account_id})
            for folder in payload.get("folders") if isinstance(payload.get("folders"), list) else []:
                if isinstance(folder, dict):
                    mailboxes.append({
                        **folder,
                        "provider": account.get("provider"),
                        "accountLabel": account.get("accountLabel"),
                    })
        return {"ok": True, "mailboxes": mailboxes, "count": len(mailboxes)}

    def search_messages(self, args: dict[str, Any]) -> dict[str, Any]:
        query = {
            "query": str(args.get("query") or ""),
            "folderId": str(args.get("folderId") or ""),
            "limit": bounded_limit(args.get("limit")),
            "offset": bounded_offset(args.get("offset")),
        }
        payload = self.http_json("GET", "/api/messages", query=query)
        messages = payload.get("messages") if isinstance(payload.get("messages"), list) else []
        return {"ok": True, "messages": messages, "count": len(messages), "limit": query["limit"], "offset": query["offset"]}

    def get_digest(self, args: dict[str, Any]) -> dict[str, Any]:
        query = {
            "folderId": str(args.get("folderId") or ""),
            "limit": bounded_limit(args.get("limit")),
            "offset": bounded_offset(args.get("offset")),
        }
        payload = self.http_json("GET", "/api/messages", query=query)
        messages = payload.get("messages") if isinstance(payload.get("messages"), list) else []
        unread = sum(1 for message in messages if isinstance(message, dict) and not message.get("isRead"))
        return {
            "ok": True,
            "digest": {
                "total": len(messages),
                "unreadCount": unread,
                "limit": query["limit"],
                "offset": query["offset"],
                "messages": messages,
            },
        }

    def get_message(self, args: dict[str, Any]) -> dict[str, Any]:
        message_id = str(args.get("messageId") or "").strip()
        if not message_id:
            return {"ok": False, "error": "email_message_id_required"}
        payload = self.http_json("GET", f"/api/messages/{urllib.parse.quote(message_id, safe='')}")
        message = payload.get("message") if isinstance(payload.get("message"), dict) else None
        if not message:
            return {"ok": False, "error": "email_message_not_found"}
        return {"ok": True, "message": project_message(message)}

    def list_attachments(self, args: dict[str, Any]) -> dict[str, Any]:
        message = self.get_message(args)
        if not message.get("ok"):
            return message
        projected = message.get("message") if isinstance(message.get("message"), dict) else {}
        attachments = projected.get("attachments") if isinstance(projected.get("attachments"), list) else []
        return {"ok": True, "messageId": str(args.get("messageId") or ""), "attachments": attachments}

    def apply_mail_action(self, args: dict[str, Any]) -> dict[str, Any]:
        if str(args.get("action") or "") != "delete_local":
            return {"ok": False, "error": "email_mcp_action_not_supported", "supportedActions": ["delete_local"]}
        detail = self.get_message(args)
        if not detail.get("ok"):
            return detail
        message = detail.get("message") if isinstance(detail.get("message"), dict) else {}
        account_id = str(message.get("accountId") or "").strip()
        message_id = str(args.get("messageId") or "").strip()
        if not account_id:
            return {"ok": False, "error": "email_account_id_missing"}
        payload = self.http_json(
            "DELETE",
            f"/api/messages/{urllib.parse.quote(message_id, safe='')}",
            body={"accountId": account_id},
        )
        return {
            "ok": not bool(payload.get("error")),
            "action": "delete_local",
            "messageId": message_id,
            "changed": payload.get("changed"),
            "actionId": payload.get("actionId"),
            "remoteApplied": False,
            "localOnly": True,
            **({"error": payload.get("error")} if payload.get("error") else {}),
        }


def project_message(message: dict[str, Any]) -> dict[str, Any]:
    projected = {key: value for key, value in message.items() if key not in ("bodyText", "rawMime", "headers")}
    if "bodyExcerpt" in projected:
        projected["bodyExcerpt"] = clamp_text(projected.get("bodyExcerpt"), 800)
    projected["fullBodyAvailable"] = bool(message.get("bodyText"))
    attachments = projected.get("attachments") if isinstance(projected.get("attachments"), list) else []
    projected["attachments"] = [project_attachment(item) for item in attachments if isinstance(item, dict)]
    return projected


def project_attachment(attachment: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": attachment.get("id"),
        "filename": clamp_text(attachment.get("filename"), 180),
        "contentType": attachment.get("contentType"),
        "sizeBytes": attachment.get("sizeBytes"),
        "availabilityState": attachment.get("availabilityState") or "metadata-only",
    }


def success_response(request_id: Any, result: Any) -> str:
    return json.dumps({"jsonrpc": "2.0", "id": request_id, "result": result}, ensure_ascii=False)


def error_response(request_id: Any, code: int, message: str) -> str:
    return json.dumps({"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}, ensure_ascii=False)


def call_result(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "content": [{"type": "text", "text": json.dumps(payload, ensure_ascii=False, indent=2)}],
        "isError": not bool(payload.get("ok")),
    }


def handle_line(client: EmailClient, line: str) -> str | None:
    text = line.strip()
    if not text:
        return None
    try:
        request = json.loads(text)
    except Exception:
        return error_response(None, -32700, "Parse error")
    if not isinstance(request, dict):
        return error_response(None, -32600, "Invalid Request")
    request_id = request.get("id")
    method = str(request.get("method") or "")
    if request_id is None and method.startswith("notifications/"):
        return None
    if method == "initialize":
        return success_response(request_id, {
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "email", "version": "0.1.0"},
        })
    if method == "tools/list":
        return success_response(request_id, {"tools": TOOLS})
    if method == "tools/call":
        params = request.get("params") if isinstance(request.get("params"), dict) else {}
        name = str(params.get("name") or "")
        args = params.get("arguments") if isinstance(params.get("arguments"), dict) else {}
        try:
            payload = client.call_tool(name, args)
        except WrapperError as exc:
            payload = {"ok": False, "error": exc.code}
        return success_response(request_id, call_result(payload))
    return error_response(request_id, -32601, "Method not found")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Hermes Mobile Email MCP wrapper")
    parser.add_argument("--workspace", required=True, help="Hermes workspace root containing .hermes-email")
    parser.add_argument("--no-workspace-override", action="store_true", help="Accepted for profile contract compatibility")
    parser.add_argument("--api-base-url", default="", help="Email plugin API base URL reachable from the Gateway worker")
    parser.add_argument("--timeout", type=float, default=20.0, help="HTTP timeout in seconds")
    parser.add_argument("--list-tools", action="store_true", help="Print tool definitions and exit")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    if args.list_tools:
        sys.stdout.write(json.dumps({"tools": TOOLS}, ensure_ascii=False) + "\n")
        return 0
    try:
        context = workspace_context(Path(args.workspace), args.api_base_url)
    except WrapperError as exc:
        sys.stderr.write(f"{exc.code}\n")
        return 2
    client = EmailClient(context, timeout=max(1.0, min(float(args.timeout or 20.0), 60.0)))
    for line in sys.stdin:
        response = handle_line(client, line)
        if response:
            sys.stdout.write(f"{response}\n")
            sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
