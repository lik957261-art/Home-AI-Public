# Official Hermes Compatibility

Hermes Mobile should integrate with official Hermes through stable HTTP/API boundaries wherever possible.

The current product decision is Gateway Pool scheduling in Hermes Mobile: Hermes Mobile owns the mobile product layer and run placement, while each official Hermes Gateway profile remains an execution kernel. See [Gateway Pool Architecture](GATEWAY_POOL_ARCHITECTURE.md).

## Preferred Boundaries

- Use Gateway HTTP endpoints for runs, events, interrupt, and health.
- Keep local mobile state in Hermes Mobile, not in official dashboard state.
- Treat official dashboard UI and PTY Chat as reference only; do not depend on its frontend internals.
- Use configuration/env variables for Hermes home, config paths, Gateway URL, API key path, and CRON paths.
- Keep official Hermes source clean and directly upgradable. Deep deployment behavior, including Weixin-era Todo/Automation routing, should move into Hermes Mobile services or optional adapters rather than patching Gateway/agent internals.
- Weixin/iLink polling and outbound delivery should be treated as a Mobile sidecar boundary when a deployment needs it. Official Hermes Gateway should receive already-routed Mobile runs rather than owning deployment-specific account polling, queueing, or delivery receipts.
- Do not bypass Gateway by calling Codex/OpenAI directly for user tasks. If official Hermes agent behavior is required, the run must go through official Gateway.
- Do not reimplement Skill discovery, Skill creation/update, memory, compression, session, tool routing, or artifact semantics inside Hermes Mobile.

## Current Dependencies

- `HERMES_WEB_HERMES_API_BASE` defaults to `http://127.0.0.1:8642`.
- Gateway task execution uses `/v1/responses`; run liveness checks use `/v1/runs/<id>`.
- Runtime records retain `runId -> gatewayUrl` / profile metadata so stop, liveness, and event handling go back to the Gateway that created the run.
- Gateway Pool mode may read a deployment worker-pool manifest, but worker API keys are request-only secrets and must not be persisted into Hermes Mobile state or browser payloads.
- Product-level active-run concurrency is enforced in Hermes Mobile before Gateway run creation. Official Hermes still owns the run lifecycle once a run starts.
- Usage rendering expects detailed Gateway usage when available, but tolerates aggregate-only historical payloads.
- Optional bridges may read native Hermes files, such as CRON jobs or plugin-backed todo data, through deployment-specific adapters.
- The SQLite service-layer migration/runtime keeps Hermes Mobile-owned state outside official Hermes. Todo and Automation bridge backends should remain opt-in compatibility adapters for existing deployments, not the default product architecture.

## Upgrade Policy

- Do not patch official Hermes source as part of Hermes Mobile product code.
- If a required Gateway field is missing, add compatibility handling in Hermes Mobile first and track the desired upstream Gateway contract separately.
- Keep deployment-specific fixes outside the product core unless they generalize cleanly.
- Treat single Gateway as the minimal install and fallback. Production can reuse official Hermes worker profiles when the deployment already shares the required Skill/memory state safely through official/profile configuration.
- Before public export, run a privacy scan and verify the repository does not contain private paths, tokens, push endpoints, uploaded files, Agent context, or private clone URLs.
