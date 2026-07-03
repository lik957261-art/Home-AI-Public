# MCP Tool Upgrade Closure

Use this runbook whenever a plugin MCP server adds, renames, removes, or changes
a callable tool. A plugin service schema pass is not enough. The closure must
prove the tool reached the model-callable Gateway layer and the Mobile
schema-sensitive conversation boundary.

This runbook is the MCP-schema layer of the broader plugin capability closure
contract. After MCP callable proof passes, use
`docs/PLATFORM_CONTRACTS/plugin-capability-closure-contract.md` and
`scripts/plugin-capability-closure-smoke.js` to prove the manifest/schema,
Home AI sync, Gateway registry, plugin conversation surface, UI/action
projection, production smoke, and terminal return-card stages were not split
across disconnected partial fixes.

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

## Cross-Workspace Ownership And Task Cards

Plugin workspaces and Home AI share one deployed platform, but they do not share
source ownership. A plugin Codex thread must not patch, test, deploy, commit,
or otherwise mutate Home AI source files unless the current thread workspace is
the Home AI app repository. In particular, plugin threads must not edit:

- `adapters/gateway-run-instruction-service.js`
- `mobile-server-runtime.js`
- Gateway profile/materialization code
- central Home AI tests
- central Home AI docs or handoff files

Plugin-side responsibility for an MCP schema change:

- update and deploy the plugin service and plugin-local MCP wrapper;
- prove the plugin service schema endpoint exposes the local tool names and any
  required properties;
- prove plugin-local stdio MCP, if present, exposes the same local tools;
- update plugin-local manifest `mcp.required_tools` and plugin docs;
- run the read-only service/source closure command from this runbook when the
  Home AI workspace is available, or prepare the task-card evidence below.

Home AI-side responsibility for an MCP schema change:

- update Mobile callable hints and `currentToolSchemaOverrideInstructions`;
- bump the shared schema epoch in `mobile-server-runtime.js` and the
  instruction-service default `toolSchemaEpoch`;
- update central tests and docs;
- run `scripts/mcp-tool-upgrade-closure-smoke.js` with the service schema URL,
  expected local tools, expected Gateway callable names, new epoch, and the
  selected production-capable Gateway profile;
- restart or refresh stale Gateway workers when needed;
- deploy Home AI when production behavior changes.

If the plugin thread cannot mutate Home AI, it must send a Codex Mobile
cross-thread task card to the Home AI app thread. The card should use this
bounded template:

````markdown
# Home AI MCP callable schema sync for <plugin id>

## Boundary

This card is for the Home AI app workspace. The plugin service schema has
changed, but the plugin workspace must not edit Home AI source files directly.

## Plugin evidence

- Plugin id / toolset: `<plugin id>` / `<toolset>`
- Plugin workspace: `<path>`
- Production service URL: `<loopback schema URL>`
- Service schema result: `ok=<true|false>`, `tool_count=<count>`
- Local tool names added/changed:
  - `<local_tool_name>`
- Expected Gateway callable names:
  - `mcp_<server>_<tool>`
- Required properties, if any:
  - `<local_tool>:<property>` -> `mcp_<server>_<tool>:<property>`
- Plugin-local stdio MCP evidence, if applicable: `tool_count=<count>`
- Plugin manifest `mcp.required_tools` status: `<updated|unchanged|not applicable>`

## Requested Home AI work

1. Update `adapters/gateway-run-instruction-service.js` callable hints and
   `currentToolSchemaOverrideInstructions()` for `<toolset>`.
2. Bump the Mobile schema epoch in both `mobile-server-runtime.js` and the
   instruction-service default to `<proposed epoch>`.
3. Update central tests and docs.
4. Run service/source closure:

```sh
node scripts/mcp-tool-upgrade-closure-smoke.js \
  --skip-gateway \
  --service-schema-url <schema URL> \
  --require-service-tool <local tool> \
  --gateway-tool <mcp callable> \
  --epoch <proposed epoch>
```

5. Run selected Gateway profile closure with the production manifest/profile,
   not only the plugin service schema.
6. Restart or refresh stale Gateway workers if needed.
7. Deploy Home AI if production behavior changes.

## Privacy

Do not print raw access keys, cookies, OAuth tokens, Gateway profile secrets,
private catalog rows, private user payloads, or long logs.
````

The Home AI target thread must report the failure layer if closure fails:
service schema, instruction hints, epoch, selected worker stale schema,
manifest/profile wiring, or live run evidence.

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

The no-argument daily smoke is a current source/default closure check. When no
Gateway manifest/profile is provided, it reports
`gateway_manifest_profile_not_provided_default_source_check` and must still use
the current schema epoch/tool defaults. This keeps the maintained self-check
command runnable as a drift detector.

Full selected-profile Gateway closure must be requested explicitly with
`--require-gateway`, `--macos-production-defaults`, or explicit `--manifest`
plus `--profile` arguments. With `--require-gateway`, omitting manifest/profile
fails closed. `--skip-gateway` remains the explicit source/service-only mode for
plugin-owned schema repair work where the selected Gateway profile is out of
scope.

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
  --manifest /Users/example/path \
  --profile hm-owner-openai-1 \
  --agent-schema-mode native \
  --telemetry-root /Users/example/path \
  --runtime-source /Users/example/path \
  --runtime-overrides /Users/example/path \
  --runtime-python /Users/example/path
```

For Home AI macOS production, prefer the central shortcut so the script supplies
the production manifest, Owner profile, telemetry root, native runtime source,
runtime overrides, and Python path consistently:

```bash
node scripts/mcp-tool-upgrade-closure-smoke.js \
  --macos-production-defaults \
  --password-file "$HOMEAI_MAC_SUDO_PASSWORD_FILE" \
  --service-schema-url http://127.0.0.1:<plugin-port>/<schema-path> \
  --require-service-tool <local_tool> \
  --require-service-tool-property <local_tool>:<property> \
  --gateway-tool <mcp_gateway_tool> \
  --require-gateway-tool-property <mcp_gateway_tool>:<property> \
  --epoch <schema-epoch>
```

`--macos-production-defaults` defaults to:

- manifest: `/Users/example/path`;
- profile: `hm-owner-openai-1` unless `--profile` is supplied;
- telemetry root: `/Users/<profile-os-user>/HermesWorkspace/.hermes-gateway/profiles`;
- runtime source: `/Users/example/path`;
- runtime overrides: `/Users/example/path`;
- runtime Python:
  `/Users/example/path`.

When the selected macOS profile's `agent-schema-probe` returns only built-in
tools even though the real worker can execute MCP tools, do not hand-roll a
one-off validation script. Use the central live runtime evidence path:

```bash
node scripts/mcp-tool-upgrade-closure-smoke.js \
  --macos-production-defaults \
  --toolset movie \
  --password-file "$HOMEAI_MAC_SUDO_PASSWORD_FILE" \
  --allow-live-gateway-substitute \
  --service-schema-url http://127.0.0.1:4195/api/v1/movie/mcp/schemas \
  --require-service-tool search_sources \
  --require-service-tool recommend_sources \
  --require-service-tool get_source_detail \
  --require-service-tool get_catalog_stats \
  --require-service-tool record_source_interaction \
  --require-service-tool update_source_list \
  --require-service-tool list_source_state \
  --require-service-tool-property search_sources:actor \
  --require-service-tool-property recommend_sources:preferred_actors \
  --gateway-tool mcp_movie_search_sources \
  --gateway-tool mcp_movie_recommend_sources \
  --gateway-tool mcp_movie_get_source_detail \
  --gateway-tool mcp_movie_get_catalog_stats \
  --gateway-tool mcp_movie_record_source_interaction \
  --gateway-tool mcp_movie_update_source_list \
  --gateway-tool mcp_movie_list_source_state \
  --require-gateway-tool-property mcp_movie_search_sources:actor \
  --require-gateway-tool-property mcp_movie_recommend_sources:preferred_actors \
  --live-gateway-call 'mcp_movie_search_sources={"query":"电影","limit":1,"actor":"梁朝伟","include_paths":false}' \
  --live-gateway-call 'mcp_movie_recommend_sources={"limit":1,"preferred_actors":["梁朝伟"],"include_paths":false}' \
  --epoch 20260628-gateway-pptx-create-v966
```

This invokes `scripts/gateway-mcp-runtime-call-smoke.js` through the same
selected Gateway worker and then verifies bounded `agent.tool_executor`
evidence for the requested MCP tools. It reports only status, worker id,
evidence kind, observed tool names, and response byte counts. It must not dump
model output, raw logs, keys, cookies, private catalog rows, or user content.

Use live substitute only for explicitly safe read-only or bounded smoke calls.
For mutating MCP tools, pass a dedicated dry-run or disposable fixture argument
set. If no safe live call exists, keep the schema failure as blocked and repair
the Gateway schema/probe path instead.

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

The 2026-06-16 Moira evidence upgrade exposes these callable names when the
`moira` toolset is enabled:

- `mcp_moira_list_records`
- `mcp_moira_get_chart_evidence`
- `mcp_moira_get_interpretation_context`
- `mcp_moira_get_analysis_evidence_bundle`
- `mcp_moira_get_rule_evidence_bundle`
- `mcp_moira_get_year_forecast_evidence`
- `mcp_moira_get_current_progression_evidence`
- `mcp_moira_get_pick_day_evidence`
- `mcp_moira_get_monthly_selection_evidence`
- `mcp_moira_get_transit_event_evidence`
- `mcp_moira_get_eclipse_event_evidence`
- `mcp_moira_get_aspect_evidence`
- `mcp_moira_get_pick_change_position_evidence`
- `mcp_moira_get_fixed_star_change_position_evidence`
- `mcp_moira_get_rule_migration_status`
- `mcp_moira_get_rule_commentary_readiness`
- `mcp_moira_get_functional_coverage_status`

The Mobile schema epoch for this callable set is
`20260616-moira-rule-evidence-bundle-mcp-v1`. Before production exposure, prove the Moira
service schema, Gateway selected-profile callable schema, Mobile instruction
hints, and selected worker schema all include the Moira callables. Moira uses
ordinary workspace-private binding: each effective workspace must have its own
`.hermes-moira/config.json` and key; Owner and `weixin_wuping` must not share
Moira MCP credentials. These tools return read-only chart/year/current/election,
transit/aspect/eclipse/change-position, and rule-readiness evidence only; the
model owns final interpretation and must not claim Moira generated a full
fortune narrative. PICK/择日 and 择月 tools return bounded calculation evidence;
unless promoted rule commentary is explicitly returned, they are status-only
facts and not a complete auspicious/inauspicious verdict.

## Email Full Body Pagination Pattern

The 2026-06-17 Email body-read upgrade changes the schema for
`mcp_email_get_message_body` without adding a new callable name. The callable
must expose the optional `readAll` and `maxChars` fields in the Gateway schema,
and the Email service response must expose explicit continuation metadata:
`hasMore`, `nextOffset`, and `remainingChars`.

Before production exposure, prove the Email service schema/contract, Gateway
wrapper schema, Mobile instruction hints, schema epoch, and selected worker
schema. Long message smokes must use bounded synthetic or metadata-only content
and must not dump full private email bodies into logs, docs, handoff, or the
AI Ops evidence ledger.

The Email Gateway wrapper must request the narrow launch capability
`full_content` for this tool. It must not request broad Email admin rights just
to read a user-selected full body; account visibility, purpose, pagination, and
audit remain enforced by the Email plugin service.

## Music Demo Narration MCP Pattern

The 2026-06-23 Music demo narration upgrade adds and requires these callable
names when the `music` toolset is enabled:

- `mcp_music_music_demo_rebind_plan`
- `mcp_music_music_demo_generate_narrations`
- `mcp_music_music_demo_prepare_narrations_for_playback`
- `mcp_music_music_demo_narration_job_status`
- `mcp_music_music_demo_attach_narrations`
- `mcp_music_music_demo_stage_narrations_for_roon`
- `mcp_music_music_demo_map_narrations_from_roon`
- `mcp_music_music_demo_cleanup_narrations`

The Mobile schema epoch for this callable set is
`20260623-music-demo-narration-cleanup-v1`. Before production exposure, prove
the Music service schema, selected Gateway profile callable schema, Mobile
instruction hints, and selected worker schema all include the Music demo
narration and cleanup callables. A Music service `/api/v1/music/mcp/schemas`
pass alone is incomplete: if Mobile still uses an older epoch or instruction
hint set, a live Music topic can report that `music` is enabled while the
current callable schema lacks `mcp_music_music_demo_cleanup_narrations`.

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
