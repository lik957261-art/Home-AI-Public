#!/usr/bin/env python3
"""Read and create Hermes native CRON jobs for Hermes Mobile."""

from __future__ import annotations

import json
import os
import re
import tempfile
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

try:
    from croniter import croniter
    HAS_CRONITER = True
except Exception:
    HAS_CRONITER = False


HERMES_HOME = Path(os.environ.get("HERMES_HOME") or os.environ.get("HERMES_WEB_HERMES_HOME") or (Path.home() / ".hermes"))
DEFAULT_JOBS_PATHS = [
    str(HERMES_HOME / "cron" / "jobs.json"),
    os.environ.get("HERMES_WEB_CRON_JOBS_FALLBACK_PATH", ""),
]

CRON_OUTPUT_ROOT = Path(os.environ.get("HERMES_WEB_CRON_OUTPUT_ROOT") or (HERMES_HOME / "cron" / "output"))
DELIVERY_DOCUMENT_EXTENSIONS = {".pdf", ".docx", ".doc"}
MEDIA_DOCUMENT_EXTENSIONS = DELIVERY_DOCUMENT_EXTENSIONS | {".md"}
MEDIA_LINE_PATTERN = re.compile(r"(?im)^\s*(?:[-*]\s*)?(?:.*?[:：]\s*)?MEDIA:\s*(.+?)\s*$")
MEDIA_PATH_PATTERN = re.compile(
    r"(?i)(\\\\wsl(?:\.localhost|\$)\\[^\r\n]+?\.(?:pdf|docx|doc|md)|"
    r"[a-z]:\\[^\r\n]+?\.(?:pdf|docx|doc|md)|"
    r"/(?:mnt/[a-z]|home/[^/]+)/[^\r\n]+?\.(?:pdf|docx|doc|md))"
    r"(?=$|[\s)>\"'，,。；;])"
)

PATH_PATTERNS = [
    re.compile(r"(?i)\\\\wsl(?:\.localhost|\$)\\[^\s]+"),
    re.compile(r"(?i)[a-z]:\\Users\\[^\\]+\\[^\s]+"),
    re.compile(r"/mnt/[a-z]/Users/[^/]+/[^\s]+"),
    re.compile(r"/home/[^/]+/[^\s]+"),
]


def compact_text(value: Any, limit: int = 240) -> str:
    text = str(value or "").replace("\r", "\n")
    text = "\n".join(line.strip() for line in text.split("\n") if line.strip())
    text = re.sub(r"\s+", " ", text).strip()
    for pattern in PATH_PATTERNS:
        text = pattern.sub("[path]", text)
    if len(text) > limit:
        return text[: max(0, limit - 1)].rstrip() + "..."
    return text


def read_request() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    return json.loads(raw)


def json_response(payload: dict[str, Any], status: int = 0) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    sys.stdout.write("\n")
    raise SystemExit(status)


def candidate_paths() -> list[Path]:
    raw_items = [
        os.environ.get("HERMES_WEB_CRON_JOBS_PATH"),
        os.environ.get("HERMES_CRON_JOBS_PATH"),
        *DEFAULT_JOBS_PATHS,
    ]
    paths: list[Path] = []
    seen: set[str] = set()
    for raw in raw_items:
        if not raw:
            continue
        path = Path(os.path.expanduser(str(raw))).resolve()
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        paths.append(path)
    return paths


def jobs_path_for_write() -> Path:
    paths = candidate_paths()
    for path in paths:
        if path.exists():
            return path
    if not paths:
        return Path(DEFAULT_JOBS_PATHS[0])
    return paths[0]


def load_jobs_document() -> tuple[list[dict[str, Any]], dict[str, Any], str | None, Path | None, dict[str, Any]]:
    checked = 0
    for path in candidate_paths():
        checked += 1
        if not path.exists():
            continue
        with path.open("r", encoding="utf-8") as handle:
            parsed = json.load(handle)
        jobs = parsed.get("jobs", []) if isinstance(parsed, dict) else []
        if not isinstance(jobs, list):
            jobs = []
        source = {
            "name": "hermes_cron",
            "available": True,
            "jobCount": len(jobs),
            "pathKind": "hermes_home" if ".hermes" in str(path) else "override_bundle",
        }
        document = parsed if isinstance(parsed, dict) else {"jobs": jobs}
        return [job for job in jobs if isinstance(job, dict)], source, None, path, document
    return [], {
        "name": "hermes_cron",
        "available": False,
        "jobCount": 0,
        "checkedPaths": checked,
    }, "Hermes CRON jobs file was not found.", None, {"jobs": []}


def load_jobs_file() -> tuple[list[dict[str, Any]], dict[str, Any], str | None]:
    jobs, source, warning, _path, _document = load_jobs_document()
    return jobs, source, warning


def canonical_skills(job: dict[str, Any]) -> list[str]:
    raw = job.get("skills")
    if raw is None:
        raw = [job.get("skill")] if job.get("skill") else []
    elif isinstance(raw, str):
        raw = [raw]
    out: list[str] = []
    for item in raw or []:
        text = str(item or "").strip()
        if text and text not in out:
            out.append(text)
    return out


def repeat_label(job: dict[str, Any]) -> str:
    repeat = job.get("repeat") if isinstance(job.get("repeat"), dict) else {}
    times = repeat.get("times")
    completed = int(repeat.get("completed") or 0)
    if times is None:
        return "forever"
    try:
        times_int = int(times)
    except Exception:
        return str(times)
    if times_int == 1:
        return "once" if completed == 0 else "1/1"
    return f"{completed}/{times_int}" if completed else f"{times_int} times"


def schedule_info(job: dict[str, Any]) -> dict[str, str]:
    schedule = job.get("schedule") if isinstance(job.get("schedule"), dict) else {}
    kind = str(schedule.get("kind") or "").strip()
    display = str(job.get("schedule_display") or schedule.get("display") or "").strip()
    if not display:
        if kind == "cron":
            display = str(schedule.get("expr") or "").strip()
        elif kind == "interval":
            display = f"every {schedule.get('minutes')}m"
        elif kind == "once":
            display = str(schedule.get("run_at") or "").strip()
    return {
        "kind": kind or "unknown",
        "display": display or "unscheduled",
    }


def schedule_edit_text(job: dict[str, Any]) -> str:
    schedule = job.get("schedule") if isinstance(job.get("schedule"), dict) else {}
    kind = str(schedule.get("kind") or "").strip()
    if kind == "cron":
        return str(schedule.get("expr") or "").strip()
    if kind == "interval":
        return f"every {schedule.get('minutes') or 1}m"
    if kind == "once":
        return str(schedule.get("run_at") or "").strip()
    return str(job.get("schedule_display") or schedule.get("display") or "").strip()


def delivery_label(value: Any) -> str:
    raw = str(value or "local").strip() or "local"
    labels: list[str] = []
    for part in raw.split(","):
        item = part.strip()
        if not item:
            continue
        if ":" in item:
            labels.append(f"{item.split(':', 1)[0]}:target")
        else:
            labels.append(item)
    return ", ".join(labels) or "local"


def mime_for_output(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".pdf":
        return "application/pdf"
    if ext == ".doc":
        return "application/msword"
    if ext == ".docx":
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    if ext == ".md":
        return "text/markdown; charset=utf-8"
    if ext == ".txt":
        return "text/plain; charset=utf-8"
    return "application/octet-stream"


def normalize_delivery_path(raw: str) -> Path | None:
    value = str(raw or "").strip().strip("`'\"<>")
    value = re.sub(r"[\s)>\"'，,。；;]+$", "", value).strip()
    if not value:
        return None
    unc = re.match(r"(?i)^\\\\wsl(?:\.localhost|\$)\\([^\\]+)\\(.+)$", value)
    if unc:
        value = "/" + unc.group(2).replace("\\", "/")
    drive = re.match(r"(?i)^([a-z]):[\\/](.+)$", value)
    if drive:
        drive_tail = drive.group(2).replace("\\", "/")
        value = f"/mnt/{drive.group(1).lower()}/{drive_tail}"
    return Path(value)


def media_paths_from_run(path: Path) -> list[Path]:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    values: list[str] = []
    for match in MEDIA_LINE_PATTERN.finditer(text):
        payload = match.group(1).strip()
        path_matches = [item.group(1).strip() for item in MEDIA_PATH_PATTERN.finditer(payload)]
        values.extend(path_matches or [payload])
    docs: list[Path] = []
    seen: set[str] = set()
    for raw in values:
        candidate = normalize_delivery_path(raw)
        if not candidate or candidate.suffix.lower() not in MEDIA_DOCUMENT_EXTENSIONS:
            continue
        try:
            key = str(candidate.resolve())
        except OSError:
            key = str(candidate)
        if key in seen:
            continue
        seen.add(key)
        docs.append(candidate)
    docs.sort(key=lambda item: 0 if item.suffix.lower() in DELIVERY_DOCUMENT_EXTENSIONS else 1)
    return docs


def delivery_document(clean_job_id: str, run_path: Path, index: int, path: Path) -> dict[str, Any] | None:
    if path.suffix.lower() not in MEDIA_DOCUMENT_EXTENSIONS or not path.is_file():
        return None
    stat = path.stat()
    run_stat = run_path.stat()
    return {
        "name": path.name,
        "mime": mime_for_output(path),
        "size": stat.st_size,
        "updatedAt": datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat(),
        "url": f"/api/automations/deliverable?{urlencode({'jobId': clean_job_id, 'run': run_path.name, 'index': str(index)})}",
        "source": "delivery",
        "runOutput": run_path.name,
        "runOutputUpdatedAt": datetime.fromtimestamp(run_stat.st_mtime).astimezone().isoformat(),
    }


def output_documents(job_id: str, limit: int = 30) -> list[dict[str, Any]]:
    clean_job_id = re.sub(r"[^A-Za-z0-9_-]", "", str(job_id or ""))
    if not clean_job_id:
        return []
    output_dir = CRON_OUTPUT_ROOT / clean_job_id
    if not output_dir.is_dir():
        return []
    docs: list[dict[str, Any]] = []
    for path in sorted(output_dir.iterdir(), key=lambda item: item.stat().st_mtime if item.exists() else 0, reverse=True):
        if not path.is_file():
            continue
        if path.suffix.lower() == ".md":
            for index, delivery_path in enumerate(media_paths_from_run(path)):
                doc = delivery_document(clean_job_id, path, index, delivery_path)
                if doc:
                    docs.append(doc)
                if len(docs) >= limit:
                    return docs
            continue
        if path.suffix.lower() not in DELIVERY_DOCUMENT_EXTENSIONS:
            continue
        stat = path.stat()
        docs.append({
            "name": path.name,
            "mime": mime_for_output(path),
            "size": stat.st_size,
            "updatedAt": datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat(),
            "url": f"/api/automations/output?{urlencode({'jobId': clean_job_id, 'file': path.name})}",
        })
        if len(docs) >= limit:
            break
    return docs


def status_label(job: dict[str, Any]) -> str:
    enabled = bool(job.get("enabled", True))
    state = str(job.get("state") or "").strip().lower()
    last_status = str(job.get("last_status") or "").strip().lower()
    if not enabled or state == "paused":
        return "paused"
    if state == "error" or last_status == "error" or job.get("last_error"):
        return "error"
    if job.get("next_run_at"):
        return "scheduled"
    if last_status == "ok":
        return "completed"
    return state or "scheduled"


def public_job(job: dict[str, Any]) -> dict[str, Any]:
    schedule = schedule_info(job)
    skills = canonical_skills(job)
    job_id = str(job.get("id") or "")
    return {
        "id": job_id,
        "name": compact_text(job.get("name") or job.get("id") or "Cron job", 120),
        "prompt": compact_text(job.get("prompt"), 4000),
        "promptPreview": compact_text(job.get("prompt"), 220),
        "skills": skills,
        "model": compact_text(job.get("model"), 80),
        "provider": compact_text(job.get("provider"), 80),
        "schedule": schedule["display"],
        "scheduleText": schedule_edit_text(job),
        "scheduleKind": schedule["kind"],
        "repeat": repeat_label(job),
        "enabled": bool(job.get("enabled", True)),
        "state": str(job.get("state") or ("scheduled" if job.get("enabled", True) else "paused")),
        "status": status_label(job),
        "nextRunAt": str(job.get("next_run_at") or ""),
        "lastRunAt": str(job.get("last_run_at") or ""),
        "lastStatus": str(job.get("last_status") or ""),
        "lastError": compact_text(job.get("last_error"), 400),
        "lastDeliveryError": compact_text(job.get("last_delivery_error"), 400),
        "deliver": delivery_label(job.get("deliver")),
        "ownerPrincipalId": compact_text(job.get("owner_principal_id"), 120),
        "workdir": compact_text(job.get("workdir"), 600),
        "hasScript": bool(job.get("script")),
        "hasWorkdir": bool(job.get("workdir")),
        "hasContextFrom": bool(job.get("context_from")),
        "outputDocuments": output_documents(job_id),
    }


def timestamp_score(value: Any) -> float:
    text = str(value or "").strip()
    if not text:
        return 0.0
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


def sort_key(job: dict[str, Any]) -> tuple[int, float, int, float, str]:
    last_score = timestamp_score(job.get("lastRunAt"))
    next_score = timestamp_score(job.get("nextRunAt"))
    next_missing = 0 if next_score else 1
    return (
        0 if last_score else 1,
        -last_score,
        next_missing,
        next_score or float("inf"),
        str(job.get("name") or job.get("id") or ""),
    )


def parse_duration(value: str) -> int:
    match = re.match(r"^(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$", value.strip().lower())
    if not match:
        raise ValueError(f"Invalid duration: {value!r}")
    amount = int(match.group(1))
    unit = match.group(2)[0]
    return amount * {"m": 1, "h": 60, "d": 1440}[unit]


def cron_field_values(expr: str, minimum: int, maximum: int, *, weekday: bool = False) -> set[int]:
    values: set[int] = set()
    for part in str(expr or "").split(","):
        item = part.strip()
        if not item:
            continue
        step = 1
        if "/" in item:
            item, raw_step = item.split("/", 1)
            step = int(raw_step)
            if step <= 0:
                raise ValueError(f"Invalid cron step: {raw_step!r}")
        if item == "*":
            if weekday:
                values.update(range(0, 7, step))
                continue
            start, end = minimum, maximum
        elif "-" in item:
            raw_start, raw_end = item.split("-", 1)
            start, end = int(raw_start), int(raw_end)
        else:
            start = end = int(item)
        if weekday:
            if start == 7:
                start = 0
            if end == 7:
                end = 0
        if start < minimum or start > maximum or end < minimum or end > maximum:
            raise ValueError(f"Cron field {expr!r} outside {minimum}-{maximum}")
        if start <= end:
            values.update(range(start, end + 1, step))
        else:
            values.update(range(start, maximum + 1, step))
            values.update(range(minimum, end + 1, step))
    return values


def validate_simple_cron(schedule: str) -> None:
    minute, hour, day, month, weekday = schedule.split()[:5]
    cron_field_values(minute, 0, 59)
    cron_field_values(hour, 0, 23)
    cron_field_values(day, 1, 31)
    cron_field_values(month, 1, 12)
    cron_field_values(weekday, 0, 7, weekday=True)


def parse_schedule(value: str) -> dict[str, Any]:
    schedule = str(value or "").strip()
    if not schedule:
        raise ValueError("schedule is required")
    lower = schedule.lower()
    if lower.startswith("every "):
        minutes = parse_duration(schedule[6:].strip())
        return {"kind": "interval", "minutes": minutes, "display": f"every {minutes}m"}
    parts = schedule.split()
    if len(parts) >= 5 and all(re.match(r"^[\d\*\-,/]+$", part) for part in parts[:5]):
        if HAS_CRONITER:
            croniter(schedule)
        else:
            validate_simple_cron(schedule)
        return {"kind": "cron", "expr": schedule, "display": schedule}
    if "T" in schedule or re.match(r"^\d{4}-\d{2}-\d{2}", schedule):
        dt = datetime.fromisoformat(schedule.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.astimezone()
        return {"kind": "once", "run_at": dt.isoformat(), "display": f"once at {dt.strftime('%Y-%m-%d %H:%M')}"}
    minutes = parse_duration(schedule)
    run_at = datetime.now().astimezone() + timedelta(minutes=minutes)
    return {"kind": "once", "run_at": run_at.isoformat(), "display": f"once in {schedule}"}


def compute_next_run(schedule: dict[str, Any]) -> str | None:
    now = datetime.now().astimezone()
    kind = schedule.get("kind")
    if kind == "once":
        return str(schedule.get("run_at") or "") or None
    if kind == "interval":
        return (now + timedelta(minutes=int(schedule.get("minutes") or 1))).isoformat()
    if kind == "cron":
        expr = str(schedule.get("expr") or "")
        if HAS_CRONITER:
            return croniter(expr, now).get_next(datetime).isoformat()
        minute, hour, day, month, weekday = expr.split()[:5]
        minutes = cron_field_values(minute, 0, 59)
        hours = cron_field_values(hour, 0, 23)
        days = cron_field_values(day, 1, 31)
        months = cron_field_values(month, 1, 12)
        weekdays = cron_field_values(weekday, 0, 7, weekday=True)
        candidate = now.replace(second=0, microsecond=0) + timedelta(minutes=1)
        deadline = now + timedelta(days=366 * 5)
        while candidate <= deadline:
            cron_weekday = (candidate.weekday() + 1) % 7
            if (
                candidate.minute in minutes
                and candidate.hour in hours
                and candidate.day in days
                and candidate.month in months
                and cron_weekday in weekdays
            ):
                return candidate.isoformat()
            candidate += timedelta(minutes=1)
        return None
    return None


def normalize_string_list(value: Any, limit: int = 12) -> list[str]:
    raw = value if isinstance(value, list) else ([value] if value else [])
    out: list[str] = []
    for item in raw:
        text = str(item or "").strip()
        if text and text not in out:
            out.append(text)
        if len(out) >= limit:
            break
    return out


def normalize_create_payload(request: dict[str, Any]) -> dict[str, Any]:
    raw = request.get("job") if isinstance(request.get("job"), dict) else request
    name = compact_text(raw.get("name") or request.get("text") or "Hermes automation", 120)
    prompt = str(raw.get("prompt") or "").strip()
    schedule = str(raw.get("schedule") or "").strip()
    if not prompt:
        raise ValueError("prompt is required")
    if not schedule:
        raise ValueError("schedule is required")
    repeat = raw.get("repeat")
    if repeat in ("", "forever"):
        repeat = None
    elif repeat is not None:
        repeat = int(repeat)
        if repeat <= 0:
            repeat = None
    return {
        "name": name,
        "prompt": prompt,
        "schedule": schedule,
        "repeat": repeat,
        "deliver": str(raw.get("deliver") or "local").strip() or "local",
        "skills": normalize_string_list(raw.get("skills")),
        "enabled_toolsets": normalize_string_list(raw.get("enabled_toolsets") or raw.get("enabledToolsets")),
        "model": str(raw.get("model") or "").strip() or None,
        "provider": str(raw.get("provider") or "").strip() or None,
        "owner_principal_id": str(request.get("owner_principal_id") or request.get("ownerPrincipalId") or "").strip() or None,
        "access_policy_context": request.get("access_policy_context") if isinstance(request.get("access_policy_context"), dict) else None,
    }


def try_native_create_job(payload: dict[str, Any]) -> dict[str, Any] | None:
    repo_paths = [
        os.environ.get("HERMES_WEB_HERMES_REPO"),
        str(HERMES_HOME / "hermes-agent"),
        os.environ.get("HERMES_WEB_HERMES_REPO_FALLBACK", ""),
    ]
    for raw_path in repo_paths:
        if raw_path and Path(raw_path).exists() and str(raw_path) not in sys.path:
            sys.path.insert(0, str(raw_path))
    try:
        from cron.jobs import create_job
    except Exception:
        return None
    kwargs = {
        "prompt": payload["prompt"],
        "schedule": payload["schedule"],
        "name": payload["name"],
        "repeat": payload["repeat"],
        "deliver": payload["deliver"],
        "skills": payload["skills"],
        "model": payload.get("model"),
        "provider": payload.get("provider"),
        "enabled_toolsets": payload.get("enabled_toolsets") or None,
        "owner_principal_id": payload.get("owner_principal_id"),
        "access_policy_context": payload.get("access_policy_context"),
    }
    try:
        return create_job(**kwargs)
    except Exception as exc:
        if "croniter" in str(exc).lower():
            return None
        raise


def save_jobs_document(path: Path, document: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=".jobs.", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(document, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(tmp_name, path)
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)


def manual_create_job(payload: dict[str, Any], *, dry_run: bool = False) -> dict[str, Any]:
    parsed_schedule = parse_schedule(payload["schedule"])
    repeat = payload.get("repeat")
    if parsed_schedule.get("kind") == "once" and repeat is None:
        repeat = 1
    job_id = uuid.uuid4().hex[:12]
    now = datetime.now().astimezone().isoformat()
    skills = payload.get("skills") or []
    job = {
        "id": job_id,
        "name": payload["name"],
        "prompt": payload["prompt"],
        "skills": skills,
        "skill": skills[0] if skills else None,
        "model": payload.get("model"),
        "provider": payload.get("provider"),
        "base_url": None,
        "script": None,
        "owner_principal_id": payload.get("owner_principal_id"),
        "access_policy_context": payload.get("access_policy_context"),
        "context_from": None,
        "schedule": parsed_schedule,
        "schedule_display": parsed_schedule.get("display", payload["schedule"]),
        "repeat": {"times": repeat, "completed": 0},
        "enabled": True,
        "state": "scheduled",
        "paused_at": None,
        "paused_reason": None,
        "created_at": now,
        "next_run_at": compute_next_run(parsed_schedule),
        "last_run_at": None,
        "last_status": None,
        "last_error": None,
        "last_delivery_error": None,
        "deliver": payload.get("deliver") or "local",
        "origin": None,
        "enabled_toolsets": payload.get("enabled_toolsets") or None,
        "workdir": None,
    }
    if dry_run:
        return job
    jobs, _source, _warning, path, document = load_jobs_document()
    path = path or jobs_path_for_write()
    document = document if isinstance(document, dict) else {"jobs": jobs}
    document["jobs"] = [job for job in jobs if isinstance(job, dict)] + [job]
    save_jobs_document(path, document)
    return job


def create_job_from_request(request: dict[str, Any]) -> dict[str, Any]:
    payload = normalize_create_payload(request)
    dry_run = bool(request.get("dry_run") or request.get("dryRun"))
    if dry_run:
        job = manual_create_job(payload, dry_run=True)
    else:
        job = try_native_create_job(payload) or manual_create_job(payload, dry_run=False)
    return {
        "ok": True,
        "job": public_job(job),
        "source": {
            "name": "hermes_cron",
            "available": True,
            "action": "create",
            "dryRun": dry_run,
        },
    }


def job_owner_principal(job: dict[str, Any]) -> str:
    return str(job.get("owner_principal_id") or "").strip()


def job_matches_owner(job: dict[str, Any], owner_principal_id: Any) -> bool:
    expected = str(owner_principal_id or "").strip()
    if not expected:
        return False
    owner = job_owner_principal(job)
    if owner:
        return owner == expected
    return expected == "owner"


def find_owned_job(jobs: list[dict[str, Any]], job_id: str, owner_principal_id: Any) -> tuple[int, dict[str, Any]] | tuple[None, None]:
    target = str(job_id or "").strip()
    for index, job in enumerate(jobs):
        if str(job.get("id") or "") == target and job_matches_owner(job, owner_principal_id):
            return index, job
    return None, None


def update_job_from_patch(job: dict[str, Any], patch: dict[str, Any]) -> None:
    if "name" in patch and patch.get("name") is not None:
        name = compact_text(patch.get("name"), 120)
        if not name:
            raise ValueError("name is required")
        job["name"] = name
    if "prompt" in patch and patch.get("prompt") is not None:
        prompt = str(patch.get("prompt") or "").strip()
        if not prompt:
            raise ValueError("prompt is required")
        job["prompt"] = prompt
    if "schedule" in patch and patch.get("schedule") is not None:
        schedule = parse_schedule(str(patch.get("schedule") or ""))
        job["schedule"] = schedule
        job["schedule_display"] = schedule.get("display") or str(patch.get("schedule") or "")
        if bool(job.get("enabled", True)):
            job["next_run_at"] = compute_next_run(schedule)
    if "deliver" in patch and patch.get("deliver") is not None:
        job["deliver"] = str(patch.get("deliver") or "local").strip() or "local"
    if "skills" in patch and patch.get("skills") is not None:
        skills = normalize_string_list(patch.get("skills"))
        job["skills"] = skills
        job["skill"] = skills[0] if skills else None
    if "enabled_toolsets" in patch and patch.get("enabled_toolsets") is not None:
        job["enabled_toolsets"] = normalize_string_list(patch.get("enabled_toolsets"))
    if "model" in patch and patch.get("model") is not None:
        job["model"] = str(patch.get("model") or "").strip() or None
    if "provider" in patch and patch.get("provider") is not None:
        job["provider"] = str(patch.get("provider") or "").strip() or None
    if "workdir" in patch and patch.get("workdir") is not None:
        job["workdir"] = str(patch.get("workdir") or "").strip() or None
    job["updated_at"] = datetime.now().astimezone().isoformat()


def mutate_job_from_request(request: dict[str, Any]) -> dict[str, Any]:
    action = str(request.get("action") or "").strip().lower()
    job_id = str(request.get("job_id") or request.get("jobId") or "").strip()
    owner_principal_id = request.get("owner_principal_id") or request.get("ownerPrincipalId")
    dry_run = bool(request.get("dry_run") or request.get("dryRun"))
    if not job_id:
        return {"ok": False, "status": 400, "error": "job_id is required"}

    jobs, source, warning, path, document = load_jobs_document()
    index, job = find_owned_job(jobs, job_id, owner_principal_id)
    if job is None or index is None:
        return {"ok": False, "status": 404, "error": "Automation job was not found for this workspace"}

    now = datetime.now().astimezone().isoformat()
    deleted_job: dict[str, Any] | None = None
    if action == "delete":
        deleted_job = job
        document["jobs"] = [item for item in jobs if str(item.get("id") or "") != job_id]
    elif action == "pause":
        job["enabled"] = False
        job["state"] = "paused"
        job["paused_at"] = now
        job["paused_reason"] = str(request.get("reason") or "hermes_web").strip() or "hermes_web"
        job["next_run_at"] = None
        job["updated_at"] = now
    elif action == "resume":
        job["enabled"] = True
        job["state"] = "scheduled"
        job["paused_at"] = None
        job["paused_reason"] = None
        schedule = job.get("schedule") if isinstance(job.get("schedule"), dict) else {}
        job["next_run_at"] = compute_next_run(schedule)
        job["updated_at"] = now
    elif action == "update":
        patch = request.get("patch") if isinstance(request.get("patch"), dict) else {}
        update_job_from_patch(job, patch)
    else:
        return {"ok": False, "status": 400, "error": f"Unsupported cron bridge action: {action}"}

    if not dry_run:
        write_path = path or jobs_path_for_write()
        document = document if isinstance(document, dict) else {"jobs": jobs}
        save_jobs_document(write_path, document)

    payload = {
        "ok": True,
        "source": {
            **source,
            "action": action,
            "dryRun": dry_run,
        },
    }
    if warning:
        payload["warning"] = warning
    if deleted_job is not None:
        payload["deletedJob"] = public_job(deleted_job)
    else:
        payload["job"] = public_job(job)
    return payload


def main() -> None:
    request = read_request()
    action = str(request.get("action") or "list").strip().lower()
    if action == "create":
        json_response(create_job_from_request(request))
    if action in {"delete", "pause", "resume", "update"}:
        result = mutate_job_from_request(request)
        json_response(result, 0 if result.get("ok") else 2)
    if action != "list":
        json_response({"ok": False, "error": f"Unsupported cron bridge action: {action}"}, 2)

    include_disabled = bool(request.get("include_disabled") or request.get("includeDisabled"))
    limit = int(request.get("limit") or 200)
    jobs, source, warning = load_jobs_file()
    public_jobs = [public_job(job) for job in jobs]
    if not include_disabled:
        public_jobs = [job for job in public_jobs if job.get("enabled")]
    public_jobs.sort(key=sort_key)
    if limit > 0:
        public_jobs = public_jobs[:limit]
    payload = {
        "ok": True,
        "jobs": public_jobs,
        "source": source,
    }
    if warning:
        payload["warning"] = warning
    json_response(payload)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        json_response({"ok": False, "error": compact_text(exc, 800)}, 1)
