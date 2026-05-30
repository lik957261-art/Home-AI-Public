"""Hermes Mobile product-layer proxy for official ``model_tools``.

The official runtime imports ``get_tool_definitions`` from the top-level
``model_tools`` module very early.  Gateway API-server workers can therefore
serve a stale registry where profile MCP servers are configured, but
``mcp_<server>_*`` functions are absent from the callable schema.  This proxy is
loaded before official-clean on ``PYTHONPATH`` and delegates to the official
module after adding one bounded recovery pass for configured MCP servers.
"""

from __future__ import annotations

import importlib.util
import logging
import os
from pathlib import Path
from typing import Any, Iterable

logger = logging.getLogger(__name__)

_OFFICIAL_MODULE_NAME = "_hermes_mobile_official_model_tools"


def _official_clean_root() -> Path:
    configured = os.getenv("HERMES_MOBILE_OFFICIAL_CLEAN_PATH", "").strip()
    if configured:
        return Path(configured)
    return Path("/opt/hermes-gateway-runtime/official-clean")


def _load_official_model_tools():
    official_path = _official_clean_root() / "model_tools.py"
    spec = importlib.util.spec_from_file_location(_OFFICIAL_MODULE_NAME, official_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load official model_tools from {official_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_official = _load_official_model_tools()


def _write_runtime_event_marker(event: str) -> None:
    try:
        log_path = os.getenv("HERMES_MOBILE_MCP_INVENTORY_LOG", "/tmp/hermes-mobile-mcp-inventory.log")
        if not log_path:
            return
        if os.path.exists(log_path) and os.path.getsize(log_path) > 131072:
            os.replace(log_path, f"{log_path}.1")
        profile = os.getenv("HERMES_PROFILE", "")
        with open(log_path, "a", encoding="utf-8") as handle:
            handle.write(f"profile={profile} event={event}\n")
    except Exception:
        logger.debug("Hermes Mobile failed to write model_tools proxy marker", exc_info=True)


_write_runtime_event_marker("model_tools_proxy_loaded")


def _tool_name(schema: Any) -> str:
    if not isinstance(schema, dict):
        return ""
    fn = schema.get("function")
    if isinstance(fn, dict) and isinstance(fn.get("name"), str):
        return fn["name"]
    name = schema.get("name")
    return name if isinstance(name, str) else ""


def _configured_mcp_servers() -> set[str]:
    try:
        from hermes_cli.config import load_config

        config = load_config()
    except Exception:
        return set()
    servers = config.get("mcp_servers") if isinstance(config, dict) else None
    if not isinstance(servers, dict):
        return set()
    result: set[str] = set()
    for name, server_config in servers.items():
        if not isinstance(server_config, dict):
            continue
        enabled = server_config.get("enabled", True)
        if isinstance(enabled, str):
            enabled = enabled.strip().lower() not in {"0", "false", "no", "off"}
        if enabled:
            result.add(str(name))
    return result


def _missing_configured_mcp_tools(
    enabled_toolsets: Iterable[str] | None,
    schemas: list[dict[str, Any]] | None,
) -> set[str]:
    configured = _configured_mcp_servers()
    if not configured:
        return set()
    enabled = {str(item) for item in enabled_toolsets} if enabled_toolsets is not None else configured
    expected = configured & enabled
    if not expected:
        return set()
    names = {_tool_name(schema) for schema in (schemas or [])}
    missing: set[str] = set()
    for server_name in expected:
        prefix = f"mcp_{server_name}_"
        if not any(name.startswith(prefix) for name in names):
            missing.add(server_name)
    return missing


def _discover_mcp_tools_once() -> bool:
    try:
        from tools.mcp_tool import discover_mcp_tools

        discover_mcp_tools()
        return True
    except Exception as exc:
        _write_runtime_event_marker(f"model_tools_proxy_mcp_discovery_failed={type(exc).__name__}")
        logger.warning("Hermes Mobile model_tools proxy MCP recovery failed: %s", exc)
        return False


def _mcp_count(schemas: list[dict[str, Any]] | None) -> int:
    return sum(1 for schema in (schemas or []) if _tool_name(schema).startswith("mcp_"))


def _prioritize_configured_mcp_tools(
    enabled_toolsets: Iterable[str] | None,
    schemas: list[dict[str, Any]] | None,
) -> list[dict[str, Any]] | None:
    if not isinstance(schemas, list) or not schemas:
        return schemas
    configured = _configured_mcp_servers()
    if not configured:
        return schemas
    enabled = {str(item) for item in enabled_toolsets} if enabled_toolsets is not None else configured
    expected = configured & enabled
    if not expected:
        return schemas

    def is_expected_mcp(schema: Any) -> bool:
        name = _tool_name(schema)
        return any(name.startswith(f"mcp_{server_name}_") for server_name in expected)

    prioritized = [schema for schema in schemas if is_expected_mcp(schema)]
    if not prioritized:
        return schemas
    rest = [schema for schema in schemas if not is_expected_mcp(schema)]
    if schemas[: len(prioritized)] == prioritized:
        return schemas
    _write_runtime_event_marker(
        "model_tools_proxy_prioritized_mcp="
        + ",".join(sorted(expected))
        + f",mcp_count={len(prioritized)}"
    )
    return prioritized + rest


def get_tool_definitions(
    enabled_toolsets=None,
    disabled_toolsets=None,
    quiet_mode=False,
):
    result = _official.get_tool_definitions(
        enabled_toolsets=enabled_toolsets,
        disabled_toolsets=disabled_toolsets,
        quiet_mode=quiet_mode,
    )
    _write_runtime_event_marker(
        "model_tools_proxy_get_defs_count={count},mcp_count={mcp_count},has_wardrobe={has_wardrobe}".format(
            count=len(result or []),
            mcp_count=_mcp_count(result),
            has_wardrobe=any(_tool_name(schema).startswith("mcp_wardrobe_") for schema in (result or [])),
        )
    )
    missing = _missing_configured_mcp_tools(enabled_toolsets, result)
    if not missing:
        return _prioritize_configured_mcp_tools(enabled_toolsets, result)

    _write_runtime_event_marker(
        "model_tools_proxy_missing_configured_mcp=" + ",".join(sorted(missing))
    )
    if _discover_mcp_tools_once():
        clear_cache = getattr(_official, "_clear_tool_defs_cache", None)
        if callable(clear_cache):
            try:
                clear_cache()
            except Exception:
                pass
        result = _official.get_tool_definitions(
            enabled_toolsets=enabled_toolsets,
            disabled_toolsets=disabled_toolsets,
            quiet_mode=quiet_mode,
        )
    _write_runtime_event_marker(
        "model_tools_proxy_after_mcp_recovery_count=" + str(_mcp_count(result))
    )
    return _prioritize_configured_mcp_tools(enabled_toolsets, result)


def __getattr__(name: str) -> Any:
    return getattr(_official, name)


def _clear_tool_defs_cache() -> None:
    clear_cache = getattr(_official, "_clear_tool_defs_cache", None)
    if callable(clear_cache):
        clear_cache()


def handle_function_call(function_name, function_args, task_id=None, user_task=None):
    _write_runtime_event_marker(f"model_tools_proxy_handle_function_call={function_name}")
    return _official.handle_function_call(function_name, function_args, task_id, user_task)


check_toolset_requirements = _official.check_toolset_requirements
get_toolset_for_tool = _official.get_toolset_for_tool
get_all_tool_names = _official.get_all_tool_names
get_available_toolsets = _official.get_available_toolsets
check_tool_availability = _official.check_tool_availability
coerce_tool_args = _official.coerce_tool_args
