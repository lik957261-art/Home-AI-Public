#!/usr/bin/env python3
"""Hermes Mobile cron dispatcher wrapper.

This is a product-layer wrapper around the official Hermes cron modules.  It
does not patch official runtime source.  The parent dispatcher only discovers
due jobs, advances their schedule, and starts one detached runner per job so a
long model/tool job cannot block later scheduler ticks.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import signal
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


LOG = logging.getLogger("hermes_mobile_cron_dispatcher")


def _hermes_home() -> Path:
    return Path(os.environ.get("HERMES_HOME") or Path.home() / ".hermes").expanduser()


def _state_dir() -> Path:
    path = _hermes_home() / "cron" / "mobile-dispatch"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _runner_dir() -> Path:
    path = _state_dir() / "runners"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _log_dir() -> Path:
    path = _state_dir() / "logs"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat()


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False


def _lock_path(job_id: str) -> Path:
    return _runner_dir() / f"{job_id}.json"


def _read_json(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _is_job_running(job_id: str) -> bool:
    path = _lock_path(job_id)
    data = _read_json(path)
    if not data:
        try:
            path.unlink()
        except OSError:
            pass
        return False
    pid = int(data.get("pid") or 0)
    if _pid_alive(pid):
        return True
    try:
        path.unlink()
    except OSError:
        pass
    return False


def _write_lock(job_id: str, payload: dict[str, Any]) -> bool:
    path = _lock_path(job_id)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    try:
        fd = os.open(path, flags, 0o600)
    except FileExistsError:
        if _is_job_running(job_id):
            return False
        try:
            path.unlink()
        except OSError:
            return False
        try:
            fd = os.open(path, flags, 0o600)
        except FileExistsError:
            return False
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=True, indent=2)
    return True


def _replace_lock(job_id: str, payload: dict[str, Any]) -> None:
    _lock_path(job_id).write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")
    try:
        os.chmod(_lock_path(job_id), 0o600)
    except OSError:
        pass


def _clear_lock(job_id: str) -> None:
    try:
        _lock_path(job_id).unlink()
    except OSError:
        pass


def _job_log_path(job_id: str) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return _log_dir() / f"{job_id}-{stamp}.log"


def dispatch_due_jobs() -> int:
    from cron.jobs import advance_next_run, get_due_jobs

    due_jobs = get_due_jobs()
    if not due_jobs:
        print("mobile cron dispatcher: no jobs due")
        return 0

    dispatched = 0
    for job in due_jobs:
        job_id = str(job.get("id") or "").strip()
        if not job_id:
            continue
        if _is_job_running(job_id):
            print(f"mobile cron dispatcher: skip running job {job_id}")
            continue

        initial_lock = {
            "job_id": job_id,
            "pid": 0,
            "status": "starting",
            "started_at": _now_iso(),
            "name": str(job.get("name") or ""),
        }
        if not _write_lock(job_id, initial_lock):
            print(f"mobile cron dispatcher: skip locked job {job_id}")
            continue

        try:
            advance_next_run(job_id)
            log_path = _job_log_path(job_id)
            env = os.environ.copy()
            env["HERMES_MOBILE_CRON_CHILD"] = "1"
            with log_path.open("ab", buffering=0) as log:
                process = subprocess.Popen(
                    [
                        sys.executable,
                        str(Path(__file__).resolve()),
                        "--run-job",
                        job_id,
                    ],
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    stdin=subprocess.DEVNULL,
                    env=env,
                    start_new_session=True,
                )
            _replace_lock(
                job_id,
                {
                    **initial_lock,
                    "pid": process.pid,
                    "status": "running",
                    "runner_log": str(log_path),
                },
            )
            dispatched += 1
            print(f"mobile cron dispatcher: dispatched job {job_id} pid={process.pid}")
        except Exception as exc:
            _clear_lock(job_id)
            print(f"mobile cron dispatcher: failed to dispatch job {job_id}: {exc}")

    return dispatched


def _load_job(job_id: str) -> dict[str, Any] | None:
    from cron.jobs import load_jobs

    for job in load_jobs():
        if str(job.get("id")) == job_id:
            return job
    return None


def run_one_job(job_id: str) -> int:
    from cron.jobs import mark_job_run, save_job_output
    from cron.scheduler import SILENT_MARKER, _deliver_result, run_job

    job = _load_job(job_id)
    if not job:
        print(f"mobile cron runner: job not found {job_id}")
        _clear_lock(job_id)
        return 1

    print(f"mobile cron runner: start job {job_id} name={job.get('name', '')!r}")
    try:
        success, output, final_response, error = run_job(job)
        output_file = save_job_output(job_id, output)
        print(f"mobile cron runner: output saved {output_file}")

        deliver_content = final_response if success else f"⚠️ Cron job '{job.get('name', job_id)}' failed:\n{error}"
        should_deliver = bool(deliver_content)
        if should_deliver and success and SILENT_MARKER in deliver_content.strip().upper():
            should_deliver = False

        delivery_error = None
        if should_deliver:
            try:
                delivery_error = _deliver_result(job, deliver_content, adapters=None, loop=None)
            except Exception as exc:
                delivery_error = str(exc)
                print(f"mobile cron runner: delivery failed {delivery_error}")

        if success and not final_response:
            success = False
            error = "Agent completed but produced empty response (model error, timeout, or misconfiguration)"

        mark_job_run(job_id, success, error, delivery_error=delivery_error)
        print(f"mobile cron runner: finish job {job_id} success={success}")
        return 0 if success else 1
    except Exception as exc:
        print(f"mobile cron runner: exception job {job_id}: {exc}")
        try:
            mark_job_run(job_id, False, str(exc))
        except Exception as mark_exc:
            print(f"mobile cron runner: mark failed job {job_id}: {mark_exc}")
        return 1
    finally:
        _clear_lock(job_id)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dispatch", action="store_true", help="Dispatch due jobs and return immediately.")
    parser.add_argument("--run-job", help="Run one job id in the foreground.")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if args.run_job:
        return run_one_job(args.run_job)
    return dispatch_due_jobs()


if __name__ == "__main__":
    raise SystemExit(main())
