#!/usr/bin/env python3
"""Generate a Hermes Mobile Gateway token usage report.

This script is intended for a Hermes cron no_agent job. It reads Gateway
telemetry SQLite databases in read-only mode, aggregates usage by workspace
profile, writes a Markdown report, and prints a short MEDIA receipt.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover - Python < 3.9 fallback is not expected.
    ZoneInfo = None  # type: ignore


DEFAULT_MANIFEST = "/mnt/c/ProgramData/HermesMobile/data/gateway-pool-manifest.json"
DEFAULT_TELEMETRY_ROOT = "/mnt/c/ProgramData/HermesMobile/gateway-worker/telemetry/profiles"
DEFAULT_REPORT_ROOT = "/mnt/c/ProgramData/HermesMobile/data/drive/users/owner/Hermes-徐欣/交付/Token消耗日报"
LOCAL_TZ = "Asia/Shanghai"


def local_tz():
    if ZoneInfo:
        try:
            return ZoneInfo(LOCAL_TZ)
        except Exception:
            pass
    return timezone(timedelta(hours=8))


def now_local() -> datetime:
    return datetime.now(local_tz())


def compact(value: Any, limit: int = 80) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "..."


def path_from_any(value: str | None) -> Path | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    m = re.match(r"(?i)^([a-z]):[\\/](.*)$", raw)
    if m and os.name != "nt":
        drive = m.group(1).lower()
        tail = m.group(2).replace("\\", "/")
        return Path(f"/mnt/{drive}/{tail}")
    m = re.match(r"(?i)^/mnt/([a-z])/(.*)$", raw)
    if m and os.name == "nt":
        drive = m.group(1).upper()
        tail = m.group(2).replace("/", "\\")
        return Path(f"{drive}:\\{tail}")
    return Path(raw)


def epoch_seconds(value: Any) -> float | None:
    try:
        number = float(value)
    except Exception:
        return None
    if number > 10_000_000_000:
        number /= 1000.0
    return number


@dataclass
class WorkerInfo:
    profile: str
    provider: str = ""
    workspaces: list[str] = field(default_factory=list)
    state_db: Path | None = None

    @property
    def user_label(self) -> str:
        if self.workspaces == ["*"]:
            return "shared-grok"
        if self.workspaces:
            return ",".join(self.workspaces)
        return self.profile


@dataclass
class Usage:
    sessions: int = 0
    api_calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    reasoning_tokens: int = 0
    estimated_cost_usd: float = 0.0
    actual_cost_usd: float = 0.0
    profiles: set[str] = field(default_factory=set)

    def add(self, row: sqlite3.Row, profile: str) -> None:
        self.sessions += 1
        self.api_calls += int(row["api_call_count"] or 0)
        self.input_tokens += int(row["input_tokens"] or 0)
        self.output_tokens += int(row["output_tokens"] or 0)
        self.cache_read_tokens += int(row["cache_read_tokens"] or 0)
        self.cache_write_tokens += int(row["cache_write_tokens"] or 0)
        self.reasoning_tokens += int(row["reasoning_tokens"] or 0)
        self.estimated_cost_usd += float(row["estimated_cost_usd"] or 0.0)
        self.actual_cost_usd += float(row["actual_cost_usd"] or 0.0)
        self.profiles.add(profile)

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens + self.cache_read_tokens + self.cache_write_tokens

    @property
    def non_cached_tokens(self) -> int:
        return self.input_tokens + self.output_tokens + self.cache_write_tokens


def load_manifest(path: Path) -> dict[str, WorkerInfo]:
    parsed = json.loads(path.read_text(encoding="utf-8"))
    workers: dict[str, WorkerInfo] = {}
    for worker in parsed.get("workers") or []:
        profile = str(worker.get("profile") or worker.get("name") or "").strip()
        if not profile:
            continue
        state_db = path_from_any(worker.get("telemetryStateDbPath"))
        workers[profile] = WorkerInfo(
            profile=profile,
            provider=str(worker.get("provider") or "").strip(),
            workspaces=[str(item) for item in worker.get("allowedWorkspaceIds") or []],
            state_db=state_db,
        )
    return workers


def candidate_state_dbs(telemetry_root: Path, workers: dict[str, WorkerInfo]) -> list[tuple[str, Path]]:
    out: list[tuple[str, Path]] = []
    seen: set[str] = set()
    for profile, worker in workers.items():
        candidates: list[Path] = []
        if worker.state_db:
            candidates.append(worker.state_db)
        profile_root = telemetry_root / profile
        candidates.append(profile_root / "state.db")
        if profile_root.exists():
            candidates.extend(profile_root.glob("sqlite-quarantine-*/state.db"))
        for item in candidates:
            try:
                resolved = str(item.resolve())
            except Exception:
                resolved = str(item)
            if resolved in seen or not item.is_file():
                continue
            seen.add(resolved)
            out.append((profile, item))
    return out


def read_sessions(db_path: Path, start_epoch: float, end_epoch: float) -> tuple[list[sqlite3.Row], str | None]:
    try:
        uri = f"file:{db_path.as_posix()}?mode=ro"
        con = sqlite3.connect(uri, uri=True, timeout=3)
        con.row_factory = sqlite3.Row
        rows = con.execute(
            """
            SELECT id, started_at, ended_at, source, user_id, model, title,
                   input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                   reasoning_tokens, api_call_count, estimated_cost_usd, actual_cost_usd
            FROM sessions
            WHERE started_at >= ? AND started_at < ?
            ORDER BY started_at ASC
            """,
            (start_epoch, end_epoch),
        ).fetchall()
        con.close()
        return rows, None
    except Exception as exc:
        return [], compact(exc, 160)


def fmt_int(value: int) -> str:
    return f"{int(value):,}"


def fmt_money(value: float) -> str:
    if value <= 0:
        return "-"
    return f"${value:.4f}"


def session_started(row: sqlite3.Row) -> str:
    started = epoch_seconds(row["started_at"])
    if started is None:
        return "-"
    return datetime.fromtimestamp(started, local_tz()).strftime("%m-%d %H:%M")


def report_window(args: argparse.Namespace) -> tuple[datetime, datetime, str]:
    now = now_local()
    if args.today:
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return start, now, f"{start:%Y-%m-%d} 00:00 - {now:%Y-%m-%d %H:%M}"
    if args.date:
        day = datetime.strptime(args.date, "%Y-%m-%d").replace(tzinfo=local_tz())
        return day, day + timedelta(days=1), f"{day:%Y-%m-%d}"
    end = now
    start = now - timedelta(hours=args.hours)
    return start, end, f"最近 {args.hours} 小时"


def build_report(args: argparse.Namespace) -> tuple[str, Path]:
    manifest = path_from_any(args.manifest) or Path(DEFAULT_MANIFEST)
    telemetry_root = path_from_any(args.telemetry_root) or Path(DEFAULT_TELEMETRY_ROOT)
    report_root = path_from_any(args.report_root) or Path(DEFAULT_REPORT_ROOT)
    workers = load_manifest(manifest)
    start, end, label = report_window(args)
    start_epoch = start.timestamp()
    end_epoch = end.timestamp()

    by_user: dict[str, Usage] = {}
    by_profile: dict[str, Usage] = {}
    top_rows: list[tuple[str, WorkerInfo, sqlite3.Row, int]] = []
    skipped: list[str] = []
    seen_sessions: set[str] = set()

    for profile, db_path in candidate_state_dbs(telemetry_root, workers):
        worker = workers.get(profile, WorkerInfo(profile=profile))
        rows, error = read_sessions(db_path, start_epoch, end_epoch)
        if error:
            skipped.append(f"{profile}: {db_path.name}: {error}")
            continue
        for row in rows:
            session_id = str(row["id"] or "")
            dedupe_key = f"{profile}:{session_id}"
            if dedupe_key in seen_sessions:
                continue
            seen_sessions.add(dedupe_key)
            user = worker.user_label
            by_user.setdefault(user, Usage()).add(row, profile)
            by_profile.setdefault(profile, Usage()).add(row, profile)
            total = (
                int(row["input_tokens"] or 0)
                + int(row["output_tokens"] or 0)
                + int(row["cache_read_tokens"] or 0)
                + int(row["cache_write_tokens"] or 0)
            )
            top_rows.append((profile, worker, row, total))

    top_rows.sort(key=lambda item: item[3], reverse=True)
    generated_at = now_local()
    report_root.mkdir(parents=True, exist_ok=True)
    stamp = generated_at.strftime("%Y%m%d-%H%M%S")
    md_path = report_root / f"{stamp}_Gateway_Token_Usage.md"

    total_usage = Usage()
    for usage in by_user.values():
        total_usage.sessions += usage.sessions
        total_usage.api_calls += usage.api_calls
        total_usage.input_tokens += usage.input_tokens
        total_usage.output_tokens += usage.output_tokens
        total_usage.cache_read_tokens += usage.cache_read_tokens
        total_usage.cache_write_tokens += usage.cache_write_tokens
        total_usage.reasoning_tokens += usage.reasoning_tokens
        total_usage.estimated_cost_usd += usage.estimated_cost_usd
        total_usage.actual_cost_usd += usage.actual_cost_usd
        total_usage.profiles.update(usage.profiles)

    lines = [
        f"# Gateway Token 消耗日报",
        "",
        f"- 统计窗口：{label}",
        f"- 生成时间：{generated_at:%Y-%m-%d %H:%M:%S} {LOCAL_TZ}",
        f"- 统计来源：Gateway telemetry profiles",
        "",
        "## 总览",
        "",
        "| 指标 | 数值 |",
        "| --- | ---: |",
        f"| 用户/共享通道数 | {len(by_user)} |",
        f"| Profile 数 | {len(total_usage.profiles)} |",
        f"| Sessions | {fmt_int(total_usage.sessions)} |",
        f"| API calls | {fmt_int(total_usage.api_calls)} |",
        f"| Total tokens | {fmt_int(total_usage.total_tokens)} |",
        f"| Non-cached tokens | {fmt_int(total_usage.non_cached_tokens)} |",
        f"| Cache read tokens | {fmt_int(total_usage.cache_read_tokens)} |",
        f"| Output tokens | {fmt_int(total_usage.output_tokens)} |",
        "",
        "## 按用户汇总",
        "",
        "| 用户/通道 | Profiles | Sessions | API calls | Total | Non-cached | Cache read | Output | Est. cost |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for user, usage in sorted(by_user.items(), key=lambda item: item[1].total_tokens, reverse=True):
        lines.append(
            f"| {user} | {', '.join(sorted(usage.profiles))} | {fmt_int(usage.sessions)} | "
            f"{fmt_int(usage.api_calls)} | {fmt_int(usage.total_tokens)} | "
            f"{fmt_int(usage.non_cached_tokens)} | {fmt_int(usage.cache_read_tokens)} | "
            f"{fmt_int(usage.output_tokens)} | {fmt_money(usage.estimated_cost_usd)} |"
        )

    lines.extend([
        "",
        "## 按 Profile 汇总",
        "",
        "| Profile | 用户/通道 | Provider | Sessions | API calls | Total | Non-cached | Cache read | Output |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ])
    for profile, usage in sorted(by_profile.items(), key=lambda item: item[1].total_tokens, reverse=True):
        worker = workers.get(profile, WorkerInfo(profile=profile))
        lines.append(
            f"| {profile} | {worker.user_label} | {worker.provider or '-'} | {fmt_int(usage.sessions)} | "
            f"{fmt_int(usage.api_calls)} | {fmt_int(usage.total_tokens)} | "
            f"{fmt_int(usage.non_cached_tokens)} | {fmt_int(usage.cache_read_tokens)} | "
            f"{fmt_int(usage.output_tokens)} |"
        )

    lines.extend([
        "",
        "## Top Sessions",
        "",
        "| 时间 | Profile | 用户/通道 | Total | API calls | Model | 标题 |",
        "| --- | --- | --- | ---: | ---: | --- | --- |",
    ])
    for profile, worker, row, total in top_rows[: args.top]:
        lines.append(
            f"| {session_started(row)} | {profile} | {worker.user_label} | {fmt_int(total)} | "
            f"{fmt_int(int(row['api_call_count'] or 0))} | {compact(row['model'], 32) or '-'} | "
            f"{compact(row['title'] or row['source'], 64) or '-'} |"
        )

    if skipped:
        lines.extend(["", "## 读取异常", ""])
        for item in skipped[:20]:
            lines.append(f"- {item}")
        if len(skipped) > 20:
            lines.append(f"- 另有 {len(skipped) - 20} 条异常已省略。")

    lines.extend([
        "",
        "## 口径说明",
        "",
        "- Total tokens = input + output + cache_read + cache_write。",
        "- Non-cached tokens = input + output + cache_write，用于观察未命中缓存的实际压力。",
        "- `shared-grok` 表示 Grok 专用共享 Gateway，无法按单一 workspace 拆分时单独列出。",
    ])

    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return "\n".join(lines), md_path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default=os.environ.get("HERMES_GATEWAY_POOL_MANIFEST_PATH", DEFAULT_MANIFEST))
    parser.add_argument("--telemetry-root", default=os.environ.get("HERMES_GATEWAY_TELEMETRY_ROOT", DEFAULT_TELEMETRY_ROOT))
    parser.add_argument("--report-root", default=os.environ.get("HERMES_TOKEN_USAGE_REPORT_ROOT", DEFAULT_REPORT_ROOT))
    parser.add_argument("--hours", type=int, default=24)
    parser.add_argument("--date", default="")
    parser.add_argument("--today", action="store_true")
    parser.add_argument("--top", type=int, default=12)
    _report, md_path = build_report(parser.parse_args())
    print(f"Token 消耗日报已生成。")
    print(f"MEDIA:{md_path.as_posix()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
