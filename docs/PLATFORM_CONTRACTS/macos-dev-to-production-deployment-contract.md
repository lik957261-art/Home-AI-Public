# macOS Development To Production Deployment Contract

Last updated: 2026-06-25.

## Purpose

This contract defines the shared Home AI deployment rule after macOS became the
primary development platform.

It applies to the Home AI host app and every embedded plugin project deployed
under the Mac production root. Plugin projects must follow this contract
instead of creating their own production write-access, SSH, sudo, backup, or
validation flows.

## Boundary

The development environment and production environment are separate security
domains:

```text
Development root: /Users/example/path
Development control user: xuxin
Production root: /Users/example/path
Production app: /Users/example/path
Production plugins: /Users/example/path
```

The development user must not receive normal write access to production app or
plugin source directories. A deployment is a bounded production operation, not
a filesystem edit in the live tree.

## Supported Production Targets

The shared target paths are:

```text
home-ai app -> /Users/example/path
codex-mobile-web -> /Users/example/path
  (Home AI embedded plugin variant only; independently deployed Codex Mobile
  Web instances are outside this production target contract unless they
  explicitly opt into Home AI embedded-plugin deployment)
email -> /Users/example/path
finance -> /Users/example/path
growth -> /Users/example/path
healthy -> /Users/example/path
moira -> /Users/example/path
movie -> /Users/example/path
music -> /Users/example/path
note -> /Users/example/path
wardrobe -> /Users/example/path
Android APK public artifacts -> Home AI public /android/ directory served at
  https://wardrobe-xuxin.synology.me:8555/android/
```

Future plugins must use `/Users/example/path<plugin-id>`
unless a different production path is recorded in the plugin manifest and in
`docs/RUNBOOKS/macos-production-access.md`.

## Deployment Authority

Codex may prepare deployment material from the development worktree, but the
production write must happen only through an explicit bounded deployment step
that uses:

- the shared Mac production access runbook;
- a selected source path and selected production target;
- a pre-deploy backup;
- a reviewed file sync/install command executed with temporary production
  elevation;
- a restart decision based on the changed service surface;
- post-deploy validation.

Direct live edits such as opening `/Users/example/path` or
`/Users/example/path<plugin>` as a normal Codex workspace,
changing files there, and then treating that as deployment are forbidden.

Plugin workspaces may run this shared deploy script in plan mode for their own
plugin targets, but routine production execute/readback is owned by the
dedicated `Home AI Deploy` Codex thread. A plugin deployment remains
plugin-prepared when the deploy target is `--plugin <plugin-id>`, the source
changes are plugin-local, and the validation is plugin health, embedded
launch/proxy, MCP schema, or plugin data/product smoke evidence. The plugin
thread must complete implementation, tests, commit/push when applicable,
deploy plan, and safety/readback expectations before sending one deployment
card to `Home AI Deploy`.

Routine plugin deploy cards to the ordinary Home AI implementation thread are a
routing error. The ordinary Home AI receiver must return `redirected` or
`blocked` with the exact `Home AI Deploy` target and required card fields. The
`Home AI Deploy` thread is the only Home AI Codex lane expected to run central
plugin deploy execute/readback on behalf of plugins. It must not edit plugin
business code, and it must return a terminal task card to the source plugin
thread after deployment is completed, blocked, redirected, rejected, or
partially completed.

The deployment lane is a live operational queue, not a one-shot completed
conversation. `Home AI Deploy` must be discoverable and non-terminal before it
is used as a routine deployment target. A completed, archived, deleted, hidden,
or otherwise non-runnable deploy thread is a platform routing defect: ordinary
Home AI must not execute the plugin deployment as a workaround, and the deploy
lane must be repaired or recreated before routine plugin deployments are routed
there again.

Plugin deployment cards must not expose or require a sudo password file,
password contents, SSH private key, or local operator secret path. If the
central deploy script needs local elevation, that credential boundary is
private to the Home AI deployment thread/runtime. The card may include the
plan command, execute command shape without `--password-file`, source commit,
dirty-state proof, restart label, health URL, deploy reason, and bounded
readback expectations.

A plugin deployment card must not be a terminal return receipt. If the title
starts with `Return:`, the body declares `Return policy: terminal receipt`, or
the body is primarily a completed/blocked/redirected/partially-completed
return, that card is a source-thread receipt and cannot satisfy deployment
request closure. The sender must create a separate deployment request card for
`Home AI Deploy` with `cardKind=plugin_deployment` when the interface supports
structured card kinds. Home AI task-card senders must reject receipt-shaped
deployment cards before posting them to `Home AI Deploy`.

Escalate to the ordinary Home AI implementation thread only when the missing
work is host/platform owned: Home AI source edits, deploy-script capability
changes, same-origin proxy or launch-token bugs, workspace binding/provisioning
bugs, Gateway schema or worker-profile changes, shared policy changes, or a
production permission failure that proves `Home AI Deploy` cannot execute the
existing bounded deploy contract.

If a plugin thread changes code but then discovers that deployment is blocked
by a host/platform prerequisite, it must not end silently. It must return a
`blocked`, `redirected`, or `partially_completed` card to the source thread and,
when the owner is Home AI, send a Home AI task card before stopping. The card
must name the blocking layer, list the local commits or changed files waiting
behind the blocker, state why deploying now would be unsafe, and identify the
validation required after the owner repairs the prerequisite. This rule applies
to launchd provisioning, workspace key/hash binding, central deploy-script
gaps, shared visual/debug lanes, Gateway/MCP profile state, and production
permission failures. Source changes waiting behind such a blocker are not
closure until the owner receives the card and either deploys safely or returns
a bounded blocked status.

## Required Deploy Plan

Every deployment must have a concise plan before production writes:

```text
target: home-ai | plugin:<plugin-id>
source_path: /Users/example/path
production_path: /Users/example/path
source_ref: git commit or dirty-tree description
changed_surface: static | node-service | plugin-service | launchd | data-repair
backup_path: /Users/example/path<timestamp>-<reason>
restart_labels: launchd labels to restart, or none
validation: commands/smokes to run after deploy
rollback: restore backup and restart labels
```

If the source tree is dirty, the deploy plan must name the dirty files being
deployed. It must not silently include unrelated dirty files.
The plan must also expose `rsyncExcludes` and `productionOwner`; plugin plans
must include `data/` in `rsyncExcludes` so runtime databases, attachment
stores, and other plugin-owned user data are backed up but not overwritten or
deleted by a normal source deploy.

## Packaging And Sync Rules

Deployment packages or sync manifests must be generated from the development
tree. They must exclude:

- `.git`, `.codex`, `.codegraph`, `.agent-context/archive`,
  `.agent-context/thread-handoffs`;
- `node_modules` unless the target project explicitly deploys vendored
  dependencies;
- `.venv` and other production-owned virtual environments unless the operation
  is an explicitly reviewed runtime reinstall; source deploys must not delete a
  plugin LaunchDaemon's interpreter;
- raw secrets, access tokens, cookies, OAuth state, one-time keys, local caches,
  full logs, and database files unless the operation is an explicitly reviewed
  data migration;
- development-only `.env` files not named in the deploy plan.

The production-side sync must preserve production-owned runtime state. For
normal source deploys, do not overwrite:

- `/Users/example/path`;
- plugin runtime data directories;
- production-owned virtual environments such as plugin `.venv/` directories;
- workspace-local `.hermes-*` key/config directories;
- launchd plists unless the deploy plan is explicitly a launchd change.

The production sync must create a backup before replacing files. Backup names
should include UTC timestamp, target, and reason.
Pre-deploy backup rsync must not reuse the source sync exclude list. It may
exclude local tooling metadata such as `.git`, `.codex`, `.codegraph`, and
`.agent-context`, but it must still back up production-owned plugin `data/`,
`runtime/`, and `.venv/` directories before the source sync excludes those
paths from replacement.
Mac production deploy backups under
`/Users/example/path` are rollback points, not
long-term archives. The central deploy script must apply the same retention
policy to Home AI and every plugin target: keep only the most recent three UTC
calendar days for each target, and within each target/day keep only that day's
latest backup. The current deployment backup is always preserved. If an
operator needs to retain an older rollback point, move or copy it to an
explicit archive location outside `backups/deploy` before it ages out.
After sync, the central deploy script must restore the production target owner.
The default owner is `hermes-host:staff`; the Codex Mobile plugin uses
`xuxin:staff` because its production launchd service runs as `xuxin`.
Codex Mobile deployments must also keep launchd stdout/stderr in the service
user's runtime root: `/Users/example/path`. The deploy script
must ensure the two log files are `xuxin:staff` mode `600`, set
`com.hermesmobile.plugin.codex-mobile` `StandardOutPath` / `StandardErrorPath`
to those runtime logs, and align Codex Mobile plist environment with the active
Codex Mobile profile. A no-restart Home AI deploy may perform that bounded
plist repair but must not reload the Codex Mobile LaunchDaemon unless
`com.hermesmobile.plugin.codex-mobile` is explicitly present in the deploy
plan's restart labels. Otherwise launchd can fail before Node starts with
`EX_CONFIG` if it opens a shared log path whose owner has drifted back to
`hermes-host`, while an unrelated Home AI no-restart deploy can avoid
disconnecting active Codex Mobile sessions.

## Android APK Release Rules

Android native shell release work is not complete when the Android workspace
only builds a local APK under `/Users/example/path`.
Release completion requires all of the following:

1. Build the Android APK.
2. Update the local Android `dist/android-update.json` manifest.
3. Sync both the APK file, for example
   `dist/HomeAI-Android-native-shell-debug-20260621.apk`, and
   `dist/android-update.json` into the Home AI public `/android/` directory
   behind `https://wardrobe-xuxin.synology.me:8555/android/`.
4. HTTPS-read back
   `https://wardrobe-xuxin.synology.me:8555/android/android-update.json`.
5. HTTPS-read back the published APK URL named by that manifest.
6. Verify the online manifest `versionCode` is greater than the previously
   installed/served package and that `versionName`, `size`, and `sha256` match
   the published APK bytes.

Every Android APK version bump must update the online manifest fields
`versionCode`, `versionName`, `size`, `sha256`, and the APK URL or filename
when the filename changes. If the online `android-update.json` still reports
the old `versionCode`, installed Android shells will not prompt for an update
even if `/Users/example/path` contains a newer APK.

Android APK release cards should report bounded readback only: manifest URL,
APK URL or basename, old/new `versionCode`, `versionName`, `size`, `sha256`,
and readback status. Do not paste access keys, cookies, private paths beyond
documented release paths, or long server logs.

## Restart Rules

Restart only what changed:

- Home AI Node service/provider/route changes: restart
  `system/com.hermesmobile.listener`; if the deployment touches Automation,
  scheduler configuration, or the central deploy script, the shared deploy path
  also installs/validates `system/com.hermesmobile.cron`.
- Home AI static-only changes: restart only if the static serving path or
  Service Worker rollout requires it; otherwise validate the served version.
- Codex Mobile Web plugin service changes: restart
  `system/com.hermesmobile.plugin.codex-mobile`.
- Other plugin service changes: restart the plugin's recorded launchd label or
  service command.
- Gateway profile, MCP schema, Skill preload, or worker policy changes: restart
  or reload only the affected Gateway/profile services and run schema/toolset
  validation.
- Data repair: prefer quiescence, backup, bounded repair, readback, and only
  then service restart if loaded runtime state can be stale.

Do not use broad restarts as a substitute for identifying the affected service.

## Validation Rules

Every deploy must prove the served production behavior, not only local tests.
Use the smallest sufficient set:

- syntax and focused tests in the development source before deploy;
- production status smoke for Home AI deploys;
- platform closure/profile/ACL checks when runtime, permissions, Gateway,
  workspace provisioning, plugin authorization, or production path rules change;
- plugin health/version endpoint after plugin service deploys;
- embedded launch/proxy smoke for iframe plugin changes;
- plugin data readback for plugin-owned business behavior;
- MCP schema and selected Gateway callable validation when plugin model tools
  change;
- mobile visual/Appium smoke when embedded mobile layout, gestures, or PWA
  navigation changes.
  On Mac, use the Home AI live iOS PWA debug server for the interactive
  reproduce/fix loop before recording final bounded evidence:

  ```bash
  cd /Users/example/path
  npm run ios:pwa:debug
  ```

  The default local UI is `http://127.0.0.1:19073/`. It provides a fast
  Simulator screenshot loop and native actions independent of Appium WebView
  attach latency; `--stream wda-mjpeg --mjpeg-server-port <port>` enables the
  faster WebDriverAgent MJPEG visual loop when needed. Appium/WebView state is
  an optional deeper diagnostic path.
  Do not point multiple plugin debug sessions at the same Simulator UDID. For
  parallel plugin validation, run one live debug server per Simulator with a
  unique `--port`, `--udid`, `--wda-local-port`, and
  `--mjpeg-server-port`. The live server requires a debug lane lease for
  mutating operations and WebView/Appium deep reads; `debug_lane_locked` means
  the lane is occupied and the plugin thread must allocate a separate
  Simulator/debug server before continuing.
  The active shared visual-toolchain correction is
  `20260610-visual-toolchain-shared-lane`; all Home AI-hosted plugin workspaces
  must consume it through the central contract and must not vendor local
  Appium, Simulator, screenshot, WebView attach, or lane-lock logic.
  Local iOS Simulator validation of a Home AI dev server must not assume
  `127.0.0.1:<home-ai-port>` maps to the Mac host. Bind the dev server with
  `HERMES_WEB_HOST=0.0.0.0` and pass
  `--app-url http://<mac-lan-ip>:18797/?source=pwa` to the harness. Plugin
  services can remain loopback-bound when the Home AI host reaches them
  through the plugin manifest/proxy. All plugin teams must use the central
  Appium start script; it owns backgrounding, terminal `SIGHUP`/`SIGINT`
  isolation, and stale-session replacement for shared visual lanes.
  If a toolchain failure is found during a plugin deployment, fix the shared
  Home AI live-debug, visual-harness, Appium-start, or lane-lease code first,
  update the central visual contract, and then rerun the plugin validation from
  the Home AI command. Do not deploy plugin-local copies of the repaired
  Appium, Simulator, screenshot, WebView attach, or lane-lock behavior.

Validation output recorded in handoff or docs must be bounded metadata only.
Do not record raw keys, launch tokens, cookies, full logs, private user data,
or full prompts.

## Plugin Requirements

Every plugin project must read this contract before any Mac production deploy.
If the plugin thread starts from a plugin workspace, it must still load the
central Home AI contract from:

```text
/Users/example/path
```

The plugin-local `AGENTS.md`, `.agent-context/PROJECT_CONTEXT.md`,
`.agent-context/HANDOFF.md`, or `docs/HOME_AI_PLATFORM_CONTRACT.md` should
point to this central file instead of copying deployment rules. Copied rules
are stale when they diverge from this contract.

Every plugin project must expose or document:

- development source path;
- production target path;
- service label or restart command;
- health/version check;
- embedded `?embed=hermes` launch/proxy check when it is an iframe plugin;
- MCP/schema validation when it provides model tools;
- data readback check for changed business behavior;
- rollback command or backup restore path.

For standard Mac development workspaces, the source path should be:

```text
/Users/example/path<plugin-id>
```

The production target should be:

```text
/Users/example/path<plugin-id>
```

Plugin deployment scripts or plugin Codex threads should call the central Home
AI deploy script in plan mode. The plugin-visible deployment request shape is:

```text
--plugin <plugin-id|all>
--source <development-source-path>
--restart-label <plugin-launchd-label>
--health-url <plugin-loopback-health-url>
--reason <deploy-reason>
```

The current plugin-visible local command shape from the Home AI app workspace
is:

```bash
npm run --silent deploy:macos -- --plugin <plugin-id> --json
npm run --silent deploy:macos -- --plugin all --json
```

Executable deploys run a sudo authentication preflight before the first
production filesystem mutation. The password-file resolution order may include
an explicit `--password-file`, `HOMEAI_MAC_SUDO_PASSWORD_FILE`, then local
operator fallbacks under `~/.homeai/macos-sudo-password` and
`~/.homeai-qa/sudo-password`, but that is private to the `Home AI Deploy`
thread/runtime and central operators. Plugin task cards must not include these
paths or environment values. When no passwordless helper/sudoers path is
installed and no valid password file is found, the script fails with
`sudo_authentication_required`. When all supplied or discovered password files
are rejected, it fails with `sudo_authentication_failed`. These are operator
authentication boundary failures, not plugin source or production path
failures. The `Home AI Deploy` thread or a central operator must repair the
local operator credential/helper state before retrying; plugin threads must not
repeatedly run a deploy that has already failed authentication.

The `all` plugin target expands to the bounded known plugin service roots:
Codex Mobile Web, Email, Finance, Growth, Healthy/Health, Moira, Movie, Music,
Note, and Wardrobe.
It uses the central script's default launchd labels and loopback manifest
smokes. It does not accept a single `--source`, `--restart-label`, or
`--health-url` override because those values are per plugin. Operators may use
`--plugin health` as a readable alias; the actual source and production
directory remain `plugins/healthy`.

Normal plugin deployments include required frontend entry proof files in the
same production hash validation used by Home AI static deploys. Email must
include `dist/web/index.html`; Codex Mobile Web, Growth, Movie, and Note must
include their `public/index.html` entries. If a required proof file is missing
from the development source, the deployment plan must fail before writing
production. This prevents a plugin service from launching with a missing iframe
entry and presenting a black embedded surface. The `--sync-only` first-install
path keeps its existing source-only semantics and does not run runtime/hash
validation.

Codex Mobile Web has an additional selected shared-mux runtime refresh
contract. When a Codex Mobile deployment changes mux bridge/runtime files such
as `codex-app-server-mux.js`, the macOS restart helper, or the shared-chain
restart service, the central deploy script must refresh only the selected
profile's shared mux after source sync and plugin host restart. The refresh may
read only the selected profile endpoint file, may stop only the endpoint's
recorded `pid` / `childPid`, and must first verify the process command line is
an expected `codex-app-server-mux` or `codex app-server` command. It must not
scan or kill unrelated profile muxes, and it must not use broad process
selectors such as `killall`, `pkill`, or `pgrep`. File parity is not sufficient
runtime proof for this step. The deploy script records bounded selected-mux
repair state before sync and marks it completed only after the selected endpoint
refresh succeeds. A retry after an incomplete post-sync selected-mux refresh
must run the selected endpoint refresh even when `changedFileCount=0`. Deploy
reasons that explicitly mention selected-mux, mux-runtime, mux-metrics, or
shared-mux also force this selected endpoint refresh.

Growth first production install has one extra launchd bootstrap step because
`com.hermesmobile.plugin.growth` does not exist until the service is installed.
Use an explicit source-only sync first, then the shared installer from the Home
AI app workspace:

```bash
npm run --silent deploy:macos -- --plugin growth --source /Users/example/path --restart none --sync-only --execute --json
```

```bash
node scripts/install-growth-launchd-service.js --json
node scripts/install-growth-launchd-service.js --execute --bootstrap \
  --gateway-authoring-endpoint http://127.0.0.1:18751/v1/responses \
  --gateway-authoring-access-token-path <gateway-worker-token-file> \
  --gateway-authoring-protocol responses \
  --gateway-authoring-model gpt-5.5 \
  --gateway-authoring-reasoning-effort xhigh \
  --gateway-planner-model gpt-5.5 \
  --gateway-planner-reasoning-effort xhigh \
  --gateway-evaluation-endpoint http://127.0.0.1:18751/v1/responses \
  --gateway-evaluation-access-token-path <gateway-worker-token-file> \
  --gateway-evaluation-protocol responses \
  --json
```

`--sync-only` is allowed only for plugin first-install source sync before a
launchd label exists. It performs backup, source rsync, and ownership restore,
but intentionally skips restart and runtime validation. It is not a deployment
closure state. After Growth bootstrap, the operator must run Growth loopback
manifest/status smoke, plugin launch/proxy smoke, and MCP/Gateway callable
smoke before production is considered deployed.

The installer writes only the LaunchDaemon plist and the registration-key file
when missing. It references `GROWTH_REGISTRATION_KEY_PATH` and
`GROWTH_HOME_AI_ACCESS_KEY_PATH`; it must not print raw key values. It also
sets `GROWTH_DATA_OWNER=plugin` and points `GROWTH_LEARNING_DB_PATH` at the
plugin production data directory, so first install must include plugin-owned
SQLite import/readback or rollback evidence. After this first bootstrap, normal
Growth plugin deploys can use the central deploy script with the default
`com.hermesmobile.plugin.growth` restart label.

Moira first production install follows the same source-sync-first pattern, but
it does not create a plugin registration key because the initial production
scope is Owner-only and the Home AI host uses its server-side Owner web key for
the Owner launch exchange:

```bash
npm run --silent deploy:macos -- --plugin moira --source /Users/example/path --restart none --sync-only --execute --json
node scripts/install-moira-launchd-service.js --json
node scripts/install-moira-launchd-service.js --execute --bootstrap --json
```

Later Moira source deploys use `npm run --silent deploy:macos -- --plugin
moira ...` with the default `com.hermesmobile.plugin.moira` restart label and
`http://127.0.0.1:4174/api/v1/hermes/plugin/manifest` health smoke.

Movie first production install follows the Owner-only embedded-app pattern. The
source workspace is a top-level sibling under the development root, not
`plugins/movie`, but the central deploy script still writes to the standard
production plugin target:

```bash
npm run --silent deploy:macos -- --plugin movie --source /Users/example/path --restart none --sync-only --execute --json
node scripts/install-movie-launchd-service.js --json
node scripts/install-movie-launchd-service.js --execute --bootstrap --json
```

The Movie installer starts `com.hermesmobile.plugin.movie` on
`127.0.0.1:4195` as `hermes-host`, runs `src/server.js`, stores production data
under `/Users/example/path`, and writes logs to
the shared production log directory. It must not write Movie device, NAS, or
projector credentials into the plist, Home AI docs, or Home AI source. It
preflights port `4195` and fails if the port is held by a non-production
process, because otherwise health checks could hit a development Movie server.
Later Movie source deploys use `npm run --silent deploy:macos -- --plugin
movie ...` with the default `com.hermesmobile.plugin.movie` restart label and
`http://127.0.0.1:4195/api/v1/hermes/plugin/manifest` health smoke.

Music first production install follows the Owner-only special-plugin pattern.
The source workspace may live outside the standard plugin checkout root during
early development, but the central deploy script must still write to the
standard production target:

```bash
npm run --silent deploy:macos -- --plugin music --source /Users/example/path --restart none --sync-only --execute --json
node scripts/install-music-launchd-service.js --json
node scripts/install-music-launchd-service.js --execute --bootstrap --json
```

Before bootstrap, build the Music web bundle and install production
dependencies in the synced production plugin directory. The installed
LaunchDaemon runs the Roon-first service entry
`src/roon-first-server.js` on the existing Music plugin port and registration
path. The legacy service remains available in source as `src/server.js` /
`npm run service:legacy`, but it is not the production default. Later Music
source deploys use `npm run --silent deploy:macos -- --plugin music ...` with
the default `com.hermesmobile.plugin.music` restart label and
`http://127.0.0.1:4891/api/v1/hermes/plugin/manifest` health smoke.
The Music plist includes bounded runtime paths for Roon state, listening
ledger, local audio staging, and the private SMB direct config file. Private
audio path remaps are injected through `MUSIC_AUDIO_PATH_REMAPS` or
`--audio-path-remaps`; they must not be committed to Home AI source or docs.

Growth plugin-manager grants also require the Home AI listener LaunchDaemon to
set:

```text
HERMES_MOBILE_GROWTH_PLUGIN_MANIFEST_URL=http://127.0.0.1:4881/api/v1/hermes/plugin/manifest
HERMES_MOBILE_PLUGIN_GROWTH_MANIFEST_URL=http://127.0.0.1:4881/api/v1/hermes/plugin/manifest
HERMES_MOBILE_GROWTH_PLUGIN_OWNER_KEY_PATH=/Users/example/path
```

Without the owner key path, Home AI can display the Growth manifest but
workspace grants fail with `growth_owner_key_missing`, so Gateway/MCP closure
cannot be claimed.

If the current shell is in a plugin workspace, call the Home AI script by
absolute path or change directory to the Home AI app workspace first:

```bash
cd /Users/example/path
npm run --silent deploy:macos -- --plugin <plugin-id> --source /Users/example/path<plugin-id> --json
```

The Home AI app deployment command shape is:

```bash
node scripts/deploy-macos-production.js --target home-ai --json
npm run --silent deploy:macos -- --target home-ai --json
```

The default mode is plan-only. A production write requires `--execute`. The
script uses the same contract fields above, creates the backup first, applies
the controlled `rsync`, restarts only selected launchd labels, and runs bounded
validation. Listener and health validations retry briefly after restart so a
normal launchd warm-up does not produce a false failed deployment. Plugin
projects may wrap this script, but must not bypass it with a plugin-private
production write path.
For plugin targets, the script excludes `data/` and production-owned runtime
dependency directories such as `.venv/` from source-to-production sync and
restores `productionOwner` after sync; data migration, runtime reinstall, or
repair is a separate reviewed operation, not part of an ordinary plugin source
deploy.

Plugin `--execute` is intentionally stricter than plan mode. Except for plugins
with a central default restart label, a plugin production write must provide at
least one explicit production verification path:

- `--restart-label <label>` for the affected plugin service; or
- `--health-url <url>` for a bounded loopback health/version check.

When an MCP/toolset surface changes, the plugin deployment record must also
include the plugin MCP schema check and the selected Gateway callable-schema
check. A plugin service schema alone is not enough for production closure.
On macOS, also verify that the workspace provisioning executor materialized the
plugin MCP worker file set under `<root>/gateway-worker/<plugin>-mcp`, mirrored
the complete `.hermes-<plugin>` binding into the target worker home, and updated
the selected worker manifest `toolsets`, `mcpServers`, and `configPath` from
the rendered profile YAML. For Moira, ordinary `--plugin moira` source deploys
also mirror the plugin-owned MCP wrapper files from `<root>/plugins/moira` into
`<root>/gateway-worker/moira-mcp`; this is the productized replacement for any
hand-copied Gateway worker MCP asset refresh.

They must not require per-plugin SSH aliases, copied private keys, interactive
sudo prompts, or direct production workspace write access.

## Failure Handling

If a production write or validation step fails:

1. Stop further writes.
2. Preserve the backup.
3. Capture bounded failure evidence.
4. Decide whether to roll back from the backup or complete a narrow forward
   fix.
5. Re-run the same production validation after rollback or forward fix.

Do not repair a failed plugin deployment by falling back to Owner credentials,
global plugin keys, or direct writes to live production directories.

## Handoff Requirements

After a material deployment or deployment-rule change, update
`.agent-context/HANDOFF.md` with:

- target and source ref;
- changed files or package identity;
- backup path;
- restart labels;
- validation results;
- rollback path;
- known residual risks or next steps.

If the deployment rule itself changes, update this contract and the Mac
production access runbook together.
