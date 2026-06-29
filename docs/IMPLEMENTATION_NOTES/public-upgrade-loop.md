# Public Upgrade Loop

Last updated: 2026-06-29.

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

The rehearsal is source/plan-only. It does not pass `--execute` to
`upgrade:public`, does not touch `/Users/example/path`, and does
not read or print provider keys, OAuth state, access keys, cookies, launch
tokens, or plugin private payloads.

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
target root and credential boundary.

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
- `--update-hermes-agent`: allow fast-forward of the official Hermes Agent
  runtime source;
- `--install-dependencies`: run `npm ci --omit=dev --no-audit --no-fund` when
  source dependency files changed;
- `--install-hermes-agent-dependencies`: run through the operator sudo boundary
  `<hermes-agent-python> -m pip install <sanitized-hermes-agent-source-copy>`
  after an explicit Hermes Agent update;
- `--force-deploy`: redeploy Home AI even when source did not update;
- `--force-closure-validation`: run provider/profile and production closure
  validation even when no source changed.

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
- non-Git or unreadable source checkouts block;
- non-fast-forward remotes block during execution;
- missing plugin sources block unless `--clone-missing-plugins` is explicit;
- Hermes Agent source updates block unless `--update-hermes-agent` is explicit.

After a source update:

- Home AI source updates deploy `--target home-ai`;
- plugin source updates deploy the matching `--plugin <id>`;
- freshly cloned plugin sources are also deployed, so clone-only partial
  closure cannot be mistaken for runtime closure;
- profile/provider audit runs before final closure validation whenever Home AI,
  a plugin, or Hermes Agent changed;
- production closure validation runs through
  `scripts/macos-production-closure-validation.js`.

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
node scripts/macos-production-profile-audit.js --root <root> --expected-workspaces owner --json --no-strict
node scripts/macos-production-closure-validation.js --root <root> --base <base> --json
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
