# Public Upgrade Loop

Last updated: 2026-07-01.

This note defines the maintained online-upgrade closure for a deployed Home AI
instance operated from public/source repositories. It is intentionally narrower
than fresh install: it updates existing clean source checkouts, deploys changed
runtime roots, and validates provider/runtime closure. It is not a secret
bootstrapper and does not copy private provider credentials.

## Entrypoint

Public deployment is a two-sided loop:

- maintainer release closure creates and validates a public export from the
  private source tree;
- operator upgrade closure runs on the deployed public instance and
  fast-forwards Home AI, plugins, Hermes Agent, dependencies, deployment, and
  provider validation.

Maintainer release closure uses:

```bash
npm run release:public -- --json
```

Default mode is plan-only. To create a local public export and run the public
source validation suite:

```bash
npm run release:public -- --execute --out /tmp/Home-AI-Public-export --json
```

Syncing the verified export into a local public repository checkout is an
additional explicit gate:

```bash
npm run release:public -- \
  --execute \
  --out /tmp/Home-AI-Public-export \
  --public-repo /path/to/Home-AI-Public \
  --sync-public-repo \
  --commit-public \
  --push-public \
  --commit-message "Publish Home AI public release" \
  --json
```

`--push-public` is intentionally accepted only with `--commit-public` and
`--sync-public-repo`. This prevents a maintainer from accidentally treating a
stale public checkout or older commit as the current release closure.

Operator upgrade closure uses:

```bash
npm run upgrade:public -- --json
```

Default mode is plan-only. Use `--execute` only from an Owner/operator context:

```bash
npm run upgrade:public -- --execute --reason public-upgrade --json
```

## Third-Party Operator Quickstart

For an already installed third-party macOS Home AI instance, the operator first
updates the Home AI public source checkout. This ensures the machine is running
the newest upgrade script before it mutates production. Use the app source
checkout recorded during install; the default public install path is:

```bash
cd /Users/example/path
git fetch origin
git pull --ff-only
```

If the public repository was cloned with SSH instead of HTTPS, the operator's
SSH agent must be able to read every repository in
`config/public-plugin-sources.json` that is marked as requiring operator
authentication.

Then run a plan. This does not mutate production:

```bash
npm run upgrade:public -- \
  --root /Users/example/path \
  --clone-missing-plugins \
  --adopt-non-git-sources \
  --update-hermes-agent \
  --install-dependencies \
  --install-hermes-agent-dependencies \
  --force-closure-validation \
  --allow-provider-auth-pending \
  --reason public-upgrade-$(date +%Y%m%d) \
  --json
```

If the plan returns `ok:true` with the expected clone, dependency, deploy,
Hermes Agent, and closure-validation actions, run the same command with
`--execute`:

```bash
npm run upgrade:public -- \
  --root /Users/example/path \
  --clone-missing-plugins \
  --adopt-non-git-sources \
  --update-hermes-agent \
  --install-dependencies \
  --install-hermes-agent-dependencies \
  --force-closure-validation \
  --allow-provider-auth-pending \
  --reason public-upgrade-$(date +%Y%m%d) \
  --execute \
  --json
```

Use `--allow-provider-auth-pending` only for infrastructure validation before
provider credentials are configured. After the operator has configured provider
credentials, rerun without that flag so model/profile closure is strict.

If Home AI was installed into a non-default root, replace
`/Users/example/path` with that root. If Node, npm, or Python are
not on the default PATH, pass explicit `--node-command`, `--npm-command`, and
`--python-command` values. Python must be 3.12 or newer for Hermes Agent
runtime repair.

The command must not print or store raw provider credentials, access keys,
cookies, OAuth tokens, or plugin private payloads. Provider credentials remain
operator-managed runtime inputs; the public upgrade loop updates source,
dependencies, deployment, Hermes Agent, and closure evidence only.

Before asking another deployed machine to mutate production, run the published
public-repo rehearsal from any maintainer/operator machine with network access:

```bash
npm run rehearse:public-upgrade -- --json
npm run rehearse:public-upgrade -- --execute --json
```

The rehearsal clones the published Home AI public repository into a temporary
root, runs source-only public preflight, then runs two target-side
`upgrade:public` plans:

- without `--clone-missing-plugins`, missing plugin source roots must fail
  closed with bounded missing-source blockers;
- with `--clone-missing-plugins`, the plan must expose clone/deploy actions,
  keep Movie marked `operatorAuthenticated`, and include closure validation.
- with installed public-export or bundle source directories that are present but
  not Git checkouts, the plan must fail closed until `--adopt-non-git-sources`
  is explicit; with that gate, the plan must expose adopt/deploy/closure
  actions.
- with a missing Hermes Agent managed runtime, the plan must fail closed until
  the explicit Hermes Agent runtime repair gate is present; with that gate, the
  plan must expose runtime repair and closure-validation actions.

The rehearsal is source/plan-only. It does not pass `--execute` to
`upgrade:public`, does not touch `/Users/example/path`, and does
not read or print provider keys, OAuth state, access keys, cookies, launch
tokens, or plugin private payloads.

The Home AI Self-Improving Loop treats this as a daily smoke. The central
deploy/upgrade closure gate is
`docs/PLATFORM_CONTRACTS/deploy-upgrade-lane-closure-contract.md`; focused
checks are:

```bash
node scripts/homeai-install-upgrade-canary.js --execute --json
node tests/deploy-upgrade-lane-closure-service.test.js
node tests/deploy-upgrade-lane-closure-smoke.test.js
node scripts/deploy-upgrade-lane-closure-smoke.js --json
```

The install/upgrade canary is the maintained aggregate entrypoint for the
source-safe portion of one-command install and public upgrade closure. Plan mode
is:

```bash
npm run canary:install-upgrade -- --json
```

Source-safe execution is:

```bash
npm run canary:install-upgrade -- --execute --json
```

It aggregates public install source preflight, macOS fresh-install rehearsal,
installer phase coverage, operator closure checklist, public upgrade rehearsal
plan, deploy/upgrade lane closure smoke, plugin-provisioning coverage, and the
Runtime SLO audit. It is intentionally not a production mutation command and
does not run network clone rehearsal unless the explicit
`--execute-public-rehearsal` gate is present.

The canary is also the source-safe phase ledger for first-machine deployment
and later one-command upgrade. Version `20260701-install-upgrade-canary-v2`
fails closed unless the maintained phase set covers source preflight, initial
Owner/key bootstrap, Home AI install, Hermes Agent runtime, Provider ingress,
plugin registration, Gateway profile/tool schema, plugin MCP/schema smoke,
public upgrade rehearsal, and production closure readback. Each phase declares
bounded evidence keys and closure readbacks; reports must not include raw
secrets, provider payloads, private plugin data, or command logs.

When a real rehearsal output file is available, validate the same Provider,
Hermes Agent, source-adoption, clone/deploy, and closure-validation coverage
with:

```bash
node scripts/deploy-upgrade-lane-closure-smoke.js \
  --rehearsal-json /path/to/rehearsal.json \
  --json
```

When a new Mac is reachable over SSH, use the remote deployment smoke before
attempting a mutating install or upgrade:

```bash
npm run remote:public-deploy-smoke -- --ssh-target <macbook-air-ssh-alias> --json
npm run remote:public-deploy-smoke -- --ssh-target <macbook-air-ssh-alias> --execute --json
npm run remote:public-deploy-smoke -- --ssh-target <macbook-air-ssh-alias> --execute --cycle-install --json
```

The default execute mode is still sandboxed. It creates a temporary root under
`/tmp` or `/var/tmp` on the target Mac, clones the published public Home AI
repository, runs source preflight, runs macOS fresh-install rehearsal, and runs
public upgrade rehearsal. It deletes the temporary root unless
`--keep-remote-temp` is explicit. It does not create macOS service users,
install LaunchDaemons into `/Library/LaunchDaemons`, run `upgrade:public
--execute`, restart services, or write provider credentials.

The remote smoke does not require Node/npm to be preinstalled on a new Mac. If
they are missing, it downloads the configured Node runtime version into the
remote temp root and prepends only that temp `runtime/bin` for the smoke
session.

If the published Home AI repository is private, run the remote smoke with the
SSH repository URL and SSH agent forwarding from the operator machine:

```bash
npm run remote:public-deploy-smoke -- \
  --ssh-target <macbook-air-ssh-alias> \
  --ssh-option -A \
  --public-repo-url git@github.com:pentiumxp/Home-AI-Public.git \
  --execute --cycle-install --json
```

The remote smoke exports that same repository URL as
`HOMEAI_PUBLIC_REPOSITORY_URL` for nested `upgrade:public` rehearsals, so the
Home AI source status check does not fall back to the manifest HTTPS URL and
prompt for GitHub credentials on the target Mac.

For a first end-to-end MacBook Air validation, add `--run-guided-install` to
also execute the installer guided automatic phases inside the same remote
sandbox root. A real production upgrade remains a separate operator action and
requires `--execute-production-upgrade --production-root <root>`, which should
only be used after the sandbox smoke passes and the operator has confirmed the
target root and credential boundary. When that production upgrade is run over
SSH and the target does not have passwordless sudo, pass an explicit local
`--sudo-password-file <path>`. The remote smoke copies that file to the current
remote `/tmp` smoke root with mode `0600`, exports only the remote temporary
path as `HOMEAI_MAC_SUDO_PASSWORD_FILE`, and removes it during normal cleanup.
The local password-file path and password contents must not appear in JSON
reports, task cards, or logs.

Remote production upgrades do not initialize Git metadata inside existing
production runtime plugin directories. They clone plugin sources into the
current remote smoke source root and deploy from those checkouts through the
normal macOS deploy contract. This avoids requiring the SSH operator account to
write service-owned runtime directories such as `<root>/plugins/*`.

Use `--cycle-install` for first-machine acceptance. It runs the guided install
inside the sandbox target root, deletes that target root, and runs the guided
install again. This proves the one-command install path can recover from a
blank machine state without leaving the operator to manually repair stale
partial files. The cycle still remains sandboxed unless
`--execute-production-upgrade` is also explicit.

Guided install and cycle-install phases keep the full installer JSON under the
remote temp root and return only bounded summary fields to the remote smoke
report. This keeps large install plans from masking the real pass/fail state
while preserving the full per-phase report for same-session diagnosis when
`--keep-remote-temp` is used.

When `homeai-public-remote-deploy-smoke.js` is explicitly run with
`--execute-production-upgrade`, the production `upgrade:public --execute`
phase is launched through a detached remote runner. The runner writes
`production-upgrade.stdout`, `production-upgrade.stderr`, and
`production-upgrade.status` under the remote temp root, and the local smoke
then opens a second SSH read to parse those files. This prevents long plugin
deploy output or an interrupted SSH stdout channel from turning a completed
remote upgrade into a false `jsonParsed:false` failure while preserving the
real upgrade exit status and bounded error summary.

The fresh-install rehearsal and the guided sandbox install use separate roots
under the remote temp directory. Rehearsal artifacts must not pre-populate the
install target root, because the installer intentionally refuses to overwrite a
non-empty app target.

Home AI Self-Improving Loop collects this rehearsal as the
`public_upgrade_rehearsal` self-check signal. Production collection runs
`homeai-public-upgrade-rehearsal.js --execute --json` by default; if the
published public repository cannot be cloned, source preflight fails, missing
plugin sources stop failing closed, the explicit clone gate stops producing
clone/deploy/closure-validation actions, or Movie loses its
`operatorAuthenticated` marker, AI Ops receives a bounded self-check diagnostic
eligible for the strict self-check auto-dispatch gate. The self-loop still does
not run `upgrade:public --execute`, restart services, or deploy code.

Supported execution gates:

- `--clone-missing-plugins`: clone missing plugin sources from
  `config/public-plugin-sources.json`;
- `--adopt-non-git-sources`: convert present public-export or bundle source
  directories into Git checkouts in place, without deleting runtime-state
  directories such as `data/`, `logs/`, `tmp/`, or `node_modules/`; this gate is
  required when a first install was performed from copied sources rather than
  direct Git checkouts. Remote production smoke uses temporary source checkouts
  for plugin deployments instead of adopting service-owned production runtime
  directories in place;
- `--update-hermes-agent`: allow fast-forward of the official Hermes Agent
  runtime source;
- `--install-dependencies`: run `npm ci --omit=dev --no-audit --no-fund`
  through the operator sudo boundary when source dependency files changed;
- `--install-hermes-agent-dependencies`: run through the operator sudo boundary
  `<hermes-agent-python> -m pip install <sanitized-hermes-agent-source-copy>`
  after an explicit Hermes Agent update, and repair a missing official Hermes
  Agent virtualenv by running the same `install-official-hermes-runtime` phase
  used by first install;
- `--python-command <path|name>`: Python 3.12+ command for the Hermes Agent
  runtime repair phase. If omitted, the CLI prefers `HOMEAI_PYTHON`, `PYTHON`,
  `/opt/homebrew/bin/python3`, `/usr/local/bin/python3`, then `python3`. If
  `<root>/runtime/hermes-agent-official/venv/bin/python` is missing and the
  selected command is not a Python 3.12+ executable, execute mode must fail with
  bounded installer evidence rather than falling back to an older system Python
  runtime;
- `--force-deploy`: redeploy Home AI even when source did not update;
- `--force-closure-validation`: run provider/profile and production closure
  validation even when no source changed;
- `--allow-provider-auth-pending`: accept deployment, plugin, permission, and
  runtime closure when the target Mac has not configured a Hermes Agent
  inference provider yet. Closure validation records provider auth as pending
  and skips model/schema/concurrency probes that require provider credentials;
  rerun without this flag after provider setup for strict model closure.

## Source Inventory

`config/public-plugin-sources.json` is the upgrade source inventory. It now
includes Home AI plus Codex Mobile Web, Email, Finance, Growth, Health, Moira,
Movie, Music, Note, and Wardrobe.

Moira uses the public repository:

```text
https://github.com/pentiumxp/MOIRA_chinese_astrology_public.git
```

Movie is deployable but not anonymous-public in the current inventory. It is
marked `operatorAuthenticated: true` and uses:

```text
https://github.com/pentiumxp/HomeAI-Movie.git
```

An operator running `--clone-missing-plugins` must have read access for any
authenticated repository. The script reports bounded missing-source blockers in
plan mode and must not print credentials.

## Closure Semantics

The upgrade loop is clean fast-forward only:

- dirty source checkouts block;
- non-Git or unreadable source checkouts block unless
  `--adopt-non-git-sources` is explicit for present copied source directories;
- non-fast-forward remotes block during execution;
- missing plugin sources block unless `--clone-missing-plugins` is explicit;
- Hermes Agent source updates block unless `--update-hermes-agent` is explicit.
- missing `<root>/runtime/hermes-agent-official/venv/bin/python` blocks unless
  `--install-hermes-agent-dependencies` is explicit. With that gate, the
  upgrade runs `install-macos-production.sh --phase install-official-hermes-runtime`
  before provider/profile audit and closure validation.
- closure validation must verify the production Hermes Agent runtime imports
  `hermes_cli.main`, `hermes_cli.tools_config`, `run_agent`, and `websockets`
  with production `PYTHONPATH`; checking only that `venv/bin/python` exists is
  insufficient.
- temporary Node distributions used by remote smoke or bootstrap are copied into
  `<root>/runtime/node-distributions/<node-package>` before `runtime/node-current`
  is linked. Production must not remain bound to a one-run `/tmp` Node tree, and
  the installer repairs stale `node-current/bin/npm` / `npx` symlinks when they
  still point into an old temporary Node distribution.

After a source update:

- Home AI source updates deploy `--target home-ai`;
- plugin source updates deploy the matching `--plugin <id>`;
- updated plugin sources with a `package.json` `scripts.build` command run
  `npm ci` with dev dependencies retained and then `npm run build` before
  deploy, so source-only public plugin checkouts produce required proof
  artifacts such as `dist/web/index.html` before the central deploy proof-file
  gate runs;
- freshly cloned plugin sources are also deployed, so clone-only partial
  closure cannot be mistaken for runtime closure;
- cloned plugin sources deploy with the upgrade `pluginRoot` as the central
  deploy `--dev-root`, so trusted temporary upgrade sources are accepted without
  broadening the source boundary to arbitrary `/tmp` paths;
- adopted Home AI/plugin source directories are deployed in the same run, so a
  checkout-adoption-only partial closure cannot be mistaken for runtime
  closure;
- production drift reconcile runs before provider/profile audit so public
  upgrades repair the same bounded macOS drift classes as central Home AI
  deploys, including plugin-local binding repairs, supported Gateway/ACL
  drift, and the allowlisted keyless Wardrobe required Skill bundle when the
  profile audit reports it missing or unreadable. Fresh/public-machine closure
  drift includes OpenAI-Codex shared-auth import from the operator Codex home
  when available, per-profile shared-auth links, Gateway file-tool profile
  plugins, file-tool start-script environment, listener-readable Gateway
  telemetry stores, and listener-readable
  `productivity/wardrobe-style-operations` bundles for audited
  Wardrobe-capable workspace profiles;
- profile/provider audit runs before final closure validation whenever Home AI,
  a plugin, or Hermes Agent changed;
- production closure validation runs through
  `scripts/macos-production-closure-validation.js`. Public upgrade closure
  passes `--wardrobe-min-item-count 0`, so a newly provisioned but empty
  Wardrobe workspace can close after manifest, launch-token, proxy-entry, and
  bootstrap HTTP checks pass.

## Hermes Agent And Provider Boundary

Provider access through Hermes Agent is part of deployment closure. The upgrade
script treats the official Hermes Agent runtime under:

```text
<root>/runtime/hermes-agent-official/source
<root>/runtime/hermes-agent-official/venv/bin/python
```

as a tracked dependency. Updating it is explicit because it can change model
provider behavior independently of Home AI source. A closed upgrade must prove
the Gateway/profile provider layer after any Hermes Agent update via:

```bash
sudo node scripts/macos-production-drift-reconcile.js --root <root> --execute --json
sudo node scripts/macos-production-profile-audit.js --root <root> --expected-workspaces owner --json --no-strict
sudo node scripts/macos-production-closure-validation.js --root <root> --base <base> --json
```

The script may report provider/key file names and status codes, but it must not
print raw provider keys, OAuth state, access keys, cookies, launch tokens, or
profile config bodies.

## Focused Checks

Run after changes to the upgrade loop:

```bash
node tests/public-release-closure-service.test.js
node tests/homeai-public-release-closure-script.test.js
node tests/public-remote-deploy-smoke-service.test.js
node tests/homeai-public-remote-deploy-smoke-script.test.js
node tests/public-upgrade-rehearsal-service.test.js
node tests/homeai-public-upgrade-rehearsal-script.test.js
node tests/public-upgrade-orchestrator-service.test.js
node tests/homeai-public-upgrade-script.test.js
node tests/public-plugin-sources.test.js
node tests/plugin-provisioning-coverage-audit.test.js
node scripts/public-install-preflight.js --source-only --json
node scripts/plugin-provisioning-coverage-audit.js
node scripts/productization-acceptance-matrix.js --verify-docs
```
