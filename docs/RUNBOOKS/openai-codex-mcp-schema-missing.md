# OpenAI Codex MCP Callable Schema Missing

## Symptom

A Hermes Mobile run says a toolset such as `wardrobe` is enabled in policy, but the assistant reports that `mcp_wardrobe_*` functions are not callable. This can affect ChatGPT/OpenAI Codex profile runs even when DeepSeek profile runs work.

## Known 2026-05-30 Cause

The low Gateway runtime had two overlapping issues:

- The local official Hermes checkout was stale after a previous emergency update. On 2026-05-30 it was at `458a94e42`, while fetched `origin/main` was `6a72af044`, 405 commits ahead. The remote range contains relevant Codex Responses, MCP startup, Gateway, and tool cleanup fixes.
- Hermes Mobile's runtime override wrapped `run_agent.handle_function_call` with an older positional signature. Newer runtime paths passed keyword arguments such as `tool_call_id`; the wrapper forwarded them into incompatible code and broke tool execution.

The lowgw1 evidence after the fix:

- `/health` on port `18751` returned `{"status":"ok","platform":"hermes-agent"}`.
- `scripts/probe-lowgw1-wardrobe-mcp.js` produced a real `function_call` for `mcp_wardrobe_wardrobe_search_items`.
- The corresponding `function_call_output` returned a Wardrobe result for owner `XuXin`.

## Diagnosis Path

1. Do not route away from the user-selected provider as a workaround. If the user selected ChatGPT/OpenAI, diagnose that provider path.
2. Check the target worker health first:
   - `curl http://127.0.0.1:<port>/health`
3. Check official runtime drift:
   - `git -c safe.directory=/opt/hermes-gateway-runtime/official-clean status -sb`
   - `git -c safe.directory=/opt/hermes-gateway-runtime/official-clean fetch --prune origin`
   - `git -c safe.directory=/opt/hermes-gateway-runtime/official-clean log --oneline HEAD..origin/main -20`
4. Check local outgoing tool schema and actual model callable behavior separately. Local schema presence alone is insufficient.
5. Use `scripts/probe-lowgw1-wardrobe-mcp.js` for a bounded live callable test against lowgw1.

## Restart Scope

When only a test worker is being validated, restart only the named worker, for example `lowgw1`. Do not restart the full Gateway Pool unless the change is a production-wide plugin/schema/profile change or the user explicitly asks for a pool restart.

## Harness

Relevant checks:

- `python -m py_compile gateway-runtime-overrides\sitecustomize.py gateway-runtime-overrides\model_tools.py`
- `node scripts\probe-lowgw1-wardrobe-mcp.js`
- `node tests\no-window-command-harness.test.js`

The probe must assert actual `function_call` and `function_call_output`, not only policy text or toolset labels.

## 2026-05-30 Official Runtime Update

After the lowgw1 hotfix passed, `/opt/hermes-gateway-runtime/official-clean` was fast-forwarded from `458a94e42` to `6a72af044`, the current fetched `origin/main` at the time.

Validation after the update:

- official checkout status: `main...origin/main`, clean
- focused official syntax check with temp pycache passed for:
  - `run_agent.py`
  - `model_tools.py`
  - `gateway/run.py`
- `lowgw1` restarted on the updated official runtime and returned `/health` ok.
- `scripts/probe-lowgw1-wardrobe-mcp.js` confirmed real `mcp_wardrobe_wardrobe_search_items` callable execution.
- Gateway Pool restart completed; independent health scan reported ports `18751..18773` and `18651..18653` healthy.

The runtime override remains as a compatibility layer around Hermes Mobile's product-specific Gateway behavior. Do not patch official source directly for Hermes Mobile product behavior; keep such patches in `gateway-runtime-overrides`.
