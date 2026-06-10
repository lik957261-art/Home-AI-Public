# Growth Pluginization Plan

Last updated: 2026-06-10.

## Purpose

This plan moves the built-in Home AI Growth system into the clean
`plugins/growth` embedded plugin workspace in controlled stages. Production
deployment is intentionally out of scope until the development environment
proves the full migration path.

## Current State

- The clean plugin workspace is `/Users/hermes-dev/HermesMobileDev/plugins/growth`.
- The plugin remote is `git@github.com:pentiumxp/Education.git`.
- The old remote `Education/main` was preserved as
  `archive/education-pre-growth-plugin-20260610`.
- The plugin scaffold has a manifest, workspace registration, launch endpoint,
  facade-backed API, embedded UI, local snapshot store, bounded event contract
  scaffold, read-only MCP schema scaffold, and local tests.
- The mature Growth implementation still lives in the Home AI host under
  `adapters/learning-*`, `server-routes/learning-*`, and
  `public/app-learning-*`.

## Non-Negotiable Boundary

Do not copy the Home AI server, Gateway runtime, deployment scripts, or central
route composition into the Growth plugin. The pluginization path must extract
bounded behavior through stable API/service contracts.

Home AI remains the owner of:

- Hermes workspace identity and Access Key boundaries;
- plugin authorization, iframe host, launch token, proxy, appearance, and
  mobile shell;
- Gateway profile/toolset activation;
- Action Inbox and Web Push;
- platform `通宝` wallet, ledger, and administrator-operated Growth-coin to
  `通宝` exchange;
- Family Profile, Reference, and Memory Graph aggregation;
- Mac production deployment orchestration.

Growth plugin becomes the owner of:

- Growth UI;
- learner programs and cards after data migration;
- teaching/practice/stage-assessment workflows after service migration;
- Growth database after a verified migration;
- Growth-domain learning coin settlement for completed cards after workflow
  migration;
- Growth MCP toolset after schema closure;
- Growth reference objects and bounded projections.

## Seven-Step Migration

### 1. Contract And Migration Plan

Document the boundary, stages, tests, and non-goals before code movement. This
document is the durable plan. It must stay aligned with
`docs/MODULES/growth-learning.md`, `docs/MODULES/plugins.md`, and the Growth
plugin pointer file.

Acceptance:

- the plan exists in Home AI docs;
- the Growth module doc points to it;
- the plugin pointer records that extraction must go through this plan.

### 2. Home AI Growth Facade

Add a stable host facade under `/api/growth/v1/*` over the current built-in
Growth services. This is a migration bridge, not the final plugin API.

V1 facade routes:

- `GET /api/growth/v1/status`;
- `GET /api/growth/v1/board`;
- `GET /api/growth/v1/cards/:taskCardId`.

The facade must return bounded projections only. It must not expose raw learner
answers, transcripts, prompts, raw model responses, launch tokens, local file
paths, or plugin keys.

Acceptance:

- focused service and route tests prove bounded projection;
- dispatcher/composition tests prove the route is authenticated and wired;
- legacy `/api/learning-growth/*` routes continue to work.

### 3. Development Host Registration

Register plugin id `growth` in Home AI development only after the Growth plugin
service is running locally. Use the same manifest/provisioning/launch contract
as Health and Note.

Acceptance:

- Home AI can read the Growth manifest from loopback;
- workspace provisioning writes `.hermes-growth/config.json` and
  `.hermes-growth/access-key.txt`;
- plugin visibility remains workspace-scoped and does not fall back to Owner;
- no production service or launchd fact is claimed before deployment exists.

Current development status:

- Home AI host registration code and tests exist.
- The Growth plugin has manifest, registration, launch, and provisioning tests.
- No production service or launchd fact has been created.

### 4. Plugin UI Read Path

Move the initial Growth board/card UI into the plugin. During this stage the
plugin may call the Home AI facade as its data source. The Home AI built-in
Growth tab may remain as a compatibility surface or open the plugin.

Acceptance:

- the plugin renders board and card detail from `/api/growth/v1/*`;
- embedded layout follows `embedded-plugin-ui-contract.md`;
- development visual harness proves iframe/footer/safe-area behavior.

Current development status:

- The plugin reads `/api/growth/v1/status` and `/api/growth/v1/board` through
  configurable `GROWTH_HOME_AI_API_BASE_URL` and
  `GROWTH_HOME_AI_ACCESS_KEY(_PATH)`.
- The plugin also reads `/api/growth/v1/cards/:taskCardId`, renders a bounded
  task list, and opens a compact card detail panel. When the Home AI facade is
  unavailable, card detail can fall back to the plugin snapshot store.
- Local development checks have covered plugin syntax, service tests, HTTP
  smoke, and a mobile-width Playwright page smoke with no horizontal overflow.
- iOS embedded visual harness evidence passed on the development simulator for
  the Home AI-hosted Growth plugin shell:
  `embedded-plugin-shell --plugin-id growth`,
  `clientVersion=20260610-growth-plugin-shell-v680`, screenshot artifact
  `/Users/xuxin/.homeai-qa/artifacts/ios-pwa-visual-embedded-plugin-shell-growth-20260610T023822Z.png`.
  The development host must bind `HERMES_WEB_HOST=0.0.0.0` and the simulator
  must open the Mac LAN URL, not `127.0.0.1`, because simulator-local
  `127.0.0.1` can resolve inside the iOS runtime.

### 5. Domain Service And Database Migration

Move Growth-owned persistence and domain services into the plugin only after
the workflow boundary is stable.

Acceptance:

- migration script copies the required learning-growth tables from a verified
  source backup into plugin-owned storage;
- quick integrity/readback checks pass;
- rollback restores the prior Home AI data path;
- plugin API results match the host facade before switching ownership.

Current development status:

- A JSON snapshot store persists bounded board projections after successful
  facade reads and provides a development fallback when the facade is
  unavailable.
- The Growth plugin also exposes a controlled facade snapshot import path:
  `POST /api/v1/growth/migrations/facade-snapshot` with the Growth
  registration bearer. The import fetches bounded Home AI facade board/card
  projections, writes them to plugin-owned snapshot storage, and returns
  bounded import/readback metadata.
- The same import logic is available from the plugin workspace via
  `npm run import:facade-snapshot -- --workspace-id <workspace-id>`.
- The plugin now has a plugin-owned SQLite migration/readback path:
  `npm run import:learning-sqlite -- --source-db <verified-backup.sqlite3>
  --target-db <plugin-data>/growth-learning.sqlite3 --write --workspace-id
  <workspace-id> --json`.
- The SQLite migration script validates the source with `PRAGMA quick_check`,
  required learning-growth table presence, and `PRAGMA foreign_key_check`,
  backs up an existing target before replacement, copies the database into
  plugin-owned storage, and returns bounded readback metadata only.
- Rollback is explicit:
  `npm run import:learning-sqlite -- --target-db <plugin-data>/growth-learning.sqlite3
  --rollback <script-created-backup.sqlite3> --write --json`.
- The deployed Mac production plugin reads status, board, and card detail from
  the migrated SQLite store when `GROWTH_DATA_OWNER=plugin` is set. That is now
  the Growth read source for the Home AI embedded plugin path.
- The plugin also projects latest submission/reflection audio metadata from the
  migrated SQLite records and exposes plugin-owned playback routes:
  `/api/v1/growth/audio/submissions/:id` and
  `/api/v1/growth/audio/reflections/:id`. Playback prefers
  `learning_task_audio_blobs` and falls back to bounded legacy artifact-file
  lookup under `GROWTH_LEGACY_AUDIO_ROOTS` or the standard sibling Home AI
  `data` root. Raw absolute file paths must not be exposed to the browser.
- Historical audio evidence backfill is implemented through
  `npm run backfill:audio-blobs`. It scans migrated submission/reflection audio
  metadata, verifies bounded legacy files, and writes missing
  `learning_task_audio_blobs` records only with explicit `--write`; dry-run is
  the default. Production Stephen backfill on 2026-06-10 wrote 10 BLOB records
  totaling 46,107,050 bytes after an online SQLite backup and left a follow-up
  dry-run with `already_blobbed=10`, `would_backfill=0`, and `file_missing=0`.
- The plugin now exposes a workspace-bearer submission write endpoint:
  `POST /api/v1/growth/cards/:taskCardId/submissions`. It accepts bounded JSON
  text/audio evidence, resolves either the native Growth task card id or the
  legacy kanban card id, writes the submission and optional audio BLOB into the
  plugin-owned SQLite database, ensures a lightweight interaction session for
  production foreign keys, and enqueues a pending
  `learning_growth_evaluation_jobs` row when the queue table exists.
- The plugin now processes due evaluation jobs through
  `POST /api/v1/growth/evaluations/process` and the optional lightweight
  dispatcher controlled by `GROWTH_EVALUATION_WORKER_ENABLED=1`. Processing
  claims due pending/retry jobs, reads the plugin-owned submission/task context,
  writes bounded `learning_evaluations`, settles Growth-domain learning coins
  in `learning_reward_settlements` for completed cards, marks passed cards
  completed, and marks jobs done/retry/failed. Current plugin evaluation is
  deterministic and summary-only. It does not write `通宝` or trigger
  real-time Growth-coin-to-`通宝` exchange.
- The plugin now exposes a workspace-bearer reflection write endpoint:
  `POST /api/v1/growth/cards/:taskCardId/reflections`. It accepts bounded
  text/audio reflection evidence, resolves native Growth task card ids or
  legacy kanban card ids, writes `learning_task_reflections`, and stores
  reflection audio BLOBs in the plugin-owned SQLite database.
- Home AI has a transitional proxy service at
  `adapters/growth-plugin-submission-proxy-service.js`. The legacy
  `/api/kanban/cards/:cardId/learning-growth-submission` and
  `/api/kanban/cards/:cardId/learning-growth-reflection` routes prefer these
  plugin endpoints when the workspace has a `.hermes-growth` binding. They
  only fall back to the legacy Home AI submission service when that local
  binding is not configured during staged migration.
- Development verification used an online SQLite backup copy of the Mac
  production `learning-growth.sqlite3`, stored under the ignored development
  tmp directory. Source and target `quick_check` passed, all required tables
  were present, `weixin_stephen` readback returned 48 cards from plugin-owned
  SQLite, and a local plugin service smoke on port `4882` returned
  `growth-plugin-sqlite` for status, board, and card detail.
- Per-card Growth learning coin settlement and bounded completion/mastery/review
  events are now plugin-owned. Platform `通宝` exchange, Action Inbox/Web Push,
  Owner manual decisions, and monthly Growth coin clearing remain host-owned
  platform workflow stages.

### 6. Plugin Event Contract

After plugin-side workflows exist, Growth emits bounded events to Home AI:

- `growth.card.completed`;
- `growth.review.required`;
- `growth.reward.requested` for a future administrator monthly exchange/review
  workflow, not for real-time per-card conversion;
- `growth.mastery.updated`.

Events must contain ids, workspace ids, bounded status fields, score bands,
short summaries, and source refs only.

Home AI remains responsible for Action Inbox, Web Push, platform `通宝`
exchange and ledger mutation, Family Profile, and Memory/Reference aggregation.
Single-card Growth evaluation workers must not emit real-time `通宝` exchange
requests.

Current development status:

- The plugin has a bounded event normalization service for the event names
  above plus `growth.board_snapshot_imported` for migration staging.
- The plugin now persists events in a local outbox and can deliver them to
  Home AI's standard `POST /api/hermes-plugins/growth/notifications` endpoint
  when Home AI API base URL and access key config are present.
- The event API is `POST /api/v1/growth/events` with the Growth registration
  bearer. Event payloads are mapped to summary-only plugin notification
  payloads so Home AI remains responsible for Action Inbox and Web Push.

### 7. Growth MCP Toolset

Add `growth` MCP only after plugin API/data ownership is explicit.

Candidate tools:

- `mcp_growth_list_cards`;
- `mcp_growth_get_card`;
- `mcp_growth_submit_evidence`;
- `mcp_growth_get_mastery_profile`;
- `mcp_growth_list_programs`.

Acceptance:

- MCP schema is exposed only for workspaces with complete `.hermes-growth`
  binding;
- Gateway callables use a single `mcp_growth_*` prefix;
- tool outputs are summary-only and bounded;
- `docs/RUNBOOKS/mcp-tool-upgrade-closure.md` closure passes before production.

Current development status:

- The plugin exposes `GET /api/v1/growth/mcp/schemas` with read-only schemas
  for `growth.get_status`, `growth.get_board`, `growth.list_cards`, and
  `growth.get_card`.
- The plugin exposes `POST /api/v1/growth/mcp/execute` with the
  workspace-local `.hermes-growth/access-key.txt` bearer for read-only bounded
  execution of those tools.
- The plugin includes `scripts/growth-mcp-wrapper.js`, a workspace-bound stdio
  wrapper that reads `.hermes-growth/config.json`, rejects model-provided
  workspace overrides, strips `workspace_id` from Gateway-facing tool schemas,
  and injects the bound workspace id into plugin HTTP execute calls.
- The Home AI workspace provisioning executor now materializes the Growth
  worker MCP file set from plugin source into
  `<root>/gateway-worker/growth-mcp` before profile rendering:
  `scripts/growth-mcp-wrapper.js` plus
  `src/mcp/growth-mcp-schemas.js`. Copying only the wrapper is invalid because
  the wrapper imports the schema module.
- The same executor mirrors the complete `.hermes-growth` binding into
  `/Users/<hm-user>/HermesWorkspace/.hermes-growth`, renders profile YAML from
  that worker-local mirror, then writes the rendered profile capabilities back
  to the Gateway manifest (`toolsets`, `mcpServers`, and `configPath`). This
  keeps worker selection, profile YAML, and selected-profile schema validation
  aligned.
- Development proof for `weixin_stephen` passed with real worker user
  `hm-weixin-stephen`: `tools/list` exposed local names `get_status`,
  `get_board`, `list_cards`, and `get_card`; `list_cards` returned 48 cards
  from `growth-plugin-sqlite`; and card summaries did not expose
  `instructionPreview`.
- Gateway profile/toolset smoke passed against the development manifest with
  `weixin_stephen:weixin_stephen:openai-codex:user:growth:min=1`.
- Final production model callables must use a single `mcp_growth_*` prefix.

## Development Visual Harness Notes

For iOS PWA visual checks against a local Home AI dev server:

- start Home AI with `HERMES_WEB_HOST=0.0.0.0` and open it from the simulator
  through the Mac LAN address;
- keep Growth itself on `127.0.0.1:4881`; Home AI resolves the plugin through
  the server-side manifest/proxy boundary;
- do not print owner keys or launch URLs in command output; authenticate the
  simulator by writing the normal `hermesWebKey` local storage/cookie through
  the debug API or by manual login;
- `embedded-plugin-shell` intentionally skips unrelated bottom-nav stability
  pre-sampling and can fall back to segmented shell/frame measurement when
  WebKit RemoteDebugger returns a transient `Unexpected EOF`.

## Development Data Rule

Production data may be copied into development only through an explicit backup
and bounded restore/readback path. Do not point development services directly at
production databases. Do not copy raw secrets into docs, tests, fixtures, or
handoffs.

## Production Gate

No production deploy is allowed until all touched stages have:

- focused unit/route tests;
- architecture boundary checks;
- plugin contract checks when host/plugin registration changes;
- development runtime smoke;
- iOS visual harness evidence for embedded UI changes;
- migration backup/readback evidence when data moves.
