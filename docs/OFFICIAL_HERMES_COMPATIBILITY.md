# Official Hermes Compatibility

Hermes Mobile should integrate with official Hermes through stable HTTP/API boundaries wherever possible.

## Preferred Boundaries

- Use Gateway HTTP endpoints for runs, events, interrupt, and health.
- Keep local mobile state in Hermes Mobile, not in official dashboard state.
- Treat official dashboard UI and PTY Chat as reference only; do not depend on its frontend internals.
- Use configuration/env variables for Hermes home, config paths, Gateway URL, API key path, and CRON paths.

## Current Dependencies

- `HERMES_WEB_HERMES_API_BASE` defaults to `http://127.0.0.1:8642`.
- Gateway task execution uses `/v1/responses` and run liveness checks use `/v1/runs/<id>`.
- Usage rendering expects detailed Gateway usage when available, but tolerates aggregate-only historical payloads.
- Optional bridges may read native Hermes files, such as CRON jobs or plugin-backed todo data, through deployment-specific adapters.

## Upgrade Policy

- Do not patch official Hermes source as part of Hermes Mobile product code.
- If a required Gateway field is missing, add compatibility handling in Hermes Mobile first and track the desired upstream Gateway contract separately.
- Keep private deployment fixes outside the product core unless they generalize cleanly.
- Before public export, run a privacy scan and verify the repository does not contain private paths, tokens, push endpoints, uploaded files, Agent context, or private clone URLs.

