# macOS Development To Production Deployment Contract

Last updated: 2026-06-08.

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
Development root: /Users/hermes-dev/HermesMobileDev
Development control user: xuxin
Production root: /Users/hermes-host/HermesMobile
Production app: /Users/hermes-host/HermesMobile/app
Production plugins: /Users/hermes-host/HermesMobile/plugins
```

The development user must not receive normal write access to production app or
plugin source directories. A deployment is a bounded production operation, not
a filesystem edit in the live tree.

## Supported Production Targets

The shared target paths are:

```text
home-ai app -> /Users/hermes-host/HermesMobile/app
codex-mobile-web -> /Users/hermes-host/HermesMobile/plugins/codex-mobile-web
  (Home AI embedded plugin variant only; independently deployed Codex Mobile
  Web instances are outside this production target contract unless they
  explicitly opt into Home AI embedded-plugin deployment)
email -> /Users/hermes-host/HermesMobile/plugins/email
finance -> /Users/hermes-host/HermesMobile/plugins/finance
growth -> /Users/hermes-host/HermesMobile/plugins/growth
healthy -> /Users/hermes-host/HermesMobile/plugins/healthy
note -> /Users/hermes-host/HermesMobile/plugins/note
wardrobe -> /Users/hermes-host/HermesMobile/plugins/wardrobe
```

Future plugins must use `/Users/hermes-host/HermesMobile/plugins/<plugin-id>`
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

Direct live edits such as opening `/Users/hermes-host/HermesMobile/app` or
`/Users/hermes-host/HermesMobile/plugins/<plugin>` as a normal Codex workspace,
changing files there, and then treating that as deployment are forbidden.

## Required Deploy Plan

Every deployment must have a concise plan before production writes:

```text
target: home-ai | plugin:<plugin-id>
source_path: /Users/hermes-dev/HermesMobileDev/...
production_path: /Users/hermes-host/HermesMobile/...
source_ref: git commit or dirty-tree description
changed_surface: static | node-service | plugin-service | launchd | data-repair
backup_path: /Users/hermes-host/HermesMobile/.../.deploy-backups/<timestamp>-<reason>
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

- `.git`, `.codex`, `.agent-context/archive`, `.agent-context/thread-handoffs`;
- `node_modules` unless the target project explicitly deploys vendored
  dependencies;
- raw secrets, access tokens, cookies, OAuth state, one-time keys, local caches,
  full logs, and database files unless the operation is an explicitly reviewed
  data migration;
- development-only `.env` files not named in the deploy plan.

The production-side sync must preserve production-owned runtime state. For
normal source deploys, do not overwrite:

- `/Users/hermes-host/HermesMobile/data`;
- plugin runtime data directories;
- workspace-local `.hermes-*` key/config directories;
- launchd plists unless the deploy plan is explicitly a launchd change.

The production sync must create a backup before replacing files. Backup names
should include UTC timestamp, target, and reason.
After sync, the central deploy script must restore the production target owner.
The default owner is `hermes-host:staff`; the Codex Mobile plugin uses
`xuxin:staff` because its production launchd service runs as `xuxin`.

## Restart Rules

Restart only what changed:

- Home AI Node service/provider/route changes: restart
  `system/com.hermesmobile.listener`.
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
  cd /Users/hermes-dev/HermesMobileDev/app
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
/Users/hermes-dev/HermesMobileDev/app/docs/PLATFORM_CONTRACTS/macos-dev-to-production-deployment-contract.md
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
/Users/hermes-dev/HermesMobileDev/plugins/<plugin-id>
```

The production target should be:

```text
/Users/hermes-host/HermesMobile/plugins/<plugin-id>
```

Plugin deployment scripts or plugin Codex threads should call the central Home
AI deploy script. The shared access shape is:

```text
--password-file <private-local-password-file>
--mac-root /Users/hermes-host/HermesMobile
--source <development-source-path>
--plugin <plugin-id>
--restart-label <plugin-launchd-label>
--health-url <plugin-loopback-health-url>
```

The current local command shape from the Home AI app workspace is:

```bash
npm run --silent deploy:macos -- --plugin <plugin-id> --json
npm run --silent deploy:macos -- --plugin <plugin-id> --restart-label <label> --health-url <url> --execute --password-file <private-local-password-file> --json
```

Growth first production install has one extra launchd bootstrap step because
`com.hermesmobile.plugin.growth` does not exist until the service is installed.
Use an explicit source-only sync first, then the shared installer from the Home
AI app workspace:

```bash
npm run --silent deploy:macos -- --plugin growth --source /Users/hermes-dev/HermesMobileDev/plugins/growth --restart none --sync-only --execute --password-file <private-local-password-file> --json
```

```bash
node scripts/install-growth-launchd-service.js --json
node scripts/install-growth-launchd-service.js --execute --bootstrap --password-file <private-local-password-file> --json
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

If the current shell is in a plugin workspace, call the Home AI script by
absolute path or change directory to the Home AI app workspace first:

```bash
cd /Users/hermes-dev/HermesMobileDev/app
npm run --silent deploy:macos -- --plugin <plugin-id> --source /Users/hermes-dev/HermesMobileDev/plugins/<plugin-id> --json
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
For plugin targets, the script excludes `data/` from source-to-production sync
and restores `productionOwner` after sync; data migration or repair is a
separate reviewed operation, not part of an ordinary plugin source deploy.

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
the rendered profile YAML.

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
