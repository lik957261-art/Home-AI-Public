#!/usr/bin/env python3
"""Read and create Hermes native CRON jobs for Hermes Mobile."""

from __future__ import annotations

import json
import inspect
import os
import re
import tempfile
import sys
import uuid
import base64
import stat as stat_module
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
EXPORT_DOCUMENT_EXTENSIONS = {".pdf", ".docx", ".doc"}
MEDIA_DOCUMENT_EXTENSIONS = {".md"} | EXPORT_DOCUMENT_EXTENSIONS
OUTPUT_SCAN_LIMIT = int(os.environ.get("HERMES_MOBILE_AUTOMATION_OUTPUT_SCAN_LIMIT") or os.environ.get("HERMES_WEB_AUTOMATION_OUTPUT_SCAN_LIMIT") or "80")
MAX_READ_FILE_BYTES = int(os.environ.get("HERMES_MOBILE_CRON_FILE_MAX_BYTES") or os.environ.get("HERMES_WEB_CRON_FILE_MAX_BYTES") or "26214400")
PROFILE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
MEDIA_LINE_PATTERN = re.compile(r"(?im)^\s*(?:[-*]\s*)?(?:.*?[:：]\s*)?MEDIA:\s*(.+?)\s*$")
MEDIA_PATH_PATTERN = re.compile(
    r"(?i)(\\\\wsl(?:\.localhost|\$)\\[^\r\n]+?\.(?:pdf|docx|doc|md)|"
    r"[a-z]:\\[^\r\n]+?\.(?:pdf|docx|doc|md)|"
    r"/(?:mnt/[a-z]|home/[^/]+)/[^\r\n]+?\.(?:pdf|docx|doc|md))"
    r"(?=$|[\s)>\"'，,。；;])"
)
ABSOLUTE_PATH_PATTERN = re.compile(
    r"(?i)(\\\\wsl(?:\.localhost|\$)\\[^\r\n`]+|"
    r"[a-z]:\\[^\r\n`]+|"
    r"/(?:mnt/[a-z]|home/[^/]+|tmp|var|private/var)/[^\r\n`]+)"
)

PATH_PATTERNS = [
    re.compile(r"(?i)\\\\wsl(?:\.localhost|\$)\\[^\s]+"),
    re.compile(r"(?i)[a-z]:\\Users\\[^\\]+\\[^\s]+"),
    re.compile(r"/mnt/[a-z]/Users/[^/]+/[^\s]+"),
    re.compile(r"/home/[^/]+/[^\s]+"),
    re.compile(r"/(?:private/)?var/[^\s]+"),
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
        if os.name == "nt":
            return Path(f"{drive.group(1).upper()}:\\{drive.group(2)}")
        drive_tail = drive.group(2).replace("\\", "/")
        value = f"/mnt/{drive.group(1).lower()}/{drive_tail}"
    mnt_drive = re.match(r"(?i)^/mnt/([a-z])/(.+)$", value)
    if mnt_drive and os.name == "nt":
        drive_tail = mnt_drive.group(2).replace("/", "\\")
        return Path(f"{mnt_drive.group(1).upper()}:\\{drive_tail}")
    return Path(value)


def run_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def response_text_from_run(path: Path) -> str:
    text = run_text(path)
    marker = "\n## Response"
    index = text.rfind(marker)
    if index < 0:
        return text
    return text[index:]


def media_paths_from_run(path: Path) -> list[Path]:
    text = response_text_from_run(path)
    if not text:
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
        key = os.path.normcase(os.path.abspath(str(candidate)))
        if key in seen:
            continue
        seen.add(key)
        docs.append(candidate)
    docs.sort(key=lambda item: 0 if item.suffix.lower() == ".md" else 1)
    return docs


def markdown_source_directories_from_run(path: Path) -> list[Path]:
    text = run_text(path)
    if not text:
        return []
    roots: list[Path] = []
    seen: set[str] = set()
    for line in text.splitlines():
        if not re.search(r"(?i)(markdown|\.md|源文件|source)", line):
            continue
        if not re.search(r"(?i)(源文件|目录|directory|dir|folder|path|路径)", line):
            continue
        for match in ABSOLUTE_PATH_PATTERN.finditer(line):
            raw = match.group(1).strip().strip("`'\"<>")
            raw = re.sub(r"[\s)>\"'，,。；;]+$", "", raw).strip()
            candidate = normalize_delivery_path(raw)
            if not candidate:
                continue
            if candidate.suffix:
                candidate = candidate.parent
            try:
                if not candidate.is_dir():
                    continue
            except OSError:
                continue
            key = os.path.normcase(os.path.abspath(str(candidate)))
            if key in seen:
                continue
            seen.add(key)
            roots.append(candidate)
    return roots


def source_markdown_name_candidates(delivery_path: Path) -> list[str]:
    names = [delivery_path.with_suffix(".md").name]
    match = re.match(r"(?i)^x-brief-(\d{4})-(\d{2})-(\d{2})-(\d{6})$", delivery_path.stem)
    if match:
        prefix = f"{match.group(1)}{match.group(2)}{match.group(3)}_{match.group(4)}_"
        names.append(prefix)
    return names


def workspace_root_from_delivery_path(delivery_path: Path) -> Path | None:
    parts = delivery_path.parts
    for index, part in enumerate(parts):
        if part == "交付" and index > 0:
            return Path(*parts[:index])
    return None


def markdown_index_under_root(root: Path) -> dict[str, Path]:
    try:
        key = os.path.normcase(os.path.abspath(str(root)))
    except OSError:
        key = str(root)
    cached = WORKSPACE_MARKDOWN_INDEX_CACHE.get(key)
    if cached is not None:
        return cached
    index: dict[str, Path] = {}
    if not root.is_dir():
        WORKSPACE_MARKDOWN_INDEX_CACHE[key] = index
        return index
    queue = [root]
    scanned = 0
    while queue and scanned < WORKSPACE_MARKDOWN_SCAN_LIMIT:
        current = queue.pop(0)
        try:
            entries = list(current.iterdir())
        except OSError:
            continue
        for entry in entries:
            if scanned >= WORKSPACE_MARKDOWN_SCAN_LIMIT:
                break
            if entry.name.startswith(".") or entry.name in {"node_modules", "__pycache__"}:
                continue
            scanned += 1
            try:
                if entry.is_dir():
                    queue.append(entry)
                    continue
                if entry.is_file() and entry.suffix.lower() == ".md":
                    index.setdefault(entry.name, entry)
            except OSError:
                continue
    WORKSPACE_MARKDOWN_INDEX_CACHE[key] = index
    return index


def shallow_markdown_candidates_under_root(root: Path, names: list[str]) -> list[Path]:
    targets = [name for name in names if name.endswith(".md")]
    if not targets:
        return []
    candidates = [root / name for name in targets]
    scanned = 0
    try:
        children = list(root.iterdir())
    except OSError:
        return candidates
    for child in children:
        if scanned >= 200:
            break
        if child.name.startswith(".") or child.name in {"node_modules", "__pycache__", "交付"}:
            continue
        try:
            if not child.is_dir():
                continue
        except OSError:
            continue
        scanned += 1
        candidates.extend(child / name for name in targets)
        try:
            grandchildren = list(child.iterdir())
        except OSError:
            continue
        for grandchild in grandchildren:
            if scanned >= 200:
                break
            if grandchild.name.startswith(".") or grandchild.name in {"node_modules", "__pycache__"}:
                continue
            try:
                if grandchild.is_dir():
                    scanned += 1
                    candidates.extend(grandchild / name for name in targets)
            except OSError:
                continue
    return candidates


def find_exact_markdown_under_root(root: Path, names: list[str]) -> Path | None:
    targets = [name for name in names if name.endswith(".md")]
    if not targets:
        return None
    for candidate in shallow_markdown_candidates_under_root(root, targets):
        try:
            if candidate.is_file():
                return candidate
        except OSError:
            continue
    if not ENABLE_DEEP_WORKSPACE_MARKDOWN_SCAN:
        return None
    index = markdown_index_under_root(root)
    for name in targets:
        candidate = index.get(name)
        if candidate:
            return candidate
    return None


def source_markdown_for_delivery(run_path: Path, delivery_path: Path) -> Path | None:
    try:
        if delivery_path.suffix.lower() == ".md" and delivery_path.is_file():
            return delivery_path
    except OSError:
        return None
    candidates = [delivery_path.with_suffix(".md")]
    roots = markdown_source_directories_from_run(run_path)
    names = source_markdown_name_candidates(delivery_path)
    for root in roots:
        for name in names:
            if name.endswith(".md"):
                candidates.append(root / name)
            else:
                try:
                    candidates.extend(sorted(root.glob(f"{name}*.md")))
                except OSError:
                    pass
    for candidate in candidates:
        try:
            if candidate.is_file():
                return candidate
        except OSError:
            continue
    return None


def deliverable_items_from_run(path: Path) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add_item(candidate: Path, source: str) -> None:
        if candidate.suffix.lower() not in MEDIA_DOCUMENT_EXTENSIONS:
            return
        try:
            if not candidate.is_file():
                return
        except OSError:
            return
        key = os.path.normcase(os.path.abspath(str(candidate)))
        if key in seen:
            return
        seen.add(key)
        items.append({"path": candidate, "source": source})

    for delivery_path in media_paths_from_run(path):
        source_md = source_markdown_for_delivery(path, delivery_path)
        if source_md:
            add_item(source_md, "source-markdown")
        if delivery_path.suffix.lower() != ".md":
            add_item(delivery_path, "delivery")
    return items


def deliverable_paths_from_run(path: Path) -> list[Path]:
    return [item["path"] for item in deliverable_items_from_run(path)]


def delivery_document(clean_job_id: str, run_path: Path, index: int, path: Path, *, source: str = "delivery", run_stat: os.stat_result | None = None) -> dict[str, Any] | None:
    try:
        if path.suffix.lower() not in MEDIA_DOCUMENT_EXTENSIONS or not path.is_file():
            return None
        stat = path.stat()
        run_stat = run_stat or run_path.stat()
    except OSError:
        return None
    return {
        "name": path.name,
        "mime": mime_for_output(path),
        "size": stat.st_size,
        "updatedAt": datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat(),
        "url": f"/api/automations/deliverable?{urlencode({'jobId': clean_job_id, 'run': run_path.name, 'index': str(index)})}",
        "source": source,
        "runOutput": run_path.name,
        "runOutputUpdatedAt": datetime.fromtimestamp(run_stat.st_mtime).astimezone().isoformat(),
    }


def document_source_rank(doc: dict[str, Any]) -> int:
    source = str(doc.get("source") or "").strip()
    name = str(doc.get("name") or "")
    suffix = Path(name).suffix.lower()
    if source == "source-markdown":
        return 0
    if suffix == ".md":
        return 1
    return 2


def output_documents(job_id: str, limit: int = 30) -> list[dict[str, Any]]:
    clean_job_id = re.sub(r"[^A-Za-z0-9_-]", "", str(job_id or ""))
    if not clean_job_id:
        return []
    output_dir = CRON_OUTPUT_ROOT / clean_job_id
    if not output_dir.is_dir():
        return []
    docs: list[dict[str, Any]] = []
    entries: list[tuple[Path, os.stat_result]] = []
    for path in output_dir.iterdir():
        try:
            path_stat = path.stat()
        except OSError:
            continue
        if not stat_module.S_ISREG(path_stat.st_mode):
            continue
        entries.append((path, path_stat))
    entries.sort(key=lambda item: item[1].st_mtime, reverse=True)
    scan_limit = max(0, OUTPUT_SCAN_LIMIT)
    if scan_limit:
        entries = entries[:scan_limit]
    for path, path_stat in entries:
        if path.suffix.lower() == ".md":
            for index, item in enumerate(deliverable_items_from_run(path)):
                doc = delivery_document(clean_job_id, path, index, item["path"], source=item.get("source") or "delivery", run_stat=path_stat)
                if doc:
                    docs.append(doc)
            continue
        if path.suffix.lower() not in EXPORT_DOCUMENT_EXTENSIONS:
            continue
        docs.append({
            "name": path.name,
            "mime": mime_for_output(path),
            "size": path_stat.st_size,
            "updatedAt": datetime.fromtimestamp(path_stat.st_mtime).astimezone().isoformat(),
            "url": f"/api/automations/output?{urlencode({'jobId': clean_job_id, 'file': path.name})}",
        })
    docs.sort(key=lambda item: (
        -document_timestamp_score(item),
        document_source_rank(item),
        str(item.get("name") or ""),
    ))
    return docs[:limit]


def clean_job_id(value: Any) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "", str(value or ""))[:100]


def safe_output_path(job_id: str, file_name: str) -> Path | None:
    clean = clean_job_id(job_id)
    name = str(file_name or "").strip()
    if not clean or not name or Path(name).name != name or "/" in name or "\\" in name:
        return None
    root = (CRON_OUTPUT_ROOT / clean).resolve()
    path = (root / name).resolve()
    try:
        path.relative_to(root)
    except ValueError:
        return None
    return path


def file_payload(path: Path, display_path: str = "") -> dict[str, Any]:
    if path.suffix.lower() not in MEDIA_DOCUMENT_EXTENSIONS or not path.is_file():
        raise FileNotFoundError("Automation file not found")
    stat = path.stat()
    if stat.st_size > MAX_READ_FILE_BYTES:
        raise ValueError("Automation file is too large to read through the bridge")
    data = path.read_bytes()
    return {
        "name": path.name,
        "mime": mime_for_output(path),
        "size": stat.st_size,
        "updatedAt": datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat(),
        "displayPath": display_path or str(path),
        "contentBase64": base64.b64encode(data).decode("ascii"),
    }


def read_output_file_from_request(request: dict[str, Any]) -> dict[str, Any]:
    job_id = request.get("job_id") or request.get("jobId")
    owner_principal_id = request.get("owner_principal_id") or request.get("ownerPrincipalId")
    file_name = str(request.get("file") or "").strip()
    if not clean_job_id(job_id):
        return {"ok": False, "status": 400, "error": "job_id is required"}
    jobs, source, warning = load_jobs_file()
    _, job = find_owned_job(jobs, clean_job_id(job_id), owner_principal_id)
    if job is None:
        return {"ok": False, "status": 404, "error": "Automation output was not found for this workspace"}
    path = safe_output_path(clean_job_id(job_id), file_name)
    if path is None or not path.is_file():
        return {"ok": False, "status": 404, "error": "Automation output not found"}
    try:
        payload = {"ok": True, "file": file_payload(path, f"CRON output / {clean_job_id(job_id)} / {path.name}"), "source": source}
        if warning:
            payload["warning"] = warning
        return payload
    except ValueError as exc:
        return {"ok": False, "status": 413, "error": compact_text(exc, 200)}
    except OSError:
        return {"ok": False, "status": 404, "error": "Automation output not found"}


def read_deliverable_file_from_request(request: dict[str, Any]) -> dict[str, Any]:
    job_id = request.get("job_id") or request.get("jobId")
    owner_principal_id = request.get("owner_principal_id") or request.get("ownerPrincipalId")
    run_name = str(request.get("run") or "").strip()
    try:
        index = int(request.get("index") or 0)
    except (TypeError, ValueError):
        return {"ok": False, "status": 400, "error": "Invalid automation deliverable index"}
    if not clean_job_id(job_id):
        return {"ok": False, "status": 400, "error": "job_id is required"}
    if index < 0 or index > 999:
        return {"ok": False, "status": 400, "error": "Invalid automation deliverable index"}
    jobs, source, warning = load_jobs_file()
    _, job = find_owned_job(jobs, clean_job_id(job_id), owner_principal_id)
    if job is None:
        return {"ok": False, "status": 404, "error": "Automation deliverable was not found for this workspace"}
    run_path = safe_output_path(clean_job_id(job_id), run_name)
    if run_path is None or run_path.suffix.lower() != ".md" or not run_path.is_file():
        return {"ok": False, "status": 404, "error": "Automation run output not found"}
    paths = deliverable_paths_from_run(run_path)
    if index >= len(paths):
        return {"ok": False, "status": 404, "error": "Automation deliverable not found"}
    path = paths[index]
    try:
        payload = {"ok": True, "file": file_payload(path, f"CRON delivery / {clean_job_id(job_id)} / {path.name}"), "source": source}
        if warning:
            payload["warning"] = warning
        return payload
    except ValueError as exc:
        return {"ok": False, "status": 413, "error": compact_text(exc, 200)}
    except OSError:
        return {"ok": False, "status": 404, "error": "Automation deliverable not found"}


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


def public_job(job: dict[str, Any], detail: str = "full") -> dict[str, Any]:
    schedule = schedule_info(job)
    skills = canonical_skills(job)
    job_id = str(job.get("id") or "")
    payload = {
        "id": job_id,
        "kind": compact_text(job.get("kind"), 80),
        "name": compact_text(job.get("name") or job.get("id") or "Cron job", 120),
        "promptPreview": compact_text(job.get("prompt"), 220),
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
    }
    if str(detail or "").lower() in {"summary", "list", "light"}:
        payload["detailLevel"] = "summary"
        return payload
    payload.update({
        "prompt": compact_text(job.get("prompt"), 4000),
        "skills": skills,
        "enabledToolsets": normalize_string_list(job.get("enabled_toolsets") or job.get("enabledToolsets")),
        "model": compact_text(job.get("model"), 80),
        "provider": compact_text(job.get("provider"), 80),
        "profile": compact_text(job.get("profile"), 120),
        "workdir": compact_text(job.get("workdir"), 600),
        "dataContext": {"type": compact_text((job.get("data_context") or {}).get("type"), 120)} if isinstance(job.get("data_context"), dict) else None,
        "audit": {
            "kind": compact_text((job.get("audit") or {}).get("kind"), 80),
            "pluginId": compact_text((job.get("audit") or {}).get("pluginId"), 80),
            "pluginTitle": compact_text((job.get("audit") or {}).get("pluginTitle"), 120),
            "targetWorkspaceId": compact_text((job.get("audit") or {}).get("targetWorkspaceId"), 120),
            "workspacePathRef": compact_text((job.get("audit") or {}).get("workspacePathRef"), 120),
            "auditMode": compact_text((job.get("audit") or {}).get("auditMode"), 40),
            "executor": compact_text((job.get("audit") or {}).get("executor"), 80),
            "readonly": bool((job.get("audit") or {}).get("readonly")),
        } if isinstance(job.get("audit"), dict) else None,
        "readonly": bool(job.get("readonly")),
        "hasScript": bool(job.get("script")),
        "hasWorkdir": bool(job.get("workdir")),
        "hasDataContext": isinstance(job.get("data_context"), dict),
        "hasContextFrom": bool(job.get("context_from")),
        "outputDocuments": output_documents(job_id),
        "detailLevel": "full",
    })
    return payload


def timestamp_score(value: Any) -> float:
    text = str(value or "").strip()
    if not text:
        return 0.0
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


def document_timestamp_score(doc: dict[str, Any]) -> float:
    if not isinstance(doc, dict):
        return 0.0
    return max(
        timestamp_score(doc.get("runOutputUpdatedAt")),
        timestamp_score(doc.get("updatedAt")),
    )


def latest_delivery_score(job: dict[str, Any]) -> float:
    scores = [document_timestamp_score(doc) for doc in job.get("outputDocuments") or []]
    return max(scores, default=0.0)


def sort_key(job: dict[str, Any]) -> tuple[int, float, int, float, str]:
    delivery_score = latest_delivery_score(job)
    next_score = timestamp_score(job.get("nextRunAt"))
    next_missing = 0 if next_score else 1
    return (
        0 if delivery_score else 1,
        -delivery_score,
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


def normalize_profile(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    if not PROFILE_PATTERN.match(text):
        raise ValueError("profile is invalid")
    return text


def path_inside(parent: Path, child: Path) -> bool:
    try:
        child.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def normalize_workdir(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    path = Path(os.path.expanduser(text))
    if not path.is_absolute():
        raise ValueError("workdir must be absolute")
    allowed_roots = [
        HERMES_HOME / "automation-workspaces",
        CRON_OUTPUT_ROOT,
    ]
    if not any(path_inside(root, path) for root in allowed_roots):
        raise ValueError("workdir is outside the automation data roots")
    return str(path)


def ensure_workdir(value: Any, *, dry_run: bool = False) -> str | None:
    workdir = normalize_workdir(value)
    if workdir and not dry_run:
        Path(workdir).mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(workdir, 0o700)
        except OSError:
            pass
    return workdir


def normalize_data_context(value: Any) -> dict[str, Any] | None:
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        value = {"type": text}
    if not isinstance(value, dict):
        raise ValueError("data_context must be an object")
    context_type = str(value.get("type") or value.get("contextType") or "").strip()
    if not context_type:
        raise ValueError("data_context.type is required")
    normalized: dict[str, Any] = {"type": context_type}
    for key in ("date", "maxThreads", "maxMessagesPerThread", "maxExcerptChars"):
        if value.get(key) is not None:
            normalized[key] = value.get(key)
    scope = value.get("scope")
    if isinstance(scope, dict):
        normalized["scope"] = scope
    return normalized


def normalize_audit_metadata(value: Any) -> dict[str, Any] | None:
    if value in (None, ""):
        return None
    if not isinstance(value, dict):
        raise ValueError("audit must be an object")
    kind = str(value.get("kind") or "plugin_workspace_audit").strip()
    plugin_id = str(value.get("pluginId") or value.get("plugin_id") or "").strip()
    workspace_path = str(value.get("workspacePath") or value.get("workspace_path") or "").strip()
    audit_mode = str(value.get("auditMode") or value.get("audit_mode") or "recent_changes").strip() or "recent_changes"
    executor = str(value.get("executor") or "codex_readonly").strip() or "codex_readonly"
    if kind != "plugin_workspace_audit":
        raise ValueError("audit.kind is invalid")
    if not re.match(r"^[a-z0-9][a-z0-9_-]{0,79}$", plugin_id):
        raise ValueError("audit.pluginId is invalid")
    if audit_mode not in {"alignment", "recent_changes", "dirty_diff", "full_sample"}:
        raise ValueError("audit.auditMode is invalid")
    if executor != "codex_readonly":
        raise ValueError("audit.executor is invalid")
    if not workspace_path or not os.path.isabs(workspace_path):
        raise ValueError("audit.workspacePath must be absolute")
    normalized: dict[str, Any] = {
        "kind": kind,
        "pluginId": plugin_id,
        "pluginTitle": compact_text(value.get("pluginTitle") or value.get("plugin_title"), 120),
        "targetWorkspaceId": compact_text(value.get("targetWorkspaceId") or value.get("target_workspace_id"), 120),
        "workspacePathRef": compact_text(value.get("workspacePathRef") or value.get("workspace_path_ref") or "configured", 120),
        "workspacePath": workspace_path,
        "auditMode": audit_mode,
        "executor": executor,
        "readonly": True,
        "createdAt": compact_text(value.get("createdAt") or value.get("created_at"), 80),
    }
    scope = value.get("scope")
    if isinstance(scope, dict):
        normalized["scope"] = {
            "includeGlobs": normalize_string_list(scope.get("includeGlobs") or scope.get("include_globs"))[:20],
            "excludeGlobs": normalize_string_list(scope.get("excludeGlobs") or scope.get("exclude_globs"))[:20],
        }
    return normalized


def validate_plugin_workspace_audit_payload(raw: dict[str, Any], payload: dict[str, Any]) -> None:
    if str(payload.get("kind") or "").strip() != "plugin_workspace_audit":
        return
    if raw.get("readonly") is False or raw.get("readOnly") is False or raw.get("read_only") is False:
        raise ValueError("plugin workspace audit must be readonly")
    if raw.get("script"):
        raise ValueError("plugin workspace audit cannot define script")
    if raw.get("context_from") or raw.get("contextFrom"):
        raise ValueError("plugin workspace audit cannot define context_from")
    if payload.get("provider") or payload.get("model"):
        raise ValueError("plugin workspace audit cannot override model or provider")
    if payload.get("enabled_toolsets"):
        raise ValueError("plugin workspace audit cannot enable toolsets")
    if payload.get("data_context"):
        raise ValueError("plugin workspace audit cannot define data_context")
    if str(payload.get("deliver") or "local") != "local":
        raise ValueError("plugin workspace audit deliver must be local")
    audit = payload.get("audit")
    if not isinstance(audit, dict):
        raise ValueError("plugin workspace audit metadata is required")
    if audit.get("readonly") is not True:
        raise ValueError("plugin workspace audit metadata must be readonly")


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
    kind = str(raw.get("kind") or "").strip()
    payload = {
        "kind": kind or None,
        "name": name,
        "prompt": prompt,
        "schedule": schedule,
        "repeat": repeat,
        "deliver": str(raw.get("deliver") or "local").strip() or "local",
        "skills": normalize_string_list(raw.get("skills")),
        "enabled_toolsets": normalize_string_list(raw.get("enabled_toolsets") or raw.get("enabledToolsets")),
        "model": str(raw.get("model") or "").strip() or None,
        "provider": str(raw.get("provider") or "").strip() or None,
        "profile": normalize_profile(raw.get("profile") or request.get("profile")),
        "workdir": normalize_workdir(raw.get("workdir")),
        "data_context": normalize_data_context(raw.get("data_context") or raw.get("dataContext")),
        "audit": normalize_audit_metadata(raw.get("audit")),
        "readonly": True if kind == "plugin_workspace_audit" else bool(raw.get("readonly") or raw.get("readOnly") or raw.get("read_only")),
        "owner_principal_id": str(request.get("owner_principal_id") or request.get("ownerPrincipalId") or "").strip() or None,
        "access_policy_context": request.get("access_policy_context") if isinstance(request.get("access_policy_context"), dict) else None,
    }
    validate_plugin_workspace_audit_payload(raw, payload)
    return payload


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
        "profile": payload.get("profile"),
        "enabled_toolsets": payload.get("enabled_toolsets") or None,
        "owner_principal_id": payload.get("owner_principal_id"),
        "access_policy_context": payload.get("access_policy_context"),
    }
    try:
        signature = inspect.signature(create_job)
        supported = {
            key: value
            for key, value in kwargs.items()
            if key in signature.parameters
        }
        return create_job(**supported)
    except TypeError as exc:
        if "unexpected keyword argument" in str(exc):
            return None
        raise
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
        "kind": payload.get("kind"),
        "name": payload["name"],
        "prompt": payload["prompt"],
        "skills": skills,
        "skill": skills[0] if skills else None,
        "model": payload.get("model"),
        "provider": payload.get("provider"),
        "profile": payload.get("profile"),
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
        "workdir": ensure_workdir(payload.get("workdir"), dry_run=dry_run),
        "data_context": payload.get("data_context") or None,
        "audit": payload.get("audit") or None,
        "readonly": bool(payload.get("readonly")),
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
    elif payload.get("kind") == "plugin_workspace_audit":
        job = manual_create_job(payload, dry_run=False)
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
    if "profile" in patch:
        profile = normalize_profile(patch.get("profile"))
        if profile:
            job["profile"] = profile
        else:
            job.pop("profile", None)
    if "workdir" in patch and patch.get("workdir") is not None:
        job["workdir"] = ensure_workdir(patch.get("workdir"))
    if ("data_context" in patch or "dataContext" in patch) and (patch.get("data_context") is not None or patch.get("dataContext") is not None):
        job["data_context"] = normalize_data_context(patch.get("data_context") or patch.get("dataContext"))
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


def run_job_from_request(request: dict[str, Any]) -> dict[str, Any]:
    job_id = str(request.get("job_id") or request.get("jobId") or "").strip()
    owner_principal_id = request.get("owner_principal_id") or request.get("ownerPrincipalId")
    dry_run = bool(request.get("dry_run") or request.get("dryRun"))
    if not job_id:
        return {"ok": False, "status": 400, "error": "job_id is required"}

    jobs, source, warning, path, document = load_jobs_document()
    _index, job = find_owned_job(jobs, job_id, owner_principal_id)
    if job is None:
        return {"ok": False, "status": 404, "error": "Automation job was not found for this workspace"}

    now = datetime.now().astimezone()
    job["enabled"] = True
    job["state"] = "scheduled"
    job["paused_at"] = None
    job["paused_reason"] = None
    job["next_run_at"] = (now - timedelta(seconds=1)).isoformat()
    job["manual_run_requested_at"] = now.isoformat()
    job["updated_at"] = now.isoformat()

    if not dry_run:
        write_path = path or jobs_path_for_write()
        document = document if isinstance(document, dict) else {"jobs": jobs}
        save_jobs_document(write_path, document)

    payload = {
        "ok": True,
        "job": public_job(job),
        "source": {
            **source,
            "action": "run",
            "dryRun": dry_run,
            "runMode": "next_tick",
        },
    }
    if warning:
        payload["warning"] = warning
    return payload


def main() -> None:
    request = read_request()
    action = str(request.get("action") or "list").strip().lower()
    if action == "create":
        json_response(create_job_from_request(request))
    if action in {"delete", "pause", "resume", "update"}:
        result = mutate_job_from_request(request)
        json_response(result, 0 if result.get("ok") else 2)
    if action == "run":
        result = run_job_from_request(request)
        json_response(result, 0 if result.get("ok") else 2)
    if action == "read_output":
        result = read_output_file_from_request(request)
        json_response(result, 0 if result.get("ok") else 2)
    if action == "read_deliverable":
        result = read_deliverable_file_from_request(request)
        json_response(result, 0 if result.get("ok") else 2)
    if action != "list":
        json_response({"ok": False, "error": f"Unsupported cron bridge action: {action}"}, 2)

    include_disabled = bool(request.get("include_disabled") or request.get("includeDisabled"))
    owner_principal_id = request.get("owner_principal_id") or request.get("ownerPrincipalId")
    limit = int(request.get("limit") or 200)
    jobs, source, warning = load_jobs_file()
    if owner_principal_id:
        jobs = [job for job in jobs if job_matches_owner(job, owner_principal_id)]
    detail = str(request.get("detail") or request.get("fields") or "full").strip().lower()
    summary_mode = detail in {"summary", "list", "light"}
    public_jobs = [public_job(job, "summary" if summary_mode else "full") for job in jobs]
    if not include_disabled:
        public_jobs = [job for job in public_jobs if job.get("enabled")]
    public_jobs.sort(key=(lambda job: (
        0 if timestamp_score(job.get("nextRunAt")) else 1,
        timestamp_score(job.get("nextRunAt")) or float("inf"),
        str(job.get("name") or job.get("id") or ""),
    )) if summary_mode else sort_key)
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
