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
   - Field-level changes must be asserted by name. A tool-name-only pass is not
     enough for upgrades that add parameters such as `file_path` or
     `upload_path`.
2. Gateway wrapper/profile:
   - The selected Gateway worker exposes the `mcp_<server>_<tool>` callable
     through the agent-schema probe, session schema, or equivalent
     `gateway-tool-schema-smoke.js --schema-only` path.
   - This is the Gateway worker callable schema. Worker registration logs are
     diagnostic only and do not by themselves prove the model can call the tool.
   - For parameter upgrades, the Gateway callable schema must expose the same
     required properties as the plugin service schema.
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
7. Write behavior readback:
   - For MCP tools that create, update, attach, delete, or otherwise mutate
     plugin data, a schema pass is not enough. The closure must include a
     readback against the plugin's source-of-truth object and assert the exact
     changed field. For Finance attachments, the accepted readback is the
     target transaction showing increased `attachmentCount` /
     `imageAttachmentCount` or an equivalent attachment-list entry for the
     same transaction id.
   - If a tool accepts a local file path, the live smoke must pass the file path
     field such as `file_path` or `upload_path`, not a model-invented
     `data_url` that wraps the path string. A response such as
     `attachment_data_url_invalid` means the callable schema or instruction
     layer is still wrong for path-based attachment uploads.

## Harness

Source and service closure, without a live Gateway worker:

```powershell
node scripts\mcp-tool-upgrade-closure-smoke.js `
  --skip-gateway `
  --service-schema-url http://127.0.0.1:8791/api/finance/mcp/schemas `
  --service-header X-Finance-MCP-Workspace-Id=owner `
  --service-header-file X-Finance-MCP-Workspace-Key=<workspace-finance-key-file> `
  --require-service-tool finance.add_transaction_attachment `
  --require-service-tool-property finance.add_transaction_attachment:file_path `
  --require-service-tool-property finance.add_transaction_attachment:upload_path `
  --service-schema-contains attachments `
  --gateway-tool mcp_finance_add_transaction_attachment `
  --require-gateway-tool-property mcp_finance_add_transaction_attachment:file_path `
  --require-gateway-tool-property mcp_finance_add_transaction_attachment:upload_path `
  --epoch 20260606-finance-reference-mcp-v1 `
  --doc-contains docs/RUNBOOKS/mcp-tool-upgrade-closure.md::mcp_finance_add_transaction_attachment
```

Only an explicit `--skip-gateway` may skip the Gateway callable-schema layer.
If `--skip-gateway` is absent, the harness must receive both `--manifest` and
`--profile` and must fail closed when the selected production-capable profile is
not named. This prevents a source/service-only smoke from being mistaken for
full selected-profile closure.

Full Gateway closure for a selected production-capable profile:

```powershell
node scripts\mcp-tool-upgrade-closure-smoke.js `
  --service-schema-url http://127.0.0.1:8791/api/finance/mcp/schemas `
  --service-header X-Finance-MCP-Workspace-Id=owner `
  --service-header-file X-Finance-MCP-Workspace-Key=<workspace-finance-key-file> `
  --require-service-tool finance.add_transaction_attachment `
  --require-service-tool-property finance.add_transaction_attachment:file_path `
  --require-service-tool-property finance.add_transaction_attachment:upload_path `
  --service-schema-contains attachments `
  --gateway-tool mcp_finance_add_transaction_attachment `
  --require-gateway-tool-property mcp_finance_add_transaction_attachment:file_path `
  --require-gateway-tool-property mcp_finance_add_transaction_attachment:upload_path `
  --epoch 20260606-finance-reference-mcp-v1 `
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
  --require-service-tool-property finance.add_transaction_attachment:file_path \
  --require-service-tool-property finance.add_transaction_attachment:upload_path \
  --service-schema-contains attachments \
  --gateway-tool mcp_finance_add_transaction_attachment \
  --require-gateway-tool-property mcp_finance_add_transaction_attachment:file_path \
  --require-gateway-tool-property mcp_finance_add_transaction_attachment:upload_path \
  --epoch 20260606-finance-reference-mcp-v1 \
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
- Finance service schema includes the direct attachment path fields
  `file_path` and `upload_path`.
- Gateway callable schema includes `mcp_finance_add_transaction_attachment`
  and the matching `file_path` / `upload_path` properties.
- Mobile instruction-service hints include
  `mcp_finance_add_transaction_attachment`.
- `GATEWAY_TOOL_SCHEMA_EPOCH` is bumped to a new plugin-MCP epoch.
- The selected worker is restarted or agent-schema-smoked after the change.

## Finance Reference Contract V1 Pattern

The 2026-06-06 Finance Reference Contract V1 source change adds these callable
names when the `finance` toolset is enabled:

- `mcp_finance_reference_object_types`
- `mcp_finance_reference_get`
- `mcp_finance_reference_summarize`

The Mobile schema epoch for this callable set is
`20260606-finance-reference-mcp-v1`. Before production exposure, prove the
Finance service schema, Gateway selected-profile callable schema, Mobile
instruction hints, and selected worker schema all include these names. The
Reference / Memory Graph may cache only bounded display snapshots; full Finance
facts remain resolved through Finance.

## Finance Owner Asset MCP Pattern

The 2026-06-10 Finance Owner Asset upgrade adds these callable names when the
`finance` toolset is enabled:

- `mcp_finance_get_owner_asset_summary`
- `mcp_finance_list_owner_asset_snapshots`
- `mcp_finance_upsert_owner_asset_snapshot`

The Mobile schema epoch for this callable set is
`20260610-finance-owner-assets-mcp-v1`. Before production exposure, prove the
Finance service schema, Gateway selected-profile callable schema, Mobile
instruction hints, and selected worker schema all include the Owner asset
callables. These tools are Owner-only; non-Owner runs should report a bounded
permission or schema diagnostic instead of inventing a generic asset interface.

## Finance Owner Stock MCP Pattern

The 2026-06-12 Finance stock holdings upgrade adds these callable names when
the `finance` toolset is enabled:

- `mcp_finance_get_owner_stock_summary`
- `mcp_finance_list_owner_stock_snapshots`
- `mcp_finance_apply_owner_stock_position_delta`

The Mobile schema epoch for this callable set is
`20260612-finance-owner-stocks-mcp-v1`. Before production exposure, prove the
Finance service schema, Gateway selected-profile callable schema, Mobile
instruction hints, and selected worker schema all include the stock callables.
Stock valuation queries must refresh live prices and FX; natural-language
position deltas must not ask the user to provide live market prices or exchange
rates.

## Moira Evidence MCP Pattern

The 2026-06-14 Moira evidence upgrade adds these callable names when the
`moira` toolset is enabled:

- `mcp_moira_list_records`
- `mcp_moira_get_chart_evidence`
- `mcp_moira_get_year_forecast_evidence`
- `mcp_moira_get_pick_day_evidence`
- `mcp_moira_get_monthly_selection_evidence`

The Mobile schema epoch for this callable set is
`20260615-moira-pick-month-mcp-v1`. Before production exposure, prove the Moira
service schema, Gateway selected-profile callable schema, Mobile instruction
hints, and selected worker schema all include the Moira callables. Moira uses
ordinary workspace-private binding: each effective workspace must have its own
`.hermes-moira/config.json` and key; Owner and `weixin_wuping` must not share
Moira MCP credentials. These tools return read-only chart/year/election
evidence only; the model owns final interpretation and must not claim Moira
generated a full fortune narrative. PICK/择日 and 择月 tools return bounded
calculation evidence; unless promoted rule commentary is explicitly returned,
they are status-only facts and not a complete auspicious/inauspicious verdict.

## Failure Classification

- Service schema missing local tool:
  - Plugin implementation/deployment failure.
- Service schema present, Gateway callable missing:
  - Wrapper/profile generation, trust boundary, runtime overlay, or worker
    restart failure.
- Service schema present but Gateway callable properties missing:
  - Wrapper schema materialization, agent schema cache, or profile restart
    failure. Do not accept a tool-name-only Gateway smoke for this upgrade.
- Gateway callable present, Mobile hints/epoch stale:
  - Mobile schema synchronization failure. Bump hints and epoch before
    accepting the deployment.
- Gateway callable properties present, but Finance returns
  `attachment_data_required`:
  - The model called the attachment tool without one of `file_path`,
    `upload_path`, `data_url`, or `data_base64`. Fix the Mobile instruction
    layer and run a live file-path attachment smoke rather than redeploying
    Finance schema.
- All layers present, model still does not call the tool:
  - Diagnose prompt/tool-choice behavior with bounded run metadata and a live
    callable probe. Do not claim the MCP upgrade is unavailable unless the
    current run's actual callable schema lacks the tool.
