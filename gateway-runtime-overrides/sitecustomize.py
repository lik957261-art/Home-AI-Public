"""Hermes Mobile runtime patches for official-clean Gateway workers.

This module is loaded by Python's site initialization when the local
runtime-overrides directory is placed before official-clean on PYTHONPATH.
Keep patches small, reversible, and product-layer only.
"""

from __future__ import annotations

import logging
import os
import sys
import threading
import importlib
import contextvars
import errno
import grp
import inspect
import json
import pwd
import shutil
import subprocess
import tempfile
from typing import Any, Iterable

logger = logging.getLogger(__name__)

_patch_lock = threading.Lock()
_patch_installed = False
_prompt_patch_installed = False
_prompt_import_hook_installed = False
_api_server_patch_installed = False
_api_server_import_hook_installed = False
_agent_run_patch_installed = False
_agent_run_import_hook_installed = False
_conversation_loop_patch_installed = False
_conversation_loop_import_hook_installed = False
_chat_completion_patch_installed = False
_chat_completion_import_hook_installed = False
_codex_transport_patch_installed = False
_codex_transport_import_hook_installed = False
_codex_runtime_patch_installed = False
_codex_runtime_import_hook_installed = False
_openai_responses_patch_installed = False
_openai_responses_import_hook_installed = False
_openai_base_client_patch_installed = False
_openai_base_client_import_hook_installed = False
_utils_atomic_replace_patch_installed = False
_utils_atomic_replace_import_hook_installed = False
_auth_atomic_replace_patch_installed = False
_auth_atomic_replace_import_hook_installed = False
_deferred_patch_attempts = 0
_mcp_discovery_lock = threading.Lock()
_mcp_discovery_attempted = False
_run_agent_tool_defs_patch_installed = False
_run_agent_handle_call_patch_installed = False
_request_enabled_toolsets_var: contextvars.ContextVar[list[str] | None] = contextvars.ContextVar(
    "hermes_mobile_request_enabled_toolsets",
    default=None,
)
_thread_local = threading.local()


def _has_patch_marker(target: Any, marker: str) -> bool:
    return bool(getattr(target, f"__hermes_mobile_{marker}_patched__", False))


def _mark_patched(target: Any, marker: str) -> Any:
    try:
        setattr(target, f"__hermes_mobile_{marker}_patched__", True)
    except Exception:
        pass
    return target


def _write_runtime_override_loaded_marker() -> None:
    try:
        log_path = os.getenv("HERMES_MOBILE_MCP_INVENTORY_LOG", "/tmp/hermes-mobile-mcp-inventory.log")
        if not log_path:
            return
        if os.path.exists(log_path) and os.path.getsize(log_path) > 131072:
            os.replace(log_path, f"{log_path}.1")
        profile = os.getenv("HERMES_PROFILE", "")
        with open(log_path, "a", encoding="utf-8") as handle:
            handle.write(f"profile={profile} sitecustomize_loaded=True\n")
    except Exception:
        logger.debug("Hermes Mobile failed to write runtime override loaded marker", exc_info=True)


def _write_runtime_patch_status_marker() -> None:
    try:
        log_path = os.getenv("HERMES_MOBILE_MCP_INVENTORY_LOG", "/tmp/hermes-mobile-mcp-inventory.log")
        if not log_path:
            return
        if os.path.exists(log_path) and os.path.getsize(log_path) > 131072:
            os.replace(log_path, f"{log_path}.1")
        profile = os.getenv("HERMES_PROFILE", "")
        with open(log_path, "a", encoding="utf-8") as handle:
            handle.write(
                "profile={profile} patch_status prompt={prompt} api_server={api_server} "
                "run_agent={run_agent} run_agent_tool_defs={run_agent_tool_defs} "
                "run_agent_handle_call={run_agent_handle_call} "
                "conversation_loop={conversation_loop} "
                "chat_completion={chat_completion} codex_transport={codex_transport} "
                "codex_runtime={codex_runtime} "
                "openai_responses={openai_responses} "
                "openai_base_client={openai_base_client} "
                "utils_atomic_replace={utils_atomic_replace} "
                "auth_atomic_replace={auth_atomic_replace} "
                "attempt={attempt}\n".format(
                    profile=profile,
                    prompt=_prompt_patch_installed,
                    api_server=_api_server_patch_installed,
                    run_agent=_agent_run_patch_installed,
                    run_agent_tool_defs=_run_agent_tool_defs_patch_installed,
                    run_agent_handle_call=_run_agent_handle_call_patch_installed,
                    conversation_loop=_conversation_loop_patch_installed,
                    chat_completion=_chat_completion_patch_installed,
                    codex_transport=_codex_transport_patch_installed,
                    codex_runtime=_codex_runtime_patch_installed,
                    openai_responses=_openai_responses_patch_installed,
                    openai_base_client=_openai_base_client_patch_installed,
                    utils_atomic_replace=_utils_atomic_replace_patch_installed,
                    auth_atomic_replace=_auth_atomic_replace_patch_installed,
                    attempt=_deferred_patch_attempts,
                )
            )
    except Exception:
        logger.debug("Hermes Mobile failed to write runtime patch status marker", exc_info=True)


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
        logger.debug("Hermes Mobile failed to write runtime event marker", exc_info=True)


def _safe_acl_user(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if any(ch not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-" for ch in text):
        return ""
    return text


def _unique_acl_users(values: Iterable[Any]) -> list[str]:
    users: list[str] = []
    seen: set[str] = set()
    for value in values:
        user = _safe_acl_user(value)
        if not user or user in seen:
            continue
        seen.add(user)
        users.append(user)
    return users


def _unique_strings(values: Iterable[Any]) -> list[str]:
    rows: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = str(value or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        rows.append(text)
    return rows


def _split_acl_user_env(value: str) -> list[str]:
    return [item.strip() for item in str(value or "").replace(";", ",").replace("\n", ",").split(",") if item.strip()]


def _mac_root_from_shared_auth_root(shared_root: str) -> str:
    root = os.getenv("HERMES_MOBILE_ROOT") or os.getenv("HERMES_WEB_ROOT") or ""
    if root:
        return root
    current = os.path.abspath(shared_root)
    for _ in range(4):
        current = os.path.dirname(current)
    return current


def _shared_codex_auth_manifest_paths(shared_root: str) -> list[str]:
    mac_root = _mac_root_from_shared_auth_root(shared_root)
    candidates = [
        os.getenv("HERMES_MOBILE_GATEWAY_POOL_MANIFEST"),
        os.getenv("HERMES_WEB_GATEWAY_POOL_MANIFEST"),
        os.getenv("HERMES_GATEWAY_POOL_MANIFEST_PATH"),
        os.path.join(mac_root, "data", "gateway-pool-manifest-mac.json") if mac_root else "",
    ]
    return [path for path in _unique_strings(candidates) if os.path.isabs(path)]


def _shared_codex_auth_acl_users(shared_root: str) -> list[str]:
    users: list[str] = []
    for name in ("HERMES_MOBILE_CODEX_SHARED_AUTH_USERS", "HERMES_MOBILE_OPENAI_CODEX_OS_USERS"):
        users.extend(_split_acl_user_env(os.getenv(name, "")))
    try:
        users.extend(grp.getgrnam("hermes-workers").gr_mem)
    except Exception:
        pass
    try:
        users.append(pwd.getpwuid(os.getuid()).pw_name)
    except Exception:
        pass
    for manifest_path in _shared_codex_auth_manifest_paths(shared_root):
        try:
            with open(manifest_path, encoding="utf-8-sig") as handle:
                manifest = json.load(handle)
        except Exception:
            continue
        for worker in manifest.get("workers") or []:
            if not isinstance(worker, dict):
                continue
            provider = str(worker.get("provider") or "openai-codex").strip()
            if provider != "openai-codex":
                continue
            users.append(worker.get("osUser") or worker.get("os_user") or "")
    return _unique_acl_users(users)


def _path_acl_contains(path: str, user: str, required_permissions: Iterable[str] = ()) -> bool:
    if sys.platform != "darwin":
        return True
    try:
        result = subprocess.run(
            ["/bin/ls", "-led", path],
            text=True,
            capture_output=True,
            timeout=2,
            check=False,
        )
    except Exception:
        return False
    required = [str(item or "").strip() for item in required_permissions if str(item or "").strip()]
    for line in (result.stdout or "").splitlines():
        if f"user:{user} " not in line and f"user:{user}\t" not in line:
            continue
        if all(permission in line for permission in required):
            return True
    return False


def _chmod_add_acl(path: str, acl: str, user: str, required_permissions: Iterable[str] = ()) -> None:
    if sys.platform != "darwin" or not path or not os.path.exists(path):
        return
    if _path_acl_contains(path, user, required_permissions):
        return
    try:
        subprocess.run(
            ["/bin/chmod", "+a", acl, path],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=2,
            check=False,
        )
    except Exception:
        pass


def _repair_shared_codex_auth_permissions(target: Any) -> None:
    try:
        target_str = str(target)
        real_path = os.path.realpath(target_str) if os.path.islink(target_str) else target_str
        basename = os.path.basename(real_path)
        shared_root = os.path.dirname(real_path)
        parent = os.path.basename(shared_root)
        if parent != "shared-auth" or basename not in {"auth.json", "auth.lock"}:
            return
        try:
            gid = grp.getgrnam("hermes-workers").gr_gid
            os.chown(shared_root, -1, gid)
            os.chown(real_path, -1, gid)
        except Exception:
            pass
        try:
            os.chmod(shared_root, 0o770)
        except Exception:
            pass
        try:
            os.chmod(real_path, 0o660)
        except Exception:
            pass
        users = _shared_codex_auth_acl_users(shared_root)
        for user in users:
            _chmod_add_acl(
                shared_root,
                f"user:{user} allow list,add_file,search,delete_child,readattr,writeattr,readextattr,writeextattr,readsecurity,file_inherit,directory_inherit",
                user,
                ("list", "add_file", "search", "file_inherit", "directory_inherit"),
            )
            for name in ("auth.json", "auth.lock"):
                file_path = os.path.join(shared_root, name)
                if not os.path.exists(file_path):
                    continue
                try:
                    gid = grp.getgrnam("hermes-workers").gr_gid
                    os.chown(file_path, -1, gid)
                except Exception:
                    pass
                try:
                    os.chmod(file_path, 0o660)
                except Exception:
                    pass
                _chmod_add_acl(
                    file_path,
                    f"user:{user} allow read,write,append,readattr,writeattr,readextattr,writeextattr,readsecurity",
                    user,
                    ("read", "write", "append"),
                )
        _write_runtime_event_marker("shared_codex_auth_permissions_repaired")
    except Exception:
        logger.debug("Hermes Mobile failed to repair shared Codex auth permissions", exc_info=True)


def _patch_utils_atomic_replace_module(utils_module: Any) -> bool:
    global _utils_atomic_replace_patch_installed
    original = getattr(utils_module, "atomic_replace", None)
    if not callable(original):
        return False
    if _has_patch_marker(original, "utils_atomic_replace_exdev"):
        _utils_atomic_replace_patch_installed = True
        return True

    def patched_atomic_replace(tmp_path, target):
        try:
            result = original(tmp_path, target)
            _repair_shared_codex_auth_permissions(target)
            return result
        except OSError as exc:
            if exc.errno != errno.EXDEV:
                raise

            target_str = str(target)
            real_path = os.path.realpath(target_str) if os.path.islink(target_str) else target_str
            real_dir = os.path.dirname(real_path) or "."
            os.makedirs(real_dir, exist_ok=True)
            fd, fallback_tmp = tempfile.mkstemp(
                dir=real_dir,
                prefix=f".{os.path.basename(real_path)}_",
                suffix=".tmp",
            )
            fd_to_close = fd
            try:
                try:
                    source_mode = os.stat(str(tmp_path)).st_mode & 0o777
                except OSError:
                    source_mode = None
                with os.fdopen(fd, "wb") as out_file, open(str(tmp_path), "rb") as in_file:
                    fd_to_close = None
                    shutil.copyfileobj(in_file, out_file)
                    out_file.flush()
                    os.fsync(out_file.fileno())
                if source_mode is not None:
                    try:
                        os.chmod(fallback_tmp, source_mode)
                    except OSError:
                        pass
                os.replace(fallback_tmp, real_path)
                _repair_shared_codex_auth_permissions(real_path)
                try:
                    os.unlink(str(tmp_path))
                except OSError:
                    pass
                _write_runtime_event_marker("utils_atomic_replace_exdev_fallback")
                return real_path
            except BaseException:
                if fd_to_close is not None:
                    try:
                        os.close(fd_to_close)
                    except OSError:
                        pass
                try:
                    os.unlink(fallback_tmp)
                except OSError:
                    pass
                raise

    setattr(
        utils_module,
        "atomic_replace",
        _mark_patched(patched_atomic_replace, "utils_atomic_replace_exdev"),
    )
    _utils_atomic_replace_patch_installed = True
    return True


def _install_utils_atomic_replace_import_hook() -> None:
    global _utils_atomic_replace_import_hook_installed
    if _utils_atomic_replace_import_hook_installed:
        return
    try:
        import importlib.abc
        import importlib.machinery
    except Exception:
        return

    class _UtilsAtomicReplacePatchLoader(importlib.abc.Loader):
        def __init__(self, original_loader):
            self._original_loader = original_loader

        def create_module(self, spec):
            create_module = getattr(self._original_loader, "create_module", None)
            if callable(create_module):
                return create_module(spec)
            return None

        def exec_module(self, module):
            self._original_loader.exec_module(module)
            _patch_utils_atomic_replace_module(module)

    class _UtilsAtomicReplacePatchFinder(importlib.abc.MetaPathFinder):
        def find_spec(self, fullname, path=None, target=None):
            if fullname != "utils":
                return None
            spec = importlib.machinery.PathFinder.find_spec(fullname, path)
            if spec is None or spec.loader is None:
                return spec
            spec.loader = _UtilsAtomicReplacePatchLoader(spec.loader)
            return spec

    sys.meta_path.insert(0, _UtilsAtomicReplacePatchFinder())
    _utils_atomic_replace_import_hook_installed = True


def _install_utils_atomic_replace_patch() -> None:
    with _patch_lock:
        if _utils_atomic_replace_patch_installed:
            return
        module = sys.modules.get("utils")
        if module is not None and _patch_utils_atomic_replace_module(module):
            return
        _install_utils_atomic_replace_import_hook()


def _patch_auth_atomic_replace_module(auth_module: Any) -> bool:
    global _auth_atomic_replace_patch_installed
    try:
        utils_module = importlib.import_module("utils")
        _patch_utils_atomic_replace_module(utils_module)
        replacement = getattr(utils_module, "atomic_replace", None)
    except Exception:
        return False
    if not callable(replacement):
        return False
    current = getattr(auth_module, "atomic_replace", None)
    auth_replace_patched = current is replacement or _has_patch_marker(current, "utils_atomic_replace_exdev")
    if not auth_replace_patched:
        setattr(auth_module, "atomic_replace", replacement)

    original_save = getattr(auth_module, "_save_auth_store", None)
    if callable(original_save) and not _has_patch_marker(original_save, "auth_save_shared_codex_permissions"):
        def patched_save_auth_store(*args, **kwargs):
            result = original_save(*args, **kwargs)
            _repair_shared_codex_auth_permissions(result)
            return result

        setattr(
            auth_module,
            "_save_auth_store",
            _mark_patched(patched_save_auth_store, "auth_save_shared_codex_permissions"),
        )

    current_save = getattr(auth_module, "_save_auth_store", None)
    if auth_replace_patched and _has_patch_marker(current_save, "auth_save_shared_codex_permissions"):
        _auth_atomic_replace_patch_installed = True
        return True
    _auth_atomic_replace_patch_installed = True
    return True


def _install_auth_atomic_replace_import_hook() -> None:
    global _auth_atomic_replace_import_hook_installed
    if _auth_atomic_replace_import_hook_installed:
        return
    try:
        import importlib.abc
        import importlib.machinery
    except Exception:
        return

    class _AuthAtomicReplacePatchLoader(importlib.abc.Loader):
        def __init__(self, original_loader):
            self._original_loader = original_loader

        def create_module(self, spec):
            create_module = getattr(self._original_loader, "create_module", None)
            if callable(create_module):
                return create_module(spec)
            return None

        def exec_module(self, module):
            self._original_loader.exec_module(module)
            _patch_auth_atomic_replace_module(module)

    class _AuthAtomicReplacePatchFinder(importlib.abc.MetaPathFinder):
        def find_spec(self, fullname, path=None, target=None):
            if fullname != "hermes_cli.auth":
                return None
            spec = importlib.machinery.PathFinder.find_spec(fullname, path)
            if spec is None or spec.loader is None:
                return spec
            spec.loader = _AuthAtomicReplacePatchLoader(spec.loader)
            return spec

    sys.meta_path.insert(0, _AuthAtomicReplacePatchFinder())
    _auth_atomic_replace_import_hook_installed = True


def _install_auth_atomic_replace_patch() -> None:
    with _patch_lock:
        if _auth_atomic_replace_patch_installed:
            return
        module = sys.modules.get("hermes_cli.auth")
        if module is not None and _patch_auth_atomic_replace_module(module):
            return
        _install_auth_atomic_replace_import_hook()


def _sanitize_toolset_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    result: list[str] = []
    seen: set[str] = set()
    for item in value:
        text = str(item or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result


def _session_id_from_create_agent_args(args: tuple[Any, ...], kwargs: dict[str, Any]) -> str:
    session_id = kwargs.get("session_id")
    if session_id is None and len(args) >= 2:
        session_id = args[1]
    return str(session_id or "").strip()


def _requested_enabled_toolsets_for_session(adapter: Any, session_id: str) -> list[str]:
    if not session_id:
        return []
    mapping = getattr(adapter, "_hermes_mobile_enabled_toolsets_by_session", None)
    if not isinstance(mapping, dict):
        return []
    return _sanitize_toolset_list(mapping.get(session_id))


def _intersect_requested_toolsets_with_profile(requested: list[str], profile_toolsets: Any) -> list[str]:
    requested = _sanitize_toolset_list(requested)
    if not requested:
        return []
    if profile_toolsets is None:
        return requested
    profile = {str(item or "").strip() for item in profile_toolsets if str(item or "").strip()}
    return [item for item in requested if item in profile]


def _tool_name(schema: Any) -> str:
    if not isinstance(schema, dict):
        return ""
    fn = schema.get("function")
    if not isinstance(fn, dict):
        return ""
    name = fn.get("name")
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
) -> bool:
    configured = _configured_mcp_servers()
    if not configured:
        return False
    enabled = {str(item) for item in enabled_toolsets} if enabled_toolsets is not None else configured
    expected = configured & enabled
    if not expected:
        return False
    names = {_tool_name(schema) for schema in (schemas or [])}
    for server_name in expected:
        prefix = f"mcp_{server_name}_"
        if not any(name.startswith(prefix) for name in names):
            return True
    return False


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
        "tool_definitions_prioritized_mcp="
        + ",".join(sorted(expected))
        + f",mcp_count={len(prioritized)}"
    )
    return prioritized + rest


def _ensure_mcp_discovered_once() -> None:
    global _mcp_discovery_attempted
    if _mcp_discovery_attempted:
        return
    with _mcp_discovery_lock:
        if _mcp_discovery_attempted:
            return
        try:
            from tools.mcp_tool import discover_mcp_tools

            discover_mcp_tools()
            _mcp_discovery_attempted = True
            _write_runtime_event_marker("mcp_discovery_recovery_succeeded")
        except Exception as exc:
            _write_runtime_event_marker(f"mcp_discovery_recovery_failed={type(exc).__name__}")
            logger.warning("Hermes Mobile MCP schema recovery failed: %s", exc)


def _patch_model_tools_module(model_tools: Any) -> bool:
    global _patch_installed
    original = getattr(model_tools, "get_tool_definitions", None)
    if not callable(original):
        return False
    if _has_patch_marker(original, "tool_definitions_mcp_recovery"):
        _patch_installed = True
        return True
    setattr(
        model_tools,
        "get_tool_definitions",
        _wrap_tool_definitions_function(original, model_tools),
    )
    _patch_installed = True
    return True


def _install_model_tools_patch() -> None:
    global _patch_installed
    with _patch_lock:
        if _patch_installed:
            return
        try:
            import model_tools
        except Exception as exc:
            logger.debug("Hermes Mobile model_tools patch skipped: %s", exc)
            return
        _patch_model_tools_module(model_tools)


def _wrap_tool_definitions_function(original: Any, cache_owner: Any = None):
    if not callable(original):
        return original
    if _has_patch_marker(original, "tool_definitions_mcp_recovery"):
        return original

    def patched_get_tool_definitions(
        enabled_toolsets=None,
        disabled_toolsets=None,
        quiet_mode=False,
    ):
        result = original(
            enabled_toolsets=enabled_toolsets,
            disabled_toolsets=disabled_toolsets,
            quiet_mode=quiet_mode,
        )
        if _missing_configured_mcp_tools(enabled_toolsets, result):
            _write_runtime_event_marker(
                "tool_definitions_missing_configured_mcp="
                + ",".join(sorted(_configured_mcp_servers()))
            )
            _ensure_mcp_discovered_once()
            clear_cache = getattr(cache_owner, "_clear_tool_defs_cache", None) if cache_owner is not None else None
            if callable(clear_cache):
                try:
                    clear_cache()
                except Exception:
                    pass
            result = original(
                enabled_toolsets=enabled_toolsets,
                disabled_toolsets=disabled_toolsets,
                quiet_mode=quiet_mode,
            )
            names = [_tool_name(schema) for schema in (result or [])]
            _write_runtime_event_marker(
                "tool_definitions_after_mcp_recovery_count="
                + str(sum(1 for name in names if str(name).startswith("mcp_")))
            )
        return _prioritize_configured_mcp_tools(enabled_toolsets, result)

    return _mark_patched(patched_get_tool_definitions, "tool_definitions_mcp_recovery")


def _patch_run_agent_tool_definitions(run_agent: Any) -> bool:
    global _run_agent_tool_defs_patch_installed
    original = getattr(run_agent, "get_tool_definitions", None)
    if not callable(original):
        return False
    if _has_patch_marker(original, "tool_definitions_mcp_recovery"):
        _run_agent_tool_defs_patch_installed = True
        return True
    cache_owner = sys.modules.get("model_tools")
    setattr(
        run_agent,
        "get_tool_definitions",
        _wrap_tool_definitions_function(original, cache_owner),
    )
    _run_agent_tool_defs_patch_installed = True
    return True


def _patch_run_agent_handle_function_call(run_agent: Any) -> bool:
    global _run_agent_handle_call_patch_installed
    original = getattr(run_agent, "handle_function_call", None)
    if not callable(original):
        return False
    if _has_patch_marker(original, "run_agent_handle_function_call"):
        _run_agent_handle_call_patch_installed = True
        return True

    def patched_handle_function_call(function_name, function_args, *args, **kwargs):
        _write_runtime_event_marker(f"run_agent_handle_function_call={function_name}")
        try:
            signature = inspect.signature(original)
            accepts_kwargs = any(
                parameter.kind == inspect.Parameter.VAR_KEYWORD
                for parameter in signature.parameters.values()
            )
            if not accepts_kwargs:
                kwargs = {
                    key: value
                    for key, value in kwargs.items()
                    if key in signature.parameters
                }
        except Exception:
            pass
        return original(function_name, function_args, *args, **kwargs)

    setattr(
        run_agent,
        "handle_function_call",
        _mark_patched(patched_handle_function_call, "run_agent_handle_function_call"),
    )
    _run_agent_handle_call_patch_installed = True
    return True


def _mcp_tool_inventory_prompt(agent: Any) -> str:
    names = (
        str(name)
        for name in getattr(agent, "valid_tool_names", set()) or set()
        if str(name).startswith("mcp_")
    )
    return _mcp_tool_inventory_prompt_from_names(names)


def _mcp_tool_inventory_prompt_from_names(names: Iterable[str]) -> str:
    names = sorted(str(name) for name in names if str(name).startswith("mcp_"))
    if not names:
        return ""

    groups: dict[str, list[str]] = {}
    for name in names[:80]:
        parts = name.split("_", 2)
        server = parts[1] if len(parts) >= 3 and parts[1] else "unknown"
        groups.setdefault(server, []).append(name)

    lines = [
        "# Mounted MCP callable tools",
        (
            "The current Gateway runtime has the following MCP function tools "
            "mounted in this run. Treat this list as authoritative for MCP "
            "availability. If a required MCP tool appears here, do not say the "
            "MCP is unavailable; call the exact function name through the "
            "function-tool interface."
        ),
    ]
    for server in sorted(groups):
        lines.append(f"- {server}: {', '.join(groups[server])}")
    return "\n".join(lines)


def _append_mcp_inventory_to_agent_ephemeral_prompt(agent: Any) -> None:
    inventory = _mcp_tool_inventory_prompt(agent)
    try:
        names = [
            str(name)
            for name in getattr(agent, "valid_tool_names", set()) or set()
            if str(name).startswith("mcp_")
        ]
        log_path = os.getenv("HERMES_MOBILE_MCP_INVENTORY_LOG", "/tmp/hermes-mobile-mcp-inventory.log")
        if log_path:
            if os.path.exists(log_path) and os.path.getsize(log_path) > 131072:
                os.replace(log_path, f"{log_path}.1")
            profile = os.getenv("HERMES_PROFILE", "")
            with open(log_path, "a", encoding="utf-8") as handle:
                handle.write(
                    "profile={profile} mcp_count={count} has_wardrobe={has_wardrobe} "
                    "has_inventory={has_inventory}\n".format(
                        profile=profile,
                        count=len(names),
                        has_wardrobe=any(name.startswith("mcp_wardrobe_") for name in names),
                        has_inventory=bool(inventory),
                    )
                )
    except Exception:
        logger.debug("Hermes Mobile failed to write MCP inventory diagnostic", exc_info=True)
    if not inventory:
        return
    current = getattr(agent, "ephemeral_system_prompt", None) or ""
    if inventory in current:
        return
    updated = f"{current}\n\n{inventory}" if current else inventory
    try:
        setattr(agent, "ephemeral_system_prompt", updated)
    except Exception:
        logger.debug("Hermes Mobile failed to attach MCP inventory prompt", exc_info=True)


def _recover_agent_mcp_tools_if_missing(agent: Any) -> bool:
    tools = getattr(agent, "tools", None)
    enabled_toolsets = getattr(agent, "enabled_toolsets", None)
    if not _missing_configured_mcp_tools(enabled_toolsets, tools):
        return False

    _write_runtime_event_marker("agent_tools_missing_configured_mcp_after_init")
    _ensure_mcp_discovered_once()

    try:
        import run_agent as _run_agent

        refreshed = _run_agent.get_tool_definitions(
            enabled_toolsets=enabled_toolsets,
            disabled_toolsets=getattr(agent, "disabled_toolsets", None),
            quiet_mode=getattr(agent, "quiet_mode", True),
        )
    except Exception as exc:
        _write_runtime_event_marker(f"agent_tools_mcp_recovery_failed={type(exc).__name__}")
        logger.warning("Hermes Mobile agent MCP schema recovery failed: %s", exc)
        return False

    names = {_tool_name(schema) for schema in (refreshed or [])}
    mcp_count = sum(1 for name in names if name.startswith("mcp_"))
    _write_runtime_event_marker(f"agent_tools_mcp_recovery_count={mcp_count}")
    if _missing_configured_mcp_tools(enabled_toolsets, refreshed):
        return False

    try:
        setattr(agent, "tools", refreshed)
        setattr(agent, "valid_tool_names", names)
    except Exception:
        logger.debug("Hermes Mobile failed to replace recovered agent tools", exc_info=True)
        return False
    return True


def _patch_system_prompt_module(system_prompt: Any) -> bool:
    global _prompt_patch_installed
    original = getattr(system_prompt, "build_system_prompt_parts", None)
    if not callable(original):
        return False
    if _has_patch_marker(original, "system_prompt"):
        _prompt_patch_installed = True
        return True

    def patched_build_system_prompt_parts(agent, system_message=None):
        parts = original(agent, system_message=system_message)
        inventory = _mcp_tool_inventory_prompt(agent)
        if inventory and isinstance(parts, dict):
            stable = parts.get("stable") or ""
            if inventory not in stable:
                parts = dict(parts)
                parts["stable"] = f"{stable}\n\n{inventory}" if stable else inventory
        return parts

    setattr(system_prompt, "build_system_prompt_parts", _mark_patched(patched_build_system_prompt_parts, "system_prompt"))
    _prompt_patch_installed = True
    return True


def _install_system_prompt_import_hook() -> None:
    global _prompt_import_hook_installed
    if _prompt_import_hook_installed:
        return
    try:
        import importlib.abc
        import importlib.machinery
    except Exception as exc:
        logger.debug("Hermes Mobile system_prompt import hook skipped: %s", exc)
        return

    class _SystemPromptPatchLoader(importlib.abc.Loader):
        def __init__(self, original_loader: Any):
            self._original_loader = original_loader

        def create_module(self, spec):
            create_module = getattr(self._original_loader, "create_module", None)
            if callable(create_module):
                return create_module(spec)
            return None

        def exec_module(self, module):
            self._original_loader.exec_module(module)
            _patch_system_prompt_module(module)

    class _SystemPromptPatchFinder(importlib.abc.MetaPathFinder):
        def find_spec(self, fullname, path=None, target=None):
            if fullname != "agent.system_prompt":
                return None
            spec = importlib.machinery.PathFinder.find_spec(fullname, path)
            if spec is None or spec.loader is None:
                return spec
            spec.loader = _SystemPromptPatchLoader(spec.loader)
            return spec

    sys.meta_path.insert(0, _SystemPromptPatchFinder())
    _prompt_import_hook_installed = True


def _install_system_prompt_patch() -> None:
    with _patch_lock:
        if _prompt_patch_installed:
            return
        module = sys.modules.get("agent.system_prompt")
        if module is not None and _patch_system_prompt_module(module):
            return
        _install_system_prompt_import_hook()


def _patch_api_server_module(api_server: Any) -> bool:
    global _api_server_patch_installed
    adapter = getattr(api_server, "APIServerAdapter", None)
    original = getattr(adapter, "_create_agent", None) if adapter is not None else None
    original_run_agent = getattr(adapter, "_run_agent", None) if adapter is not None else None
    original_handle_responses = getattr(adapter, "_handle_responses", None) if adapter is not None else None
    if not callable(original) or not callable(original_run_agent) or not callable(original_handle_responses):
        return False
    if (
        _has_patch_marker(original, "api_server_create_agent")
        and _has_patch_marker(original_run_agent, "api_server_run_agent")
        and _has_patch_marker(original_handle_responses, "api_server_handle_responses")
    ):
        _api_server_patch_installed = True
        return True

    def patched_create_agent(self, *args, **kwargs):
        _write_runtime_event_marker("api_server_create_agent")
        session_id = _session_id_from_create_agent_args(args, kwargs)
        requested_toolsets = _requested_enabled_toolsets_for_session(self, session_id)
        previous = getattr(_thread_local, "request_enabled_toolsets", None)
        if requested_toolsets:
            _thread_local.request_enabled_toolsets = requested_toolsets
            _write_runtime_event_marker(f"api_server_request_enabled_toolsets={','.join(requested_toolsets)}")
        try:
            agent = original(self, *args, **kwargs)
            _recover_agent_mcp_tools_if_missing(agent)
            _append_mcp_inventory_to_agent_ephemeral_prompt(agent)
            return agent
        finally:
            if previous is None:
                try:
                    delattr(_thread_local, "request_enabled_toolsets")
                except AttributeError:
                    pass
            else:
                _thread_local.request_enabled_toolsets = previous

    async def patched_run_agent(self, *args, **kwargs):
        _write_runtime_event_marker("api_server_run_agent")
        requested_toolsets = _sanitize_toolset_list(_request_enabled_toolsets_var.get())
        session_id = str(kwargs.get("session_id") or "").strip()
        if not session_id and len(args) >= 4:
            session_id = str(args[3] or "").strip()
        if requested_toolsets and session_id:
            mapping = getattr(self, "_hermes_mobile_enabled_toolsets_by_session", None)
            if not isinstance(mapping, dict):
                mapping = {}
                setattr(self, "_hermes_mobile_enabled_toolsets_by_session", mapping)
            mapping[session_id] = requested_toolsets
        try:
            return await original_run_agent(self, *args, **kwargs)
        finally:
            if requested_toolsets and session_id:
                try:
                    getattr(self, "_hermes_mobile_enabled_toolsets_by_session", {}).pop(session_id, None)
                except Exception:
                    pass

    async def patched_handle_responses(self, *args, **kwargs):
        _write_runtime_event_marker("api_server_handle_responses")
        request = args[0] if args else kwargs.get("request")
        requested_toolsets: list[str] = []
        if request is not None:
            try:
                body = await request.json()
                requested_toolsets = _sanitize_toolset_list(body.get("enabled_toolsets"))
            except Exception:
                requested_toolsets = []
        token = None
        if requested_toolsets:
            token = _request_enabled_toolsets_var.set(requested_toolsets)
        try:
            return await original_handle_responses(self, *args, **kwargs)
        finally:
            if token is not None:
                _request_enabled_toolsets_var.reset(token)

    setattr(adapter, "_create_agent", _mark_patched(patched_create_agent, "api_server_create_agent"))
    setattr(adapter, "_run_agent", _mark_patched(patched_run_agent, "api_server_run_agent"))
    setattr(adapter, "_handle_responses", _mark_patched(patched_handle_responses, "api_server_handle_responses"))
    _api_server_patch_installed = True
    return True


def _install_api_server_import_hook() -> None:
    global _api_server_import_hook_installed
    if _api_server_import_hook_installed:
        return
    try:
        import importlib.abc
        import importlib.machinery
    except Exception as exc:
        logger.debug("Hermes Mobile API server import hook skipped: %s", exc)
        return

    class _ApiServerPatchLoader(importlib.abc.Loader):
        def __init__(self, original_loader: Any):
            self._original_loader = original_loader

        def create_module(self, spec):
            create_module = getattr(self._original_loader, "create_module", None)
            if callable(create_module):
                return create_module(spec)
            return None

        def exec_module(self, module):
            self._original_loader.exec_module(module)
            _patch_api_server_module(module)

    class _ApiServerPatchFinder(importlib.abc.MetaPathFinder):
        def find_spec(self, fullname, path=None, target=None):
            if fullname != "gateway.platforms.api_server":
                return None
            spec = importlib.machinery.PathFinder.find_spec(fullname, path)
            if spec is None or spec.loader is None:
                return spec
            spec.loader = _ApiServerPatchLoader(spec.loader)
            return spec

    sys.meta_path.insert(0, _ApiServerPatchFinder())
    _api_server_import_hook_installed = True


def _install_api_server_patch() -> None:
    with _patch_lock:
        if _api_server_patch_installed:
            return
        module = sys.modules.get("gateway.platforms.api_server")
        if module is not None and _patch_api_server_module(module):
            return
        _install_api_server_import_hook()


def _patch_run_agent_module(run_agent: Any) -> bool:
    global _agent_run_patch_installed
    _patch_run_agent_tool_definitions(run_agent)
    _patch_run_agent_handle_function_call(run_agent)
    agent_class = getattr(run_agent, "AIAgent", None)
    original_init = getattr(agent_class, "__init__", None) if agent_class is not None else None
    original_run = getattr(agent_class, "run_conversation", None) if agent_class is not None else None
    original_build_api_kwargs = getattr(agent_class, "_build_api_kwargs", None) if agent_class is not None else None
    original_interruptible_api_call = getattr(agent_class, "_interruptible_api_call", None) if agent_class is not None else None
    original_run_codex_stream = getattr(agent_class, "_run_codex_stream", None) if agent_class is not None else None
    if not callable(original_init) or not callable(original_run):
        return False
    if (
        _has_patch_marker(original_init, "agent_init")
        and _has_patch_marker(original_run, "agent_run_conversation")
        and (
            not callable(original_build_api_kwargs)
            or _has_patch_marker(original_build_api_kwargs, "agent_build_api_kwargs")
        )
        and (
            not callable(original_interruptible_api_call)
            or _has_patch_marker(original_interruptible_api_call, "agent_interruptible_api_call")
        )
        and (
            not callable(original_run_codex_stream)
            or _has_patch_marker(original_run_codex_stream, "agent_run_codex_stream")
        )
    ):
        _agent_run_patch_installed = True
        return True

    def patched_agent_init(self, *args, **kwargs):
        requested_toolsets = _sanitize_toolset_list(getattr(_thread_local, "request_enabled_toolsets", None))
        if requested_toolsets:
            effective = _intersect_requested_toolsets_with_profile(
                requested_toolsets,
                kwargs.get("enabled_toolsets"),
            )
            if effective:
                kwargs = dict(kwargs)
                kwargs["enabled_toolsets"] = effective
                _write_runtime_event_marker(f"agent_enabled_toolsets_override={','.join(effective)}")
            else:
                _write_runtime_event_marker("agent_enabled_toolsets_override_empty")
        original_init(self, *args, **kwargs)
        _recover_agent_mcp_tools_if_missing(self)
        _append_mcp_inventory_to_agent_ephemeral_prompt(self)

    def patched_run_conversation(self, *args, **kwargs):
        _append_mcp_inventory_to_agent_ephemeral_prompt(self)
        return original_run(self, *args, **kwargs)

    def _log_api_kwargs_marker(prefix: str, api_kwargs: Any) -> None:
        if not isinstance(api_kwargs, dict):
            return
        tools = list(api_kwargs.get("tools") or [])
        names = [_tool_schema_name(schema) for schema in tools]
        _write_runtime_event_marker(
            "{prefix}_tool_count={count},mcp_count={mcp_count},has_wardrobe={has_wardrobe}".format(
                prefix=prefix,
                count=len(names),
                mcp_count=sum(1 for name in names if name.startswith("mcp_")),
                has_wardrobe=any(name.startswith("mcp_wardrobe_") for name in names),
            )
        )

    def _recover_api_kwargs_mcp_if_missing(self, api_kwargs: Any) -> Any:
        if not isinstance(api_kwargs, dict):
            return api_kwargs
        api_mode = str(getattr(self, "api_mode", "") or "")
        if api_mode == "codex_responses":
            return _merge_configured_mcp_tools_into_responses_kwargs(dict(api_kwargs))
        return _merge_configured_mcp_tools_into_chat_kwargs(dict(api_kwargs))

    def patched_build_api_kwargs(self, api_messages):
        api_kwargs = original_build_api_kwargs(self, api_messages)
        _log_api_kwargs_marker("agent_build_api_kwargs_before", api_kwargs)
        recovered = _recover_api_kwargs_mcp_if_missing(self, api_kwargs)
        _log_api_kwargs_marker("agent_build_api_kwargs_after", recovered)
        return recovered

    def patched_interruptible_api_call(self, api_kwargs):
        _log_api_kwargs_marker("agent_interruptible_api_call_before", api_kwargs)
        recovered = _recover_api_kwargs_mcp_if_missing(self, api_kwargs)
        _log_api_kwargs_marker("agent_interruptible_api_call_after", recovered)
        return original_interruptible_api_call(self, recovered)

    def patched_agent_run_codex_stream(self, api_kwargs, client=None, on_first_delta=None):
        _log_api_kwargs_marker("agent_run_codex_stream_before", api_kwargs)
        recovered = _recover_api_kwargs_mcp_if_missing(self, api_kwargs)
        _log_api_kwargs_marker("agent_run_codex_stream_after", recovered)
        return original_run_codex_stream(self, recovered, client=client, on_first_delta=on_first_delta)

    setattr(agent_class, "__init__", _mark_patched(patched_agent_init, "agent_init"))
    setattr(agent_class, "run_conversation", _mark_patched(patched_run_conversation, "agent_run_conversation"))
    if callable(original_build_api_kwargs):
        setattr(agent_class, "_build_api_kwargs", _mark_patched(patched_build_api_kwargs, "agent_build_api_kwargs"))
    if callable(original_interruptible_api_call):
        setattr(
            agent_class,
            "_interruptible_api_call",
            _mark_patched(patched_interruptible_api_call, "agent_interruptible_api_call"),
        )
    if callable(original_run_codex_stream):
        setattr(agent_class, "_run_codex_stream", _mark_patched(patched_agent_run_codex_stream, "agent_run_codex_stream"))
    _agent_run_patch_installed = True
    return True


def _install_run_agent_import_hook() -> None:
    global _agent_run_import_hook_installed
    if _agent_run_import_hook_installed:
        return
    try:
        import importlib.abc
        import importlib.machinery
    except Exception as exc:
        logger.debug("Hermes Mobile run_agent import hook skipped: %s", exc)
        return

    class _RunAgentPatchLoader(importlib.abc.Loader):
        def __init__(self, original_loader: Any):
            self._original_loader = original_loader

        def create_module(self, spec):
            create_module = getattr(self._original_loader, "create_module", None)
            if callable(create_module):
                return create_module(spec)
            return None

        def exec_module(self, module):
            self._original_loader.exec_module(module)
            _patch_run_agent_module(module)

    class _RunAgentPatchFinder(importlib.abc.MetaPathFinder):
        def find_spec(self, fullname, path=None, target=None):
            if fullname != "run_agent":
                return None
            spec = importlib.machinery.PathFinder.find_spec(fullname, path)
            if spec is None or spec.loader is None:
                return spec
            spec.loader = _RunAgentPatchLoader(spec.loader)
            return spec

    sys.meta_path.insert(0, _RunAgentPatchFinder())
    _agent_run_import_hook_installed = True


def _install_run_agent_patch() -> None:
    with _patch_lock:
        if _agent_run_patch_installed:
            return
        module = sys.modules.get("run_agent")
        if module is not None and _patch_run_agent_module(module):
            return
        _install_run_agent_import_hook()


def _patch_conversation_loop_module(conversation_loop: Any) -> bool:
    global _conversation_loop_patch_installed
    original = getattr(conversation_loop, "run_conversation", None)
    if not callable(original):
        return False
    if _has_patch_marker(original, "conversation_loop"):
        _conversation_loop_patch_installed = True
        return True

    def patched_conversation_loop(agent, *args, **kwargs):
        _append_mcp_inventory_to_agent_ephemeral_prompt(agent)
        return original(agent, *args, **kwargs)

    setattr(conversation_loop, "run_conversation", _mark_patched(patched_conversation_loop, "conversation_loop"))
    _conversation_loop_patch_installed = True
    return True


def _install_conversation_loop_import_hook() -> None:
    global _conversation_loop_import_hook_installed
    if _conversation_loop_import_hook_installed:
        return
    try:
        import importlib.abc
        import importlib.machinery
    except Exception as exc:
        logger.debug("Hermes Mobile conversation_loop import hook skipped: %s", exc)
        return

    class _ConversationLoopPatchLoader(importlib.abc.Loader):
        def __init__(self, original_loader: Any):
            self._original_loader = original_loader

        def create_module(self, spec):
            create_module = getattr(self._original_loader, "create_module", None)
            if callable(create_module):
                return create_module(spec)
            return None

        def exec_module(self, module):
            self._original_loader.exec_module(module)
            _patch_conversation_loop_module(module)

    class _ConversationLoopPatchFinder(importlib.abc.MetaPathFinder):
        def find_spec(self, fullname, path=None, target=None):
            if fullname != "agent.conversation_loop":
                return None
            spec = importlib.machinery.PathFinder.find_spec(fullname, path)
            if spec is None or spec.loader is None:
                return spec
            spec.loader = _ConversationLoopPatchLoader(spec.loader)
            return spec

    sys.meta_path.insert(0, _ConversationLoopPatchFinder())
    _conversation_loop_import_hook_installed = True


def _install_conversation_loop_patch() -> None:
    with _patch_lock:
        if _conversation_loop_patch_installed:
            return
        module = sys.modules.get("agent.conversation_loop")
        if module is not None and _patch_conversation_loop_module(module):
            return
        _install_conversation_loop_import_hook()


def _patch_chat_completion_helpers_module(chat_completion_helpers: Any) -> bool:
    global _chat_completion_patch_installed
    original = getattr(chat_completion_helpers, "build_api_kwargs", None)
    if not callable(original):
        return False
    if _has_patch_marker(original, "chat_completion_helpers"):
        _chat_completion_patch_installed = True
        return True

    def patched_build_api_kwargs(agent, api_messages):
        inventory = _mcp_tool_inventory_prompt(agent)
        if inventory:
            _append_mcp_inventory_to_agent_ephemeral_prompt(agent)
            if isinstance(api_messages, list):
                if api_messages and isinstance(api_messages[0], dict) and api_messages[0].get("role") == "system":
                    content = str(api_messages[0].get("content") or "")
                    if inventory not in content:
                        api_messages[0] = {
                            **api_messages[0],
                            "content": f"{content}\n\n{inventory}" if content else inventory,
                        }
                else:
                    api_messages = [{"role": "system", "content": inventory}] + list(api_messages)
        return original(agent, api_messages)

    setattr(chat_completion_helpers, "build_api_kwargs", _mark_patched(patched_build_api_kwargs, "chat_completion_helpers"))
    _chat_completion_patch_installed = True
    return True


def _install_chat_completion_import_hook() -> None:
    global _chat_completion_import_hook_installed
    if _chat_completion_import_hook_installed:
        return
    try:
        import importlib.abc
        import importlib.machinery
    except Exception as exc:
        logger.debug("Hermes Mobile chat_completion_helpers import hook skipped: %s", exc)
        return

    class _ChatCompletionPatchLoader(importlib.abc.Loader):
        def __init__(self, original_loader: Any):
            self._original_loader = original_loader

        def create_module(self, spec):
            create_module = getattr(self._original_loader, "create_module", None)
            if callable(create_module):
                return create_module(spec)
            return None

        def exec_module(self, module):
            self._original_loader.exec_module(module)
            _patch_chat_completion_helpers_module(module)

    class _ChatCompletionPatchFinder(importlib.abc.MetaPathFinder):
        def find_spec(self, fullname, path=None, target=None):
            if fullname != "agent.chat_completion_helpers":
                return None
            spec = importlib.machinery.PathFinder.find_spec(fullname, path)
            if spec is None or spec.loader is None:
                return spec
            spec.loader = _ChatCompletionPatchLoader(spec.loader)
            return spec

    sys.meta_path.insert(0, _ChatCompletionPatchFinder())
    _chat_completion_import_hook_installed = True


def _install_chat_completion_patch() -> None:
    with _patch_lock:
        if _chat_completion_patch_installed:
            return
        module = sys.modules.get("agent.chat_completion_helpers")
        if module is not None and _patch_chat_completion_helpers_module(module):
            return
        _install_chat_completion_import_hook()


def _tool_schema_name(schema: Any) -> str:
    if not isinstance(schema, dict):
        return ""
    fn = schema.get("function")
    if isinstance(fn, dict) and isinstance(fn.get("name"), str):
        return fn.get("name", "")
    name = schema.get("name")
    return name if isinstance(name, str) else ""


def _write_transport_inventory_marker(names: Iterable[str]) -> None:
    try:
        all_names = [str(name) for name in names if str(name)]
        names = [name for name in all_names if name.startswith("mcp_")]
        log_path = os.getenv("HERMES_MOBILE_MCP_INVENTORY_LOG", "/tmp/hermes-mobile-mcp-inventory.log")
        if not log_path:
            return
        if os.path.exists(log_path) and os.path.getsize(log_path) > 131072:
            os.replace(log_path, f"{log_path}.1")
        profile = os.getenv("HERMES_PROFILE", "")
        with open(log_path, "a", encoding="utf-8") as handle:
            handle.write(
                "profile={profile} transport_tool_count={tool_count} "
                "transport_mcp_count={count} has_wardrobe={has_wardrobe}\n".format(
                    profile=profile,
                    tool_count=len(all_names),
                    count=len(names),
                    has_wardrobe=any(name.startswith("mcp_wardrobe_") for name in names),
                )
            )
    except Exception:
        logger.debug("Hermes Mobile failed to write transport MCP inventory marker", exc_info=True)


def _messages_with_mcp_inventory(messages: Any, inventory: str) -> Any:
    if not inventory or not isinstance(messages, list):
        return messages
    updated = list(messages)
    if updated and isinstance(updated[0], dict) and updated[0].get("role") == "system":
        content = str(updated[0].get("content") or "")
        if inventory not in content:
            updated[0] = {
                **updated[0],
                "content": f"{content}\n\n{inventory}" if content else inventory,
            }
    else:
        updated.insert(0, {"role": "system", "content": inventory})
    return updated


def _instructions_with_mcp_inventory(instructions: Any, inventory: str) -> str:
    current = str(instructions or "")
    if not inventory or inventory in current:
        return current
    return f"{current}\n\n{inventory}" if current.strip() else inventory


def _patch_codex_transport_module(codex_transport: Any) -> bool:
    global _codex_transport_patch_installed
    transport_class = getattr(codex_transport, "ResponsesApiTransport", None)
    original = getattr(transport_class, "build_kwargs", None) if transport_class is not None else None
    if not callable(original):
        return False
    if _has_patch_marker(original, "codex_transport"):
        _codex_transport_patch_installed = True
        return True

    def patched_transport_build_kwargs(self, model, messages, tools=None, **params):
        names = [_tool_schema_name(schema) for schema in (tools or [])]
        _write_transport_inventory_marker(names)
        inventory = _mcp_tool_inventory_prompt_from_names(names)
        if inventory:
            instructions = params.get("instructions")
            if isinstance(instructions, str) and instructions.strip():
                params = dict(params)
                params["instructions"] = _instructions_with_mcp_inventory(instructions, inventory)
            else:
                messages = _messages_with_mcp_inventory(messages, inventory)
        return original(self, model, messages, tools=tools, **params)

    setattr(transport_class, "build_kwargs", _mark_patched(patched_transport_build_kwargs, "codex_transport"))
    _codex_transport_patch_installed = True
    return True


def _install_codex_transport_import_hook() -> None:
    global _codex_transport_import_hook_installed
    if _codex_transport_import_hook_installed:
        return
    try:
        import importlib.abc
        import importlib.machinery
    except Exception as exc:
        logger.debug("Hermes Mobile codex transport import hook skipped: %s", exc)
        return

    class _CodexTransportPatchLoader(importlib.abc.Loader):
        def __init__(self, original_loader: Any):
            self._original_loader = original_loader

        def create_module(self, spec):
            create_module = getattr(self._original_loader, "create_module", None)
            if callable(create_module):
                return create_module(spec)
            return None

        def exec_module(self, module):
            self._original_loader.exec_module(module)
            _patch_codex_transport_module(module)

    class _CodexTransportPatchFinder(importlib.abc.MetaPathFinder):
        def find_spec(self, fullname, path=None, target=None):
            if fullname != "agent.transports.codex":
                return None
            spec = importlib.machinery.PathFinder.find_spec(fullname, path)
            if spec is None or spec.loader is None:
                return spec
            spec.loader = _CodexTransportPatchLoader(spec.loader)
            return spec

    sys.meta_path.insert(0, _CodexTransportPatchFinder())
    _codex_transport_import_hook_installed = True


def _install_codex_transport_patch() -> None:
    with _patch_lock:
        if _codex_transport_patch_installed:
            return
        module = sys.modules.get("agent.transports.codex")
        if module is not None and _patch_codex_transport_module(module):
            return
        _install_codex_transport_import_hook()


def _patch_codex_runtime_module(codex_runtime: Any) -> bool:
    global _codex_runtime_patch_installed
    original = getattr(codex_runtime, "run_codex_stream", None)
    if not callable(original):
        return False
    if _has_patch_marker(original, "codex_runtime"):
        _codex_runtime_patch_installed = True
        return True

    def patched_run_codex_stream(agent, api_kwargs: dict, *args, **kwargs):
        if isinstance(api_kwargs, dict):
            before_tools = api_kwargs.get("tools") or []
            before_names = [_tool_schema_name(schema) for schema in before_tools]
            _write_runtime_event_marker(
                "codex_runtime_before_tool_count={count},mcp_count={mcp_count},has_wardrobe={has_wardrobe}".format(
                    count=len(before_names),
                    mcp_count=sum(1 for name in before_names if name.startswith("mcp_")),
                    has_wardrobe=any(name.startswith("mcp_wardrobe_") for name in before_names),
                )
            )
            api_kwargs = _merge_configured_mcp_tools_into_responses_kwargs(dict(api_kwargs))
            after_tools = api_kwargs.get("tools") or []
            after_names = [_tool_schema_name(schema) for schema in after_tools]
            _write_runtime_event_marker(
                "codex_runtime_after_tool_count={count},mcp_count={mcp_count},has_wardrobe={has_wardrobe}".format(
                    count=len(after_names),
                    mcp_count=sum(1 for name in after_names if name.startswith("mcp_")),
                    has_wardrobe=any(name.startswith("mcp_wardrobe_") for name in after_names),
                )
            )
        return original(agent, api_kwargs, *args, **kwargs)

    setattr(codex_runtime, "run_codex_stream", _mark_patched(patched_run_codex_stream, "codex_runtime"))
    _codex_runtime_patch_installed = True
    return True


def _install_codex_runtime_import_hook() -> None:
    global _codex_runtime_import_hook_installed
    if _codex_runtime_import_hook_installed:
        return
    try:
        import importlib.abc
        import importlib.machinery
    except Exception as exc:
        logger.debug("Hermes Mobile codex runtime import hook skipped: %s", exc)
        return

    class _CodexRuntimePatchLoader(importlib.abc.Loader):
        def __init__(self, original_loader: Any):
            self._original_loader = original_loader

        def create_module(self, spec):
            create_module = getattr(self._original_loader, "create_module", None)
            if callable(create_module):
                return create_module(spec)
            return None

        def exec_module(self, module):
            self._original_loader.exec_module(module)
            _patch_codex_runtime_module(module)

    class _CodexRuntimePatchFinder(importlib.abc.MetaPathFinder):
        def find_spec(self, fullname, path=None, target=None):
            if fullname != "agent.codex_runtime":
                return None
            spec = importlib.machinery.PathFinder.find_spec(fullname, path)
            if spec is None or spec.loader is None:
                return spec
            spec.loader = _CodexRuntimePatchLoader(spec.loader)
            return spec

    sys.meta_path.insert(0, _CodexRuntimePatchFinder())
    _codex_runtime_import_hook_installed = True


def _install_codex_runtime_patch() -> None:
    with _patch_lock:
        if _codex_runtime_patch_installed:
            return
        module = sys.modules.get("agent.codex_runtime")
        if module is not None and _patch_codex_runtime_module(module):
            return
        _install_codex_runtime_import_hook()


def _merge_configured_mcp_tools_into_responses_kwargs(kwargs: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(kwargs, dict):
        return kwargs
    configured = _configured_mcp_servers()
    if not configured:
        return kwargs
    existing_tools = list(kwargs.get("tools") or [])
    existing_names = {_tool_schema_name(schema) for schema in existing_tools}
    missing = {
        server_name
        for server_name in configured
        if not any(name.startswith(f"mcp_{server_name}_") for name in existing_names)
    }
    _write_runtime_event_marker(
        "openai_responses_tools_before_count={count},mcp_count={mcp_count},missing_mcp={missing}".format(
            count=len(existing_tools),
            mcp_count=sum(1 for name in existing_names if name.startswith("mcp_")),
            missing=",".join(sorted(missing)) if missing else "",
        )
    )
    if not missing:
        return kwargs

    _ensure_mcp_discovered_once()
    try:
        import model_tools
        from agent.codex_responses_adapter import _responses_tools

        definitions = model_tools.get_tool_definitions(quiet_mode=True)
        mcp_definitions = [
            definition
            for definition in (definitions or [])
            if any(_tool_name(definition).startswith(f"mcp_{server_name}_") for server_name in missing)
        ]
        additions = _responses_tools(mcp_definitions)
    except Exception as exc:
        _write_runtime_event_marker(f"openai_responses_mcp_merge_failed={type(exc).__name__}")
        logger.warning("Hermes Mobile failed to merge configured MCP response tools: %s", exc)
        return kwargs

    existing_names = {_tool_schema_name(schema) for schema in existing_tools}
    new_tools = []
    added = 0
    for tool in additions or []:
        name = _tool_schema_name(tool)
        if not name or name in existing_names:
            continue
        new_tools.append(tool)
        existing_names.add(name)
        added += 1
    if not added:
        _write_runtime_event_marker("openai_responses_mcp_merge_added=0")
        return kwargs

    updated = dict(kwargs)
    updated["tools"] = new_tools + list(existing_tools)
    if new_tools:
        updated.setdefault("tool_choice", "auto")
        updated.setdefault("parallel_tool_calls", True)
    _write_runtime_event_marker(
        "openai_responses_mcp_merge_added={added},after_count={count},after_mcp_count={mcp_count}".format(
            added=added,
            count=len(updated["tools"]),
            mcp_count=sum(1 for name in existing_names if name.startswith("mcp_")),
        )
    )
    return updated


def _patch_openai_responses_module(responses_module: Any) -> bool:
    global _openai_responses_patch_installed
    patched_any = False
    for class_name in ("Responses", "AsyncResponses"):
        responses_class = getattr(responses_module, class_name, None)
        original = getattr(responses_class, "create", None) if responses_class is not None else None
        if not callable(original):
            continue
        marker = f"openai_responses_create_{class_name}"
        if _has_patch_marker(original, marker):
            patched_any = True
            continue

        if class_name == "AsyncResponses":
            async def patched_async_create(self, *args, __original=original, **kwargs):
                kwargs = _merge_configured_mcp_tools_into_responses_kwargs(kwargs)
                return await __original(self, *args, **kwargs)

            setattr(responses_class, "create", _mark_patched(patched_async_create, marker))
        else:
            def patched_create(self, *args, __original=original, **kwargs):
                kwargs = _merge_configured_mcp_tools_into_responses_kwargs(kwargs)
                return __original(self, *args, **kwargs)

            setattr(responses_class, "create", _mark_patched(patched_create, marker))
        patched_any = True
    if patched_any:
        _openai_responses_patch_installed = True
    return patched_any


def _install_openai_responses_import_hook() -> None:
    global _openai_responses_import_hook_installed
    if _openai_responses_import_hook_installed:
        return
    try:
        import importlib.abc
        import importlib.machinery
    except Exception as exc:
        logger.debug("Hermes Mobile OpenAI responses import hook skipped: %s", exc)
        return

    class _OpenAIResponsesPatchLoader(importlib.abc.Loader):
        def __init__(self, original_loader: Any):
            self._original_loader = original_loader

        def create_module(self, spec):
            create_module = getattr(self._original_loader, "create_module", None)
            if callable(create_module):
                return create_module(spec)
            return None

        def exec_module(self, module):
            self._original_loader.exec_module(module)
            _patch_openai_responses_module(module)

    class _OpenAIResponsesPatchFinder(importlib.abc.MetaPathFinder):
        def find_spec(self, fullname, path=None, target=None):
            if fullname != "openai.resources.responses.responses":
                return None
            spec = importlib.machinery.PathFinder.find_spec(fullname, path)
            if spec is None or spec.loader is None:
                return spec
            spec.loader = _OpenAIResponsesPatchLoader(spec.loader)
            return spec

    sys.meta_path.insert(0, _OpenAIResponsesPatchFinder())
    _openai_responses_import_hook_installed = True


def _install_openai_responses_patch() -> None:
    with _patch_lock:
        if _openai_responses_patch_installed:
            return
        module = sys.modules.get("openai.resources.responses.responses")
        if module is not None and _patch_openai_responses_module(module):
            return
        _install_openai_responses_import_hook()


def _request_options_json_data(options: Any) -> Any:
    return getattr(options, "json_data", None)


def _request_options_url(options: Any) -> str:
    value = getattr(options, "url", "")
    text = str(value or "")
    return text.split("?", 1)[0][:160]


def _copy_request_options_with_json_data(options: Any, json_data: Any) -> Any:
    try:
        if hasattr(options, "model_copy"):
            return options.model_copy(update={"json_data": json_data})
        if hasattr(options, "copy"):
            return options.copy(update={"json_data": json_data})
    except Exception:
        pass
    try:
        setattr(options, "json_data", json_data)
    except Exception:
        pass
    return options


def _merge_configured_mcp_tools_into_chat_kwargs(kwargs: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(kwargs, dict):
        return kwargs
    configured = _configured_mcp_servers()
    if not configured:
        return kwargs
    existing_tools = list(kwargs.get("tools") or [])
    existing_names = {_tool_schema_name(schema) for schema in existing_tools}
    missing = {
        server_name
        for server_name in configured
        if not any(name.startswith(f"mcp_{server_name}_") for name in existing_names)
    }
    _write_runtime_event_marker(
        "openai_chat_tools_before_count={count},mcp_count={mcp_count},missing_mcp={missing}".format(
            count=len(existing_tools),
            mcp_count=sum(1 for name in existing_names if name.startswith("mcp_")),
            missing=",".join(sorted(missing)) if missing else "",
        )
    )
    if not missing:
        return kwargs

    _ensure_mcp_discovered_once()
    try:
        import model_tools

        definitions = model_tools.get_tool_definitions(quiet_mode=True)
        additions = [
            definition
            for definition in (definitions or [])
            if any(_tool_name(definition).startswith(f"mcp_{server_name}_") for server_name in missing)
        ]
    except Exception as exc:
        _write_runtime_event_marker(f"openai_chat_mcp_merge_failed={type(exc).__name__}")
        logger.warning("Hermes Mobile failed to merge configured MCP chat tools: %s", exc)
        return kwargs

    new_tools = []
    added = 0
    for tool in additions or []:
        name = _tool_schema_name(tool)
        if not name or name in existing_names:
            continue
        new_tools.append(tool)
        existing_names.add(name)
        added += 1
    if not added:
        _write_runtime_event_marker("openai_chat_mcp_merge_added=0")
        return kwargs

    updated = dict(kwargs)
    updated["tools"] = new_tools + list(existing_tools)
    if new_tools:
        updated.setdefault("tool_choice", "auto")
    _write_runtime_event_marker(
        "openai_chat_mcp_merge_added={added},after_count={count},after_mcp_count={mcp_count}".format(
            added=added,
            count=len(updated["tools"]),
            mcp_count=sum(1 for name in existing_names if name.startswith("mcp_")),
        )
    )
    return updated


def _instrument_openai_request_options(options: Any, stream: bool = False) -> Any:
    json_data = _request_options_json_data(options)
    if not isinstance(json_data, dict):
        return options
    url = _request_options_url(options)
    tools = list(json_data.get("tools") or [])
    names = [_tool_schema_name(schema) for schema in tools]
    _write_runtime_event_marker(
        "openai_base_request url={url},stream={stream},tool_count={count},mcp_count={mcp_count},has_wardrobe={has_wardrobe}".format(
            url=url,
            stream=bool(stream),
            count=len(names),
            mcp_count=sum(1 for name in names if name.startswith("mcp_")),
            has_wardrobe=any(name.startswith("mcp_wardrobe_") for name in names),
        )
    )

    lowered = url.lower()
    updated_json = json_data
    if "/responses" in lowered:
        updated_json = _merge_configured_mcp_tools_into_responses_kwargs(dict(json_data))
    elif "/chat/completions" in lowered:
        updated_json = _merge_configured_mcp_tools_into_chat_kwargs(dict(json_data))
    if updated_json is not json_data:
        updated_tools = list(updated_json.get("tools") or [])
        updated_names = [_tool_schema_name(schema) for schema in updated_tools]
        _write_runtime_event_marker(
            "openai_base_request_after tool_count={count},mcp_count={mcp_count},has_wardrobe={has_wardrobe}".format(
                count=len(updated_names),
                mcp_count=sum(1 for name in updated_names if name.startswith("mcp_")),
                has_wardrobe=any(name.startswith("mcp_wardrobe_") for name in updated_names),
            )
        )
        return _copy_request_options_with_json_data(options, updated_json)
    return options


def _patch_openai_base_client_module(base_client_module: Any) -> bool:
    global _openai_base_client_patch_installed
    patched_any = False
    for class_name in ("SyncAPIClient", "AsyncAPIClient"):
        client_class = getattr(base_client_module, class_name, None)
        original = getattr(client_class, "request", None) if client_class is not None else None
        if not callable(original):
            continue
        marker = f"openai_base_client_request_{class_name}"
        if _has_patch_marker(original, marker):
            patched_any = True
            continue
        if class_name == "AsyncAPIClient":
            async def patched_async_request(self, cast_to, options, *args, __original=original, **kwargs):
                options = _instrument_openai_request_options(options, stream=bool(kwargs.get("stream", False)))
                return await __original(self, cast_to, options, *args, **kwargs)

            setattr(client_class, "request", _mark_patched(patched_async_request, marker))
        else:
            def patched_request(self, cast_to, options, *args, __original=original, **kwargs):
                options = _instrument_openai_request_options(options, stream=bool(kwargs.get("stream", False)))
                return __original(self, cast_to, options, *args, **kwargs)

            setattr(client_class, "request", _mark_patched(patched_request, marker))
        patched_any = True
    if patched_any:
        _openai_base_client_patch_installed = True
    return patched_any


def _install_openai_base_client_import_hook() -> None:
    global _openai_base_client_import_hook_installed
    if _openai_base_client_import_hook_installed:
        return
    try:
        import importlib.abc
        import importlib.machinery
    except Exception as exc:
        logger.debug("Hermes Mobile OpenAI base-client import hook skipped: %s", exc)
        return

    class _OpenAIBaseClientPatchLoader(importlib.abc.Loader):
        def __init__(self, original_loader: Any):
            self._original_loader = original_loader

        def create_module(self, spec):
            create_module = getattr(self._original_loader, "create_module", None)
            if callable(create_module):
                return create_module(spec)
            return None

        def exec_module(self, module):
            self._original_loader.exec_module(module)
            _patch_openai_base_client_module(module)

    class _OpenAIBaseClientPatchFinder(importlib.abc.MetaPathFinder):
        def find_spec(self, fullname, path=None, target=None):
            if fullname != "openai._base_client":
                return None
            spec = importlib.machinery.PathFinder.find_spec(fullname, path)
            if spec is None or spec.loader is None:
                return spec
            spec.loader = _OpenAIBaseClientPatchLoader(spec.loader)
            return spec

    sys.meta_path.insert(0, _OpenAIBaseClientPatchFinder())
    _openai_base_client_import_hook_installed = True


def _install_openai_base_client_patch() -> None:
    with _patch_lock:
        if _openai_base_client_patch_installed:
            return
        module = sys.modules.get("openai._base_client")
        if module is not None and _patch_openai_base_client_module(module):
            return
        _install_openai_base_client_import_hook()


def _deferred_patch_attempt() -> None:
    global _deferred_patch_attempts
    _deferred_patch_attempts += 1
    try:
        model_tools = sys.modules.get("model_tools")
        if model_tools is not None:
            _patch_model_tools_module(model_tools)
        system_prompt = sys.modules.get("agent.system_prompt")
        if system_prompt is not None:
            _patch_system_prompt_module(system_prompt)
        api_server = sys.modules.get("gateway.platforms.api_server")
        if api_server is not None:
            _patch_api_server_module(api_server)
        run_agent = sys.modules.get("run_agent")
        if run_agent is not None:
            _patch_run_agent_module(run_agent)
        conversation_loop = sys.modules.get("agent.conversation_loop")
        if conversation_loop is not None:
            _patch_conversation_loop_module(conversation_loop)
        chat_completion = sys.modules.get("agent.chat_completion_helpers")
        if chat_completion is not None:
            _patch_chat_completion_helpers_module(chat_completion)
        codex_transport = sys.modules.get("agent.transports.codex")
        if codex_transport is not None:
            _patch_codex_transport_module(codex_transport)
        codex_runtime = sys.modules.get("agent.codex_runtime")
        if codex_runtime is not None:
            _patch_codex_runtime_module(codex_runtime)
        openai_responses = sys.modules.get("openai.resources.responses.responses")
        if openai_responses is not None:
            _patch_openai_responses_module(openai_responses)
        openai_base_client = sys.modules.get("openai._base_client")
        if openai_base_client is not None:
            _patch_openai_base_client_module(openai_base_client)
        utils_module = sys.modules.get("utils")
        if utils_module is not None:
            _patch_utils_atomic_replace_module(utils_module)
        auth_module = sys.modules.get("hermes_cli.auth")
        if auth_module is not None:
            _patch_auth_atomic_replace_module(auth_module)
    except Exception:
        logger.debug("Hermes Mobile deferred runtime override patch failed", exc_info=True)

    try:
        max_attempts = int(os.getenv("HERMES_MOBILE_RUNTIME_PATCH_MAX_ATTEMPTS", "1200"))
    except Exception:
        max_attempts = 1200
    try:
        interval_seconds = float(os.getenv("HERMES_MOBILE_RUNTIME_PATCH_INTERVAL_SECONDS", "0.5"))
    except Exception:
        interval_seconds = 0.5

    if _deferred_patch_attempts < max_attempts:
        timer = threading.Timer(max(0.1, interval_seconds), _deferred_patch_attempt)
        timer.daemon = True
        timer.start()
    if _deferred_patch_attempts in {1, 5, 20, 80, 200, 600, max_attempts}:
        _write_runtime_patch_status_marker()


def _install_deferred_patch_retry() -> None:
    timer = threading.Timer(0.05, _deferred_patch_attempt)
    timer.daemon = True
    timer.start()


def _eager_import_and_patch_runtime_modules() -> None:
    targets = (
        ("agent.system_prompt", _patch_system_prompt_module),
        ("gateway.platforms.api_server", _patch_api_server_module),
        ("run_agent", _patch_run_agent_module),
        ("agent.conversation_loop", _patch_conversation_loop_module),
        ("agent.chat_completion_helpers", _patch_chat_completion_helpers_module),
        ("agent.transports.codex", _patch_codex_transport_module),
        ("agent.codex_runtime", _patch_codex_runtime_module),
        ("openai.resources.responses.responses", _patch_openai_responses_module),
        ("openai._base_client", _patch_openai_base_client_module),
        ("utils", _patch_utils_atomic_replace_module),
        ("hermes_cli.auth", _patch_auth_atomic_replace_module),
    )
    for module_name, patcher in targets:
        try:
            module = importlib.import_module(module_name)
            patcher(module)
        except Exception:
            logger.debug("Hermes Mobile eager runtime patch skipped for %s", module_name, exc_info=True)


_write_runtime_override_loaded_marker()
if _configured_mcp_servers():
    _ensure_mcp_discovered_once()
_install_utils_atomic_replace_patch()
_install_auth_atomic_replace_patch()
_install_model_tools_patch()
_install_system_prompt_patch()
_install_api_server_patch()
_install_run_agent_patch()
_install_conversation_loop_patch()
_install_chat_completion_patch()
_install_codex_transport_patch()
_install_codex_runtime_patch()
_install_openai_responses_patch()
_install_openai_base_client_patch()
_eager_import_and_patch_runtime_modules()
_install_deferred_patch_retry()
