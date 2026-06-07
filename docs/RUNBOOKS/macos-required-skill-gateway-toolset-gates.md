# Mac Required Skill And Gateway Toolset Gates

Last updated: 2026-06-07.

Use this runbook when a Mac production plugin-bound run fails before model
streaming with either `required_skill_missing` or `gateway_toolset_missing`.
These failures can look similar to the user, but they are different gates.

## Gate Separation

`required_skill_missing` is a listener-side Skill preload failure. The Home AI
listener, running as `hermes-host`, could not load the required keyless Skill
bundle from the selected workspace Skill Store. For Owner wardrobe outfit runs,
the required bundle is:

```text
owner -> wardrobe -> productivity/wardrobe-style-operations
```

`gateway_toolset_missing` is a Gateway target declaration failure. The run
request already had the required Skill bundle and requested toolsets, but the
selected Gateway target did not declare the required toolset in its manifest
projection. For wardrobe outfit runs the required toolsets are:

```text
wardrobe, vision, file, skills, weather
```

Do not close a production wardrobe incident by proving only one of these gates.
Both checks must pass.

## 2026-06-07 Incident Record

The Owner wardrobe thread first failed with `required_skill_missing` because
`data/skill-profiles/owner-full/skills` had been tightened back to a shape that
the listener user could not traverse. Root and the isolated worker could see
the bundle, but `hermes-host` could not preload it.

After ACL repair, the latest failure changed to `gateway_toolset_missing`.
The required Skill preload was healthy:

```text
missing=false
profileId=owner-full
loadedChars=80000
referenceIncluded=true
```

The remaining failure was that the Mac manifest rows for Owner OpenAI/Codex
workers did not list `wardrobe` even though the actual profile `config.yaml`
already did. Mobile uses manifest `toolsets` for Gateway Pool filtering and
for the wardrobe pre-stream gate, so a stale manifest projection can block the
run before the model starts.

The immediate production repair synchronized manifest `toolsets` from each
worker's profile `config.yaml` and restarted only the listener. The repair did
not require a model request and did not print keys, prompts, or raw messages.

## Required Checks

Run the Skill preload smoke after Skill Store copies, ACL repairs, plugin
provisioning, user migration, or any failure that mentions the required
wardrobe Skill:

```bash
sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node \
  /Users/hermes-host/HermesMobile/app/scripts/macos-required-skill-preload-smoke.js \
  --root /Users/hermes-host/HermesMobile \
  --json
```

Run the manifest toolset smoke after profile materialization, manifest edits,
plugin provisioning, data migration, or any failure that mentions Gateway
toolsets:

```bash
sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node \
  /Users/hermes-host/HermesMobile/app/scripts/macos-gateway-manifest-toolset-smoke.js \
  --root /Users/hermes-host/HermesMobile \
  --json
```

The first command must return `ok=true` and no issue such as
`required_skill_unreadable_by_listener` or `required_skill_preload_missing`.
The second command must return `ok=true` and no issue such as
`manifest_missing_config_toolset:<profile>:wardrobe` or
`required_candidate_missing_toolset:<profile>:wardrobe`.

## Bounded Runtime Evidence

If the user says a retry still fails, check the latest SQLite message metadata
before changing production again. Record only bounded fields:

- message id
- thread id
- task group id
- workspace id
- status
- `wardrobeOutfitWorkflowGate.reason`
- missing toolsets
- missing Skills
- selected Gateway profile and declared toolsets

Do not print raw message content, prompts, model output, access keys, key file
paths, or complete logs.

## Local Harnesses

Source changes to either smoke must keep these tests passing:

```powershell
node tests\macos-required-skill-preload-smoke.test.js
node tests\macos-gateway-manifest-toolset-smoke.test.js
```

The required Skill smoke verifies listener readability and preload content
without treating ordinary forbidden-word mentions as secrets. It fails only if
the preload includes a sensitive source filename such as an access key, token,
credential, password, or cookie file.

The manifest smoke verifies that manifest worker `toolsets` are a superset of
the worker profile config's top-level `toolsets`, and that Owner OpenAI/Codex
wardrobe candidates declare `wardrobe`, `vision`, `file`, `skills`, and
`weather`.
