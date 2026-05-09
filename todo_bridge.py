#!/usr/bin/env python3
"""Small JSON bridge from Hermes Mobile to a configured Hermes todo plugin.

The Web app must not create a second todo store. This bridge imports the
deployment-configured plugin inside WSL and calls its public functions against
that plugin's own persistent store.
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
from datetime import timedelta
from pathlib import Path
from typing import Any


HERMES_HOME = Path(os.environ.get("HERMES_HOME") or os.environ.get("HERMES_WEB_HERMES_HOME") or (Path.home() / ".hermes"))
TODO_PLUGIN_NAME = os.environ.get("HERMES_WEB_TODO_PLUGIN_NAME", "hermes_todos")
TODO_PLUGIN_RELATIVE_PATH = Path(*TODO_PLUGIN_NAME.split(".")) / "__init__.py"
PLUGIN_PATHS = [
    Path(os.environ["HERMES_WEB_TODO_PLUGIN_PATH"]) if os.environ.get("HERMES_WEB_TODO_PLUGIN_PATH") else None,
    HERMES_HOME / "plugins" / TODO_PLUGIN_RELATIVE_PATH,
]
PLUGIN_PATHS = [path for path in PLUGIN_PATHS if path]


def _load_plugin():
    for path in PLUGIN_PATHS:
        if not path.exists():
            continue
        spec = importlib.util.spec_from_file_location("hermes_mobile_todo_bridge", path)
        if not spec or not spec.loader:
            continue
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    raise RuntimeError(f"{TODO_PLUGIN_NAME} plugin not found")


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def _as_bool_default(value: Any, default: bool) -> bool:
    if value is None:
        return default
    return _as_bool(value)


def _as_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except Exception:
        parsed = default
    return max(minimum, min(parsed, maximum))


def _emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))


def _suppress_plugin_creation_notice(plugin: Any) -> Any:
    """Disable plugin-owned outbound creation notices while Mobile owns Web Push.

    Some deployment plugins expose this as a Weixin-specific hook. Keep that
    compatibility local to this bridge instead of making the provider API
    Weixin-specific.
    """
    original = getattr(plugin, "_send_weixin", None)

    def _noop_send_weixin(principal_id: str, message: str, *, todo_id: str = "", message_type: str = "") -> dict[str, Any]:
        return {
            "ok": True,
            "skipped": True,
            "reason": "hermes_mobile_uses_web_push",
            "principal_id": principal_id,
            "todo_id": todo_id,
            "message_type": message_type,
        }

    if original is not None:
        setattr(plugin, "_send_weixin", _noop_send_weixin)
    return original


def _principal_filter(request: dict[str, Any]) -> set[str]:
    raw = request.get("principals") or request.get("principal_ids") or []
    if isinstance(raw, str):
        raw = [item.strip() for item in raw.split(",")]
    if not isinstance(raw, (list, tuple, set)):
        return set()
    return {str(item or "").strip() for item in raw if str(item or "").strip()}


def _ensure_web_push_tables(plugin: Any) -> None:
    plugin.init_db()
    with plugin._connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS web_todo_push_marks (
              mark_key TEXT PRIMARY KEY,
              todo_id TEXT,
              principal_id TEXT NOT NULL,
              message_type TEXT NOT NULL,
              local_date TEXT,
              sent_at TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'sent'
            )
            """
        )
        existing_columns = {
            str(row[1])
            for row in conn.execute("PRAGMA table_info(web_todo_push_marks)").fetchall()
        }
        optional_columns = {
            "attempt_count": "INTEGER NOT NULL DEFAULT 0",
            "last_attempt_at": "TEXT",
            "last_receipt_at": "TEXT",
            "last_error": "TEXT",
        }
        for name, definition in optional_columns.items():
            if name not in existing_columns:
                conn.execute(f"ALTER TABLE web_todo_push_marks ADD COLUMN {name} {definition}")


def _web_mark_exists(conn: Any, mark_key: str) -> bool:
    row = conn.execute("SELECT 1 FROM web_todo_push_marks WHERE mark_key=? LIMIT 1", (mark_key,)).fetchone()
    return bool(row)


def _web_mark_row(conn: Any, mark_key: str) -> Any:
    return conn.execute(
        "SELECT * FROM web_todo_push_marks WHERE mark_key=? LIMIT 1",
        (mark_key,),
    ).fetchone()


def _web_mark_attempt_count(row: Any) -> int:
    try:
        count = int(row["attempt_count"] or 0)
    except Exception:
        count = 0
    if count <= 0 and str(row["sent_at"] or "").strip():
        return 1
    return max(0, count)


def _web_parse_mark_time(plugin: Any, value: str) -> Any | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return plugin._parse_iso(text)
    except Exception:
        return None


def _web_should_skip_mark(
    plugin: Any,
    conn: Any,
    mark_key: str,
    *,
    confirmed_mark_keys: set[str],
    retry_without_receipt_minutes: int,
    retry_limit: int,
    now: Any,
) -> bool:
    row = _web_mark_row(conn, mark_key)
    if not row:
        return False
    if mark_key in confirmed_mark_keys:
        return True
    status = str(row["status"] or "").strip().lower()
    if status in {"shown", "received", "confirmed"}:
        return True
    attempt_count = _web_mark_attempt_count(row)
    if retry_without_receipt_minutes <= 0 or retry_limit <= 0 or attempt_count >= retry_limit:
        return True
    attempted_at = _web_parse_mark_time(plugin, row["last_attempt_at"] or row["sent_at"])
    if not attempted_at:
        return False
    return now < attempted_at + timedelta(minutes=retry_without_receipt_minutes)


def _web_push_event(
    *,
    mark_key: str,
    principal_id: str,
    message_type: str,
    title: str,
    body: str,
    todo_id: str = "",
    local_date: str = "",
    urgency: str = "normal",
) -> dict[str, Any]:
    clean_body = str(body or "").strip()
    return {
        "markKey": mark_key,
        "todoId": todo_id,
        "principalId": principal_id,
        "messageType": message_type,
        "localDate": local_date,
        "title": title,
        "body": clean_body,
        "tag": f"hermes-todo-{mark_key}",
        "urgency": urgency,
        "data": {
            "url": "/",
            "viewMode": "todos",
            "todoId": todo_id,
            "principalId": principal_id,
            "messageType": message_type,
        },
    }


def _web_pre_due_stage(plugin: Any, conn: Any, row: Any, now: Any) -> dict[str, Any] | None:
    due_dt = plugin._parse_iso(row["due_at"]).astimezone(plugin._zone(plugin.DEFAULT_TZ))
    created_dt = plugin._parse_iso(row["created_at"]).astimezone(plugin._zone(plugin.DEFAULT_TZ))
    now_local = now.astimezone(plugin._zone(plugin.DEFAULT_TZ))
    if not (created_dt < due_dt and now_local < due_dt):
        return None
    for minutes in plugin._pre_due_stage_minutes(row):
        trigger_dt = due_dt - timedelta(minutes=minutes)
        key = plugin._reminder_key(minutes)
        if created_dt > trigger_dt:
            continue
        if now_local < trigger_dt:
            continue
        mark_key = f"todo:{row['id']}:{key}"
        if _web_mark_exists(conn, mark_key):
            continue
        return {"key": key, "markKey": mark_key, "minutes": minutes, "label": plugin._minutes_label(minutes)}
    return None


def _web_pending_pushes(plugin: Any, request: dict[str, Any], source: str) -> dict[str, Any]:
    _ensure_web_push_tables(plugin)
    principals = _principal_filter(request)
    limit = _as_int(request.get("limit"), 100, 1, 500)
    created_window = _as_int(request.get("recent_create_minutes"), 30, 1, 24 * 60)
    retry_without_receipt_minutes = _as_int(request.get("retry_without_receipt_minutes"), 0, 0, 24 * 60)
    retry_limit = _as_int(request.get("retry_limit"), 1, 1, 20)
    confirmed_mark_keys = {
        str(item or "").strip()
        for item in request.get("confirmed_mark_keys", [])
        if str(item or "").strip()
    }
    plugin.materialize_recurring_todos(horizon_days=7)
    now = plugin._utc_now()
    now_iso = plugin._iso(now)
    events: list[dict[str, Any]] = []

    def include_principal(value: str) -> bool:
        clean = str(value or "").strip()
        return bool(clean and (not principals or clean in principals))

    with plugin._connect() as conn:
        created_since = plugin._iso(now - timedelta(minutes=created_window))
        created_rows = conn.execute(
            """
            SELECT * FROM todos
            WHERE status='open'
              AND created_at >= ?
            ORDER BY created_at ASC LIMIT ?
            """,
            (created_since, limit),
        ).fetchall()
        for row in created_rows:
            principal = str(row["assignee_principal_id"] or "").strip()
            if not include_principal(principal):
                continue
            if principal == str(row["created_by_principal"] or "").strip():
                continue
            mark_key = f"todo:{row['id']}:created_by_other"
            if _web_should_skip_mark(
                plugin,
                conn,
                mark_key,
                confirmed_mark_keys=confirmed_mark_keys,
                retry_without_receipt_minutes=retry_without_receipt_minutes,
                retry_limit=retry_limit,
                now=now,
            ):
                continue
            body = f"新增待办：\n{plugin._format_todo_line(row)}\n创建人：{plugin._principal_label(row['created_by_principal'])}"
            events.append(_web_push_event(
                mark_key=mark_key,
                principal_id=principal,
                message_type="created_by_other",
                title="新增待办",
                body=body,
                todo_id=str(row["id"]),
            ))
            if len(events) >= limit:
                break

        if len(events) < limit:
            max_pre_due = max(
                list(getattr(plugin, "LONG_RANGE_PRE_DUE_MINUTES", [1440, 480]))
                + list(getattr(plugin, "SAME_DAY_PRE_DUE_MINUTES", [240, 60]))
                + [getattr(plugin, "DEFAULT_PRE_DUE_MINUTES", 30)]
            )
            lead_cutoff = plugin._iso(now + timedelta(minutes=max_pre_due))
            pre_rows = conn.execute(
                """
                SELECT * FROM todos
                WHERE status='open'
                  AND due_at > ?
                  AND due_at <= ?
                ORDER BY due_at ASC LIMIT ?
                """,
                (now_iso, lead_cutoff, limit),
            ).fetchall()
            for row in pre_rows:
                principal = str(row["assignee_principal_id"] or "").strip()
                if not include_principal(principal):
                    continue
                stage = _web_pre_due_stage(plugin, conn, row, now)
                if not stage:
                    continue
                body = f"待办提醒（{stage['label']}）：\n{plugin._format_todo_line(row)}"
                events.append(_web_push_event(
                    mark_key=str(stage["markKey"]),
                    principal_id=principal,
                    message_type=str(stage["key"]),
                    title="待办提醒",
                    body=body,
                    todo_id=str(row["id"]),
                    urgency="high",
                ))
                if len(events) >= limit:
                    break

        local_now = plugin._now_local()
        local_date = local_now.date().isoformat()
        if len(events) < limit and plugin._time_after(local_now, plugin.PERSONAL_DIGEST_TIME):
            for route in plugin._all_routes():
                principal = str(route.get("principal_id") or "").strip()
                if not include_principal(principal):
                    continue
                mark_key = f"daily:{principal}:personal_10:{local_date}"
                if _web_mark_exists(conn, mark_key):
                    continue
                rows = plugin.list_todos(source_principal=principal, scope="mine", include_completed=False, limit=1)
                if not rows:
                    continue
                events.append(_web_push_event(
                    mark_key=mark_key,
                    principal_id=principal,
                    message_type="personal_10",
                    local_date=local_date,
                    title="待办提醒",
                    body=plugin.format_personal_digest(principal),
                ))
                if len(events) >= limit:
                    break

        if len(events) < limit and plugin._time_after(local_now, plugin.OWNER_REPORT_TIME):
            owner = str(getattr(plugin, "OWNER_PRINCIPAL", "owner") or "owner")
            mark_key = f"daily:{owner}:owner_daily_report:{local_date}"
            if include_principal(owner) and not _web_mark_exists(conn, mark_key):
                events.append(_web_push_event(
                    mark_key=mark_key,
                    principal_id=owner,
                    message_type="owner_daily_report",
                    local_date=local_date,
                    title="待办统计日报",
                    body=plugin.format_owner_report(),
                ))

    return {"ok": True, "events": events[:limit], "count": len(events[:limit])}


def _web_mark_push(plugin: Any, request: dict[str, Any]) -> dict[str, Any]:
    _ensure_web_push_tables(plugin)
    mark_key = str(request.get("mark_key") or request.get("markKey") or "").strip()
    principal = str(request.get("principal_id") or request.get("principalId") or "").strip()
    message_type = str(request.get("message_type") or request.get("messageType") or "").strip() or "message"
    if not mark_key:
        return {"error": "mark_key is required"}
    if not principal:
        return {"error": "principal_id is required"}
    now = plugin._iso(plugin._utc_now())
    status = str(request.get("status") or "sent")
    count_attempt = _as_bool_default(request.get("count_attempt", request.get("countAttempt")), True)
    error = str(request.get("error") or "").strip()
    todo_id = str(request.get("todo_id") or request.get("todoId") or "")
    local_date = str(request.get("local_date") or request.get("localDate") or "")
    with plugin._connect() as conn:
        row = _web_mark_row(conn, mark_key)
        if row:
            if count_attempt:
                conn.execute(
                    """
                    UPDATE web_todo_push_marks
                    SET todo_id=?, principal_id=?, message_type=?, local_date=?,
                        sent_at=?, status=?,
                        attempt_count=CASE WHEN COALESCE(attempt_count, 0) <= 0 THEN 2 ELSE attempt_count + 1 END,
                        last_attempt_at=?, last_error=?
                    WHERE mark_key=?
                    """,
                    (todo_id, principal, message_type, local_date, now, status, now, error, mark_key),
                )
            else:
                conn.execute(
                    """
                    UPDATE web_todo_push_marks
                    SET todo_id=?, principal_id=?, message_type=?, local_date=?,
                        status=?, last_receipt_at=?, last_error=?
                    WHERE mark_key=?
                    """,
                    (todo_id, principal, message_type, local_date, status, now, error, mark_key),
                )
        else:
            conn.execute(
                """
                INSERT INTO web_todo_push_marks (
                  mark_key, todo_id, principal_id, message_type, local_date, sent_at, status,
                  attempt_count, last_attempt_at, last_receipt_at, last_error
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    mark_key,
                    todo_id,
                    principal,
                    message_type,
                    local_date,
                    now,
                    status,
                    1 if count_attempt else 0,
                    now if count_attempt else "",
                    "" if count_attempt else now,
                    error,
                ),
            )
    return {"ok": True, "markKey": mark_key, "status": status}


def _postpone_todo(plugin: Any, request: dict[str, Any], source: str) -> dict[str, Any]:
    todo_id = str(request.get("todo_id") or "").strip()
    due_time = str(request.get("due_time") or "").strip()
    if not todo_id:
        return {"error": "todo_id is required"}
    if not due_time:
        return {"error": "due_time is required"}
    try:
        due_at = plugin.parse_due_time(due_time)
    except Exception as exc:
        return {"error": str(exc)}

    plugin.init_db()
    owner = str(getattr(plugin, "OWNER_PRINCIPAL", "owner") or "owner")
    now = plugin._iso(plugin._utc_now())
    with plugin._connect() as conn:
        row = conn.execute("SELECT * FROM todos WHERE id=? LIMIT 1", (todo_id,)).fetchone()
        if not row:
            return {"error": "No matching todo found."}
        if str(row["status"] or "") != "open":
            return {"error": "Only open todos can be postponed."}
        assignee = str(row["assignee_principal_id"] or "").strip()
        created_by = str(row["created_by_principal"] or "").strip()
        if source not in {owner, assignee, created_by}:
            return {"error": "Not authorized to postpone this todo."}
        conn.execute(
            """
            UPDATE todos
            SET due_at=?, updated_at=?, pre_reminded_at=NULL, last_overdue_reminded_at=NULL
            WHERE id=? AND status='open'
            """,
            (due_at, now, todo_id),
        )
        conn.execute("DELETE FROM todo_reminder_marks WHERE todo_id=?", (todo_id,))
        updated = conn.execute("SELECT * FROM todos WHERE id=? LIMIT 1", (todo_id,)).fetchone()

    data = plugin._row_to_dict(updated) if hasattr(plugin, "_row_to_dict") else dict(updated)
    data["ok"] = True
    data["action"] = "postpone"
    return data


def _delete_todo(plugin: Any, request: dict[str, Any], source: str) -> dict[str, Any]:
    todo_id = str(request.get("todo_id") or "").strip()
    if not todo_id:
        return {"error": "todo_id is required"}

    plugin.init_db()
    owner = str(getattr(plugin, "OWNER_PRINCIPAL", "owner") or "owner")
    with plugin._connect() as conn:
        row = conn.execute("SELECT * FROM todos WHERE id=? LIMIT 1", (todo_id,)).fetchone()
        if not row:
            return {"error": "No matching todo found."}
        assignee = str(row["assignee_principal_id"] or "").strip()
        created_by = str(row["created_by_principal"] or "").strip()
        if source not in {owner, assignee, created_by}:
            return {"error": "Not authorized to delete this todo."}
        data = plugin._row_to_dict(row) if hasattr(plugin, "_row_to_dict") else dict(row)
        conn.execute("DELETE FROM todo_reminder_marks WHERE todo_id=?", (todo_id,))
        conn.execute("DELETE FROM todos WHERE id=?", (todo_id,))

    data["ok"] = True
    data["action"] = "delete"
    return data


def main() -> int:
    try:
        request = json.loads((sys.stdin.read() or "{}").lstrip("\ufeff"))
        plugin = _load_plugin()
        action = str(request.get("action") or "").strip().lower()
        source = str(request.get("source_principal") or plugin.OWNER_PRINCIPAL).strip() or plugin.OWNER_PRINCIPAL

        if action == "list":
            rows = plugin.list_todos(
                source_principal=source,
                scope=str(request.get("scope") or "mine"),
                include_completed=_as_bool(request.get("include_completed")),
                assignee=str(request.get("assignee") or ""),
                limit=_as_int(request.get("limit"), 50, 1, 200),
            )
            _emit({"ok": True, "todos": rows})
            return 0

        if action == "add":
            original_send = None
            suppress_notice = _as_bool_default(
                request.get("suppress_external_notice", request.get("suppress_weixin_notice")),
                True,
            )
            if suppress_notice:
                original_send = _suppress_plugin_creation_notice(plugin)
            try:
                result = plugin.add_todo(
                    assignee=str(request.get("assignee") or source),
                    content=str(request.get("content") or ""),
                    due_time=str(request.get("due_time") or ""),
                    reminder_lead_minutes=request.get("reminder_lead_minutes"),
                    recurrence=str(request.get("recurrence") or "none"),
                    recurrence_days=request.get("recurrence_days") or "",
                    recurrence_until=str(request.get("recurrence_until") or ""),
                    created_by_principal=source,
                    created_by_chat_id=str(request.get("created_by_chat_id") or ""),
                )
            finally:
                if suppress_notice and original_send is not None:
                    setattr(plugin, "_send_weixin", original_send)
            _emit(result)
            return 0 if result.get("ok") else 2

        if action == "complete":
            result = plugin.complete_todo(
                source_principal=source,
                todo_id=str(request.get("todo_id") or ""),
                query=str(request.get("query") or ""),
                assignee=str(request.get("assignee") or ""),
            )
            _emit(result)
            return 0 if result.get("ok") else 2

        if action == "cancel":
            result = plugin.cancel_todo(
                source_principal=source,
                todo_id=str(request.get("todo_id") or ""),
                query=str(request.get("query") or ""),
                assignee=str(request.get("assignee") or ""),
                recurrence_scope=str(request.get("recurrence_scope") or "one"),
            )
            _emit(result)
            return 0 if result.get("ok") else 2

        if action == "postpone":
            result = _postpone_todo(plugin, request, source)
            _emit(result)
            return 0 if result.get("ok") else 2

        if action == "delete":
            result = _delete_todo(plugin, request, source)
            _emit(result)
            return 0 if result.get("ok") else 2

        if action == "web_pending_pushes":
            result = _web_pending_pushes(plugin, request, source)
            _emit(result)
            return 0 if result.get("ok") else 2

        if action == "web_mark_push":
            result = _web_mark_push(plugin, request)
            _emit(result)
            return 0 if result.get("ok") else 2

        _emit({"error": f"unknown action: {action}"})
        return 2
    except Exception as exc:
        _emit({"error": str(exc), "type": exc.__class__.__name__})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
