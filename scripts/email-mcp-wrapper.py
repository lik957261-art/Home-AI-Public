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
        "name": "get_message_body",
        "description": "High-privilege read of cached sanitized message body text. Use readAll=true for a full long message; otherwise follow nextOffset while truncated=true.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "messageId": {"type": "string"},
                "purpose": {"type": "string", "minLength": 6},
                "offset": {"type": "number", "minimum": 0},
                "limit": {"type": "number", "minimum": 1, "maximum": 20000, "default": 8000},
                "readAll": {"type": "boolean", "default": False},
                "maxChars": {"type": "number", "minimum": 1, "maximum": 100000, "default": 60000},
            },
            "required": ["messageId", "purpose"],
        },
    },
    {
        "name": "list_attachments",
        "description": "List attachment metadata and local cache availability for a message.",
        "inputSchema": {
            "type": "object",
            "properties": {"messageId": {"type": "string"}},
            "required": ["messageId"],
        },
    },
    {
        "name": "get_attachment_content",
        "description": "High-privilege read of locally cached attachment content as a bounded base64 chunk.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "attachmentId": {"type": "string"},
                "purpose": {"type": "string", "minLength": 6},
                "offset": {"type": "number", "minimum": 0},
                "limit": {"type": "number", "minimum": 1, "maximum": 262144, "default": 65536},
            },
            "required": ["attachmentId", "purpose"],
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
    {
        "name": "delete_local_by_search",
        "description": "Dry-run by default. Search visible local mail, apply include/exclude safeguards, and optionally tombstone matching messages locally.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "folderId": {"type": "string"},
                "limit": {"type": "number", "minimum": 1, "maximum": 1000, "default": 500},
                "dry_run": {"type": "boolean", "default": True},
                "include_sender": {"type": "array", "items": {"type": "string"}},
                "include_subject": {"type": "array", "items": {"type": "string"}},
                "exclude_keywords": {"type": "array", "items": {"type": "string"}},
                "older_than_days": {"type": ["number", "null"], "minimum": 0},
                "newer_than_days": {"type": ["number", "null"], "minimum": 0},
            },
            "required": ["query"],
        },
    },
    {
        "name": "apply_mail_action_bulk",
        "description": "Dry-run by default. Apply delete_local to a bounded list of local message ids.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["delete_local"]},
                "messageIds": {"type": "array", "items": {"type": "string"}, "maxItems": 1000},
                "dry_run": {"type": "boolean", "default": True},
            },
            "required": ["action", "messageIds"],
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
    "get_message_body": "get_message_body",
    "email.get_message_body": "get_message_body",
    "email_get_message_body": "get_message_body",
    "mcp_email_get_message_body": "get_message_body",
    "list_attachments": "list_attachments",
    "email.list_attachments": "list_attachments",
    "email_list_attachments": "list_attachments",
    "get_attachment_content": "get_attachment_content",
    "email.get_attachment_content": "get_attachment_content",
    "email_get_attachment_content": "get_attachment_content",
    "mcp_email_get_attachment_content": "get_attachment_content",
    "sync_account": "sync_account",
    "email.sync_account": "sync_account",
    "email_sync_account": "sync_account",
    "apply_mail_action": "apply_mail_action",
    "email.apply_mail_action": "apply_mail_action",
    "email_apply_mail_action": "apply_mail_action",
    "email.delete_message": "apply_mail_action",
    "email_delete_message": "apply_mail_action",
    "delete_local_by_search": "delete_local_by_search",
    "email.delete_local_by_search": "delete_local_by_search",
    "email_delete_local_by_search": "delete_local_by_search",
    "mcp_email_delete_local_by_search": "delete_local_by_search",
    "apply_mail_action_bulk": "apply_mail_action_bulk",
    "email.apply_mail_action_bulk": "apply_mail_action_bulk",
    "email_apply_mail_action_bulk": "apply_mail_action_bulk",
    "mcp_email_apply_mail_action_bulk": "apply_mail_action_bulk",
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


def bounded_bulk_limit(value: Any) -> int:
    try:
        parsed = int(value)
    except Exception:
        parsed = 500
    return min(max(parsed, 1), 1000)


def bounded_body_limit(value: Any) -> int:
    try:
        parsed = int(value)
    except Exception:
        parsed = 8000
    return min(max(parsed, 1), 20000)


def bounded_body_total_limit(value: Any) -> int:
    try:
        parsed = int(value)
    except Exception:
        parsed = 60000
    return min(max(parsed, 1), 100000)


def bounded_attachment_limit(value: Any) -> int:
    try:
        parsed = int(value)
    except Exception:
        parsed = 65536
    return min(max(parsed, 1), 262144)


def bounded_offset(value: Any) -> int:
    try:
        parsed = int(value)
    except Exception:
        parsed = 0
    return max(parsed, 0)


def truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "y", "on")
    return bool(value)


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
        if tool == "get_message_body":
            return self.get_message_body(args)
        if tool == "list_attachments":
            return self.list_attachments(args)
        if tool == "get_attachment_content":
            return self.get_attachment_content(args)
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
        if tool == "delete_local_by_search":
            return self.delete_local_by_search(args)
        if tool == "apply_mail_action_bulk":
            return self.apply_mail_action_bulk(args)
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

    def get_message_body(self, args: dict[str, Any]) -> dict[str, Any]:
        message_id = str(args.get("messageId") or "").strip()
        purpose = str(args.get("purpose") or "").strip()
        if not message_id:
            return {"ok": False, "error": "email_message_id_required"}
        if len(purpose) < 6:
            return {"ok": False, "error": "email_mcp_purpose_required"}
        if truthy(args.get("readAll", args.get("read_all", False))):
            return self.get_message_body_all(args, message_id, purpose)
        payload = self.fetch_message_body_page(
            message_id,
            purpose,
            bounded_offset(args.get("offset")),
            bounded_body_limit(args.get("limit")),
        )
        if payload.get("error"):
            return {"ok": False, "error": payload.get("error")}
        return payload

    def fetch_message_body_page(self, message_id: str, purpose: str, offset: int, limit: int) -> dict[str, Any]:
        return self.http_json("GET", f"/api/mcp/messages/{urllib.parse.quote(message_id, safe='')}/body", query={
            "purpose": purpose,
            "offset": offset,
            "limit": limit,
        })

    def get_message_body_all(self, args: dict[str, Any], message_id: str, purpose: str) -> dict[str, Any]:
        start_offset = bounded_offset(args.get("offset"))
        page_limit = bounded_body_limit(args.get("limit"))
        max_chars = bounded_body_total_limit(args.get("maxChars", args.get("max_chars")))
        offset = start_offset
        body_parts: list[str] = []
        audit_ids: list[str] = []
        last_payload: dict[str, Any] = {}

        while sum(len(part) for part in body_parts) < max_chars:
            remaining_budget = max_chars - sum(len(part) for part in body_parts)
            payload = self.fetch_message_body_page(message_id, purpose, offset, min(page_limit, remaining_budget))
            if payload.get("error"):
                return {"ok": False, "error": payload.get("error")}
            last_payload = payload
            chunk = str(payload.get("bodyText") or "")
            body_parts.append(chunk)
            audit_id = payload.get("auditId")
            if audit_id:
                audit_ids.append(str(audit_id))
            if not payload.get("truncated"):
                break
            returned = int(payload.get("returnedChars") or len(chunk))
            if returned <= 0:
                break
            next_offset = payload.get("nextOffset")
            try:
                offset = int(next_offset)
            except Exception:
                offset = offset + returned

        body_text = "".join(body_parts)
        total_chars = int(last_payload.get("totalChars") or (start_offset + len(body_text)))
        next_offset = start_offset + len(body_text)
        truncated = next_offset < total_chars
        return {
            **last_payload,
            "ok": True,
            "bodyText": body_text,
            "offset": start_offset,
            "limit": page_limit,
            "readAll": True,
            "maxChars": max_chars,
            "chunksRead": len(body_parts),
            "returnedChars": len(body_text),
            "totalChars": total_chars,
            "truncated": truncated,
            "hasMore": truncated,
            "nextOffset": next_offset if truncated else None,
            "remainingChars": max(total_chars - next_offset, 0),
            "fullBodyReturned": start_offset == 0 and len(body_text) == total_chars,
            "attachmentContentIncluded": False,
            "auditIds": audit_ids,
        }

    def get_attachment_content(self, args: dict[str, Any]) -> dict[str, Any]:
        attachment_id = str(args.get("attachmentId") or "").strip()
        purpose = str(args.get("purpose") or "").strip()
        if not attachment_id:
            return {"ok": False, "error": "email_attachment_id_required"}
        if len(purpose) < 6:
            return {"ok": False, "error": "email_mcp_purpose_required"}
        payload = self.http_json("GET", f"/api/mcp/attachments/{urllib.parse.quote(attachment_id, safe='')}/content", query={
            "purpose": purpose,
            "offset": bounded_offset(args.get("offset")),
            "limit": bounded_attachment_limit(args.get("limit")),
        })
        if payload.get("error"):
            return {
                "ok": False,
                "error": payload.get("error"),
                **({"attachmentId": payload.get("attachmentId")} if payload.get("attachmentId") else {}),
                **({"availabilityState": payload.get("availabilityState")} if payload.get("availabilityState") else {}),
            }
        return payload

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

    def delete_local_by_search(self, args: dict[str, Any]) -> dict[str, Any]:
        query = str(args.get("query") or "").strip()
        if not query:
            return {"ok": False, "error": "email_query_required"}
        dry_run = bool(args.get("dry_run", args.get("dryRun", True)))
        limit = bounded_bulk_limit(args.get("limit"))
        candidates = self.search_messages_for_bulk(query, str(args.get("folderId") or ""), limit)
        evaluated = evaluate_bulk_candidates(candidates, args)
        applied = [] if dry_run else [self.delete_projected_message(message) for message in evaluated["deletable"]]
        failed = [item for item in applied if not item.get("changed")]
        return {
            "ok": True,
            "matched_count": len(candidates),
            "would_delete_count": len(evaluated["deletable"]),
            "deleted_count": 0 if dry_run else sum(1 for item in applied if item.get("changed")),
            "skipped_count": len(evaluated["skipped"]) + len(failed),
            "remoteApplied": False,
            "action": "delete_local",
            "dry_run": dry_run,
            "limit": limit,
            "sample_deleted": sample_messages(evaluated["deletable"]),
            "skipped_samples": (evaluated["skipped"] + [
                {**sample_message(item.get("message") or {}), "reason": item.get("error") or "delete_local not applied"}
                for item in failed
            ])[:10],
            "sender_breakdown": sender_breakdown(evaluated["deletable"]),
        }

    def apply_mail_action_bulk(self, args: dict[str, Any]) -> dict[str, Any]:
        if str(args.get("action") or "") != "delete_local":
            return {"ok": False, "error": "email_mcp_action_not_supported", "supportedActions": ["delete_local"]}
        dry_run = bool(args.get("dry_run", args.get("dryRun", True)))
        message_ids = unique_strings(args.get("messageIds") if isinstance(args.get("messageIds"), list) else [])[:1000]
        if not message_ids:
            return {"ok": False, "error": "email_message_ids_required"}
        deletable: list[dict[str, Any]] = []
        skipped: list[dict[str, Any]] = []
        for message_id in message_ids:
            detail = self.get_message({"messageId": message_id})
            if not detail.get("ok"):
                skipped.append({"messageId": message_id, "subject": "", "from": "", "date": "", "reason": "message not found or not allowed"})
                continue
            message = detail.get("message") if isinstance(detail.get("message"), dict) else {}
            deletable.append(message)
        applied = [] if dry_run else [self.delete_projected_message(message) for message in deletable]
        failed = [item for item in applied if not item.get("changed")]
        return {
            "ok": True,
            "matched_count": len(message_ids),
            "would_delete_count": len(deletable),
            "deleted_count": 0 if dry_run else sum(1 for item in applied if item.get("changed")),
            "skipped_count": len(skipped) + len(failed),
            "remoteApplied": False,
            "action": "delete_local",
            "dry_run": dry_run,
            "limit": 1000,
            "sample_deleted": sample_messages(deletable),
            "skipped_samples": (skipped + [
                {**sample_message(item.get("message") or {}), "reason": item.get("error") or "delete_local not applied"}
                for item in failed
            ])[:10],
            "sender_breakdown": sender_breakdown(deletable),
        }

    def search_messages_for_bulk(self, query: str, folder_id: str, limit: int) -> list[dict[str, Any]]:
        messages_by_id: dict[str, dict[str, Any]] = {}
        for term in parse_search_terms(query):
            offset = 0
            while len(messages_by_id) < limit:
                page_limit = min(100, limit - len(messages_by_id))
                payload = self.http_json("GET", "/api/messages", query={
                    "query": term,
                    "folderId": folder_id,
                    "limit": page_limit,
                    "offset": offset,
                })
                page = payload.get("messages") if isinstance(payload.get("messages"), list) else []
                if not page:
                    break
                for message in page:
                    if isinstance(message, dict) and message.get("id"):
                        messages_by_id[str(message.get("id"))] = message
                if not payload.get("hasMore") or len(page) < page_limit:
                    break
                offset = int(payload.get("nextOffset") or (offset + len(page)))
        return list(messages_by_id.values())[:limit]

    def delete_projected_message(self, message: dict[str, Any]) -> dict[str, Any]:
        message_id = str(message.get("id") or message.get("messageId") or "").strip()
        account_id = str(message.get("accountId") or "").strip()
        if not message_id or not account_id:
            return {"changed": False, "error": "email_message_projection_incomplete", "message": message}
        payload = self.http_json(
            "DELETE",
            f"/api/messages/{urllib.parse.quote(message_id, safe='')}",
            body={"accountId": account_id},
        )
        return {
            "changed": bool(payload.get("changed")),
            "error": payload.get("error"),
            "message": message,
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


def parse_search_terms(query: str) -> list[str]:
    terms: list[str] = []
    current = ""
    quote = ""
    for char in query:
        if quote:
            if char == quote:
                if current.strip():
                    terms.append(current.strip())
                current = ""
                quote = ""
            else:
                current += char
            continue
        if char in ("'", '"'):
            if current.strip():
                terms.extend(part for part in current.strip().split() if part.upper() != "OR")
            current = ""
            quote = char
            continue
        current += char
    if current.strip():
        terms.extend(part for part in current.strip().split() if part.upper() != "OR")
    return unique_strings(terms) or [query]


def evaluate_bulk_candidates(messages: list[dict[str, Any]], args: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    include_sender = normalized_list(args.get("include_sender") or args.get("includeSender") or [])
    include_subject = normalized_list(args.get("include_subject") or args.get("includeSubject") or [])
    exclude_keywords = normalized_list(args.get("exclude_keywords") or args.get("excludeKeywords") or [])
    deletable: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for message in messages:
        sender_text = normalized_text(f"{message.get('sender') or ''} {message.get('senderAddress') or ''}")
        subject_text = normalized_text(str(message.get("subject") or ""))
        combined_text = f"{subject_text} {sender_text}"
        excluded = next((keyword for keyword in exclude_keywords if keyword in combined_text), "")
        if excluded:
            skipped.append({**sample_message(message), "reason": f"matched exclude keyword: {excluded}"})
            continue
        if include_sender and not any(keyword in sender_text for keyword in include_sender):
            skipped.append({**sample_message(message), "reason": "sender did not match include_sender"})
            continue
        if include_subject and not any(keyword in subject_text for keyword in include_subject):
            skipped.append({**sample_message(message), "reason": "subject did not match include_subject"})
            continue
        deletable.append(message)
    return {"deletable": deletable, "skipped": skipped[:10]}


def sample_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [sample_message(message) for message in messages[:10]]


def sample_message(message: dict[str, Any]) -> dict[str, Any]:
    return {
        "messageId": str(message.get("id") or message.get("messageId") or ""),
        "subject": clamp_text(message.get("subject"), 160),
        "from": clamp_text(message.get("sender") or message.get("senderAddress"), 160),
        "date": str(message.get("receivedAt") or message.get("date") or ""),
    }


def sender_breakdown(messages: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for message in messages:
        sender = clamp_text(message.get("sender") or message.get("senderAddress") or "Unknown sender", 160)
        counts[sender] = counts.get(sender, 0) + 1
    return dict(sorted(counts.items(), key=lambda item: item[1], reverse=True)[:25])


def normalized_list(values: Any) -> list[str]:
    return [normalized_text(value) for value in unique_strings(values if isinstance(values, list) else []) if normalized_text(value)]


def unique_strings(values: list[Any]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        text = str(value or "").strip()
        if text and text not in seen:
            seen.add(text)
            result.append(text)
    return result


def normalized_text(value: Any) -> str:
    return str(value or "").lower()


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
