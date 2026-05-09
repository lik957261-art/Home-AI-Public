#!/usr/bin/env python3
"""Rewrite Hermes Mobile runtime workspace roots with a literal mapping file.

The tool is intentionally deployment-neutral. Keep site-specific old/new paths
in an operator-owned JSON mapping file, not in this repository.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_JSON_FILES = [
    "config/access-control/weixin-users.json",
    "config/access-control/weixin-routing-map.json",
    "shared-directories.json",
    "config/project-directory-map.json",
    "state.json",
]

DEFAULT_SQLITE_FILE = "hermes-mobile.sqlite3"


@dataclass(frozen=True)
class Replacement:
    old: str
    new: str


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Rewrite Hermes Mobile JSON and SQLite runtime path references "
            "according to a literal replacement mapping."
        )
    )
    parser.add_argument(
        "--data-dir",
        default="workspace/hermes-web",
        help="Hermes Mobile runtime data directory. Defaults to workspace/hermes-web.",
    )
    parser.add_argument(
        "--map",
        required=True,
        help="JSON file containing replacements and optional file selection.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes. Without this flag the command is a dry run.",
    )
    parser.add_argument(
        "--backup-dir",
        help="Directory for file backups before writing. Defaults to <data-dir>/backups/root-migration-* when --apply is set.",
    )
    parser.add_argument(
        "--json-file",
        action="append",
        default=[],
        help="Additional JSON file to rewrite, relative to data-dir unless absolute. Can be repeated.",
    )
    parser.add_argument(
        "--sqlite-file",
        help="SQLite database to rewrite, relative to data-dir unless absolute. Defaults to hermes-mobile.sqlite3.",
    )
    return parser.parse_args(argv)


def load_mapping(path: Path) -> tuple[list[Replacement], list[str], str | None]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    raw_replacements = payload.get("replacements")
    if not isinstance(raw_replacements, list) or not raw_replacements:
        raise ValueError("mapping file must contain a non-empty replacements array")

    replacements: list[Replacement] = []
    for index, item in enumerate(raw_replacements):
        if not isinstance(item, dict):
            raise ValueError(f"replacements[{index}] must be an object")
        old = item.get("from")
        new = item.get("to")
        if not isinstance(old, str) or not old:
            raise ValueError(f"replacements[{index}].from must be a non-empty string")
        if not isinstance(new, str) or not new:
            raise ValueError(f"replacements[{index}].to must be a non-empty string")
        replacements.append(Replacement(old=old, new=new))

    json_files = payload.get("json_files", DEFAULT_JSON_FILES)
    if json_files is None:
        json_files = []
    if not isinstance(json_files, list) or not all(isinstance(item, str) for item in json_files):
        raise ValueError("json_files must be a list of strings")

    sqlite_file = payload.get("sqlite_file", DEFAULT_SQLITE_FILE)
    if sqlite_file is not None and not isinstance(sqlite_file, str):
        raise ValueError("sqlite_file must be a string or null")

    return replacements, json_files, sqlite_file


def resolve_under_data_dir(data_dir: Path, value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return data_dir / path


def apply_replacements(value: str, replacements: list[Replacement]) -> tuple[str, int]:
    updated = value
    count = 0
    for replacement in replacements:
        occurrences = updated.count(replacement.old)
        if occurrences:
            updated = updated.replace(replacement.old, replacement.new)
            count += occurrences
    return updated, count


def rewrite_json_value(value: Any, replacements: list[Replacement]) -> tuple[Any, int]:
    if isinstance(value, str):
        return apply_replacements(value, replacements)
    if isinstance(value, list):
        changed = 0
        updated = []
        for item in value:
            new_item, item_changed = rewrite_json_value(item, replacements)
            updated.append(new_item)
            changed += item_changed
        return updated, changed
    if isinstance(value, dict):
        changed = 0
        updated: dict[str, Any] = {}
        for key, item in value.items():
            new_key, key_changed = apply_replacements(key, replacements)
            new_item, item_changed = rewrite_json_value(item, replacements)
            updated[new_key] = new_item
            changed += key_changed + item_changed
        return updated, changed
    return value, 0


def backup_file(path: Path, backup_dir: Path, root: Path) -> Path:
    try:
        relative = path.resolve().relative_to(root.resolve())
    except ValueError:
        relative = Path(path.name)
    target = backup_dir / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, target)
    return target


def rewrite_json_file(path: Path, replacements: list[Replacement], apply: bool, backup_dir: Path | None, root: Path) -> dict[str, Any]:
    if not path.exists():
        return {"path": str(path), "exists": False, "changed": 0, "written": False}
    payload = json.loads(path.read_text(encoding="utf-8"))
    updated, changed = rewrite_json_value(payload, replacements)
    if changed and apply:
        if backup_dir is not None:
            backup_file(path, backup_dir, root)
        path.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"path": str(path), "exists": True, "changed": changed, "written": bool(changed and apply)}


def quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def text_columns(conn: sqlite3.Connection, table: str) -> list[str]:
    columns: list[str] = []
    for row in conn.execute(f"PRAGMA table_info({quote_identifier(table)})"):
        name = str(row[1])
        declared_type = str(row[2] or "").upper()
        if any(part in declared_type for part in ("TEXT", "CHAR", "CLOB", "JSON")):
            columns.append(name)
    return columns


def table_names(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).fetchall()
    return [str(row[0]) for row in rows]


def rewrite_sqlite_file(path: Path, replacements: list[Replacement], apply: bool, backup_dir: Path | None, root: Path) -> dict[str, Any]:
    if not path.exists():
        return {"path": str(path), "exists": False, "changed": 0, "written": False, "tables": []}

    if apply and backup_dir is not None:
        backup_file(path, backup_dir, root)
        for suffix in ("-wal", "-shm"):
            sidecar = Path(str(path) + suffix)
            if sidecar.exists():
                backup_file(sidecar, backup_dir, root)

    conn = sqlite3.connect(path)
    try:
        conn.row_factory = sqlite3.Row
        total_changed = 0
        table_summaries = []
        for table in table_names(conn):
            columns = text_columns(conn, table)
            if not columns:
                continue
            quoted_table = quote_identifier(table)
            quoted_columns = ", ".join(quote_identifier(column) for column in columns)
            try:
                rows = conn.execute(f"SELECT rowid AS __rowid__, {quoted_columns} FROM {quoted_table}").fetchall()
            except sqlite3.DatabaseError:
                continue

            table_changed = 0
            for row in rows:
                updates: dict[str, str] = {}
                for column in columns:
                    value = row[column]
                    if not isinstance(value, str):
                        continue
                    updated, changed = apply_replacements(value, replacements)
                    if changed:
                        updates[column] = updated
                        table_changed += changed
                if updates and apply:
                    assignments = ", ".join(f"{quote_identifier(column)} = ?" for column in updates)
                    conn.execute(
                        f"UPDATE {quoted_table} SET {assignments} WHERE rowid = ?",
                        [*updates.values(), row["__rowid__"]],
                    )
            if table_changed:
                table_summaries.append({"table": table, "changed": table_changed})
                total_changed += table_changed
        if apply and total_changed:
            conn.commit()
        else:
            conn.rollback()
        return {
            "path": str(path),
            "exists": True,
            "changed": total_changed,
            "written": bool(total_changed and apply),
            "tables": table_summaries,
        }
    finally:
        conn.close()


def default_backup_dir(data_dir: Path) -> Path:
    backups = data_dir / "backups"
    index = 1
    while True:
        candidate = backups / f"root-migration-{index:03d}"
        if not candidate.exists():
            return candidate
        index += 1


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    data_dir = Path(args.data_dir).resolve()
    map_path = Path(args.map).resolve()
    replacements, json_files, sqlite_file = load_mapping(map_path)

    selected_json_files = [*json_files, *args.json_file]
    selected_sqlite_file = args.sqlite_file if args.sqlite_file is not None else sqlite_file

    backup_dir: Path | None = None
    if args.apply:
        backup_dir = Path(args.backup_dir).resolve() if args.backup_dir else default_backup_dir(data_dir)
        backup_dir.mkdir(parents=True, exist_ok=True)

    summary: dict[str, Any] = {
        "mode": "apply" if args.apply else "dry-run",
        "dataDir": str(data_dir),
        "mapping": str(map_path),
        "backupDir": str(backup_dir) if backup_dir else None,
        "json": [],
        "sqlite": None,
    }

    for json_file in selected_json_files:
        path = resolve_under_data_dir(data_dir, json_file)
        summary["json"].append(rewrite_json_file(path, replacements, args.apply, backup_dir, data_dir))

    if selected_sqlite_file:
        sqlite_path = resolve_under_data_dir(data_dir, selected_sqlite_file)
        summary["sqlite"] = rewrite_sqlite_file(sqlite_path, replacements, args.apply, backup_dir, data_dir)

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
