# MCP Tool Upgrade Closure

Use this runbook whenever a plugin MCP server adds, renames, removes, or changes
a callable tool. A plugin service schema pass is not enough. The closure must
prove the tool reached the model-callable Gateway layer and the Mobile
schema-sensitive conversation boundary.

## Required Layers

Every MCP tool upgrade must verify these layers in order:

1. Plugin service schema:
   - The plugin service endpoint, for example `/api/finance/mcp/schemas`,
     returns the new local tool name and any changed fields.
2. Gateway wrapper/profile:
   - The selected Gateway worker exposes the `mcp_<server>_<tool>` callable
     through the agent-schema probe, session schema, or equivalent
     `gateway-tool-schema-smoke.js --schema-only` path.
   - This is the Gateway worker callable schema. Worker registration logs are
     diagnostic only and do not by themselves prove the model can call the tool.
3. Mobile instruction-service:
   - `adapters/gateway-run-instruction-service.js` lists the new callable in
     `callableFunctionHintsForToolsets`.
   - `currentToolSchemaOverrideInstructions` names the new callable when that
     toolset is enabled.
4. Schema epoch:
   - `mobile-server-runtime.js` `GATEWAY_TOOL_SCHEMA_EPOCH` and the
     instruction-service default `toolSchemaEpoch` are bumped when the
     model-callable schema changes.
5. Production worker lifecycle:
   - Existing workers that can cache old callable schemas are restarted or
     otherwise proven to construct the new live schema.
6. Live run evidence:
   - A failed or validation run should be checked by run id or bounded metadata
     only. The evidence should prove whether the new callable name appears in
     `raw_json`, `run_options_json`, session schema, or agent-schema output
     without dumping user content.

## Harness

Source and service closure, without a live Gateway worker:

```powershell
node scripts\mcp-tool-upgrade-closure-smoke.js `
  --skip-gateway `
  --service-schema-url http://127.0.0.1:8791/api/finance/mcp/schemas `
  --service-header X-Finance-MCP-Workspace-Id=owner `
  --service-header-file X-Finance-MCP-Workspace-Key=<workspace-finance-key-file> `
  --require-service-tool finance.add_transaction_attachment `
  --service-schema-contains attachments `
  --gateway-tool mcp_finance_add_transaction_attachment `
  --epoch 20260606-finance-attachment-mcp-v1 `
  --doc-contains docs/RUNBOOKS/mcp-tool-upgrade-closure.md::mcp_finance_add_transaction_attachment
```

Full Gateway closure for a selected production-capable profile:

```powershell
node scripts\mcp-tool-upgrade-closure-smoke.js `
  --service-schema-url http://127.0.0.1:8791/api/finance/mcp/schemas `
  --service-header X-Finance-MCP-Workspace-Id=owner `
  --service-header-file X-Finance-MCP-Workspace-Key=<workspace-finance-key-file> `
  --require-service-tool finance.add_transaction_attachment `
  --service-schema-contains attachments `
  --gateway-tool mcp_finance_add_transaction_attachment `
  --epoch 20260606-finance-attachment-mcp-v1 `
  --manifest C:\ProgramData\HermesMobile\data\gateway-pool-manifest.json `
  --profile lowgw1
```

On Mac production, run the same harness with the Mac manifest/profile and native
Gateway runtime arguments. The `--telemetry-root` must be the selected worker
OS user's real Gateway profile root, not root's home and not the shared app
root. For `hm-owner-openai-1`, that is the Owner worker profile root:

```bash
node scripts/mcp-tool-upgrade-closure-smoke.js \
  --service-schema-url http://127.0.0.1:8791/api/finance/mcp/schemas \
  --service-header X-Finance-MCP-Workspace-Id=owner \
  --service-header-file X-Finance-MCP-Workspace-Key=<workspace-finance-key-file> \
  --require-service-tool finance.add_transaction_attachment \
  --service-schema-contains attachments \
  --gateway-tool mcp_finance_add_transaction_attachment \
  --epoch 20260606-finance-attachment-mcp-v1 \
  --manifest /Users/hermes-host/HermesMobile/data/gateway-pool-manifest-mac.json \
  --profile hm-owner-openai-1 \
  --agent-schema-mode native \
  --telemetry-root /Users/hm-owner/HermesWorkspace/.hermes-gateway/profiles \
  --runtime-source /Users/hermes-host/HermesMobile/runtime/hermes-agent-official \
  --runtime-overrides /Users/hermes-host/HermesMobile/app/gateway-runtime-overrides \
  --runtime-python /Users/hermes-host/HermesMobile/runtime/hermes-agent-official/venv/bin/python
```

Do not accept a Mac schema probe that runs against the wrong profile root. A
root/default `HERMES_HOME` can fail provider auth or prove the wrong tool
schema. The closure evidence must bind the same workspace, OS user, profile id,
and MCP service key that the real Mobile route will select.

Do not add keys, tokens, cookies, or raw user content to harness output. If a
service schema endpoint requires authorization, pass it through an existing
trusted local service path rather than printing raw credentials. Use
`--service-header-file` for workspace-local MCP keys; the harness reports only
header names, not key values or key file paths.

## Finance Attachment Incident Pattern

The 2026-06-06 Finance attachment upgrade failed at the Mobile/Gateway schema
sync layer: the Finance plugin service and wrapper could expose
`finance.add_transaction_attachment`, but the live Home AI run did not contain
`mcp_finance_add_transaction_attachment` in persisted run metadata. The model
therefore correctly reported that no attachment upload interface was exposed in
that run.

The accepted fix is not only redeploying Finance. The closure requires:

- Finance service schema includes `finance.add_transaction_attachment`.
- Gateway callable schema includes `mcp_finance_add_transaction_attachment`.
- Mobile instruction-service hints include
  `mcp_finance_add_transaction_attachment`.
- `GATEWAY_TOOL_SCHEMA_EPOCH` is bumped to a new plugin-MCP epoch.
- The selected worker is restarted or agent-schema-smoked after the change.

## Failure Classification

- Service schema missing local tool:
  - Plugin implementation/deployment failure.
- Service schema present, Gateway callable missing:
  - Wrapper/profile generation, trust boundary, runtime overlay, or worker
    restart failure.
- Gateway callable present, Mobile hints/epoch stale:
  - Mobile schema synchronization failure. Bump hints and epoch before
    accepting the deployment.
- All layers present, model still does not call the tool:
  - Diagnose prompt/tool-choice behavior with bounded run metadata and a live
    callable probe. Do not claim the MCP upgrade is unavailable unless the
    current run's actual callable schema lacks the tool.
