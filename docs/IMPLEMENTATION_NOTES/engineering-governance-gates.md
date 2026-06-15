# Engineering Governance Gates

This note defines the repository-level closure gates for engineering changes
that affect Home AI product behavior, deployment, or production operations.

## CI-Enforced Constraints

Every pull request and push must keep `.github/workflows/ci.yml` wired to
`npm run productization:check`. The productization check is the broad
repository gate and must continue to run:

- `npm test`, including syntax checks, architecture boundary checks, security
  invariants, and the privacy scan;
- `start-hermes-web` check-only startup validation for the current platform;
- `git diff --check` and `git diff --cached --check`;
- `node scripts/engineering-governance-check.js`.

The governance check is intentionally small and static. It verifies that the
release gate, production self-diagnostic scripts, and productization acceptance
matrix remain documented and discoverable. If a future change replaces a gate,
the replacement must update this note, `docs/TEST_MATRIX.md`, and
`scripts/engineering-governance-check.js` in the same commit.

## Production Self-Diagnostics

Production fixes are not closed only because a local source test passes. A
change that can affect startup, deployment, profile access, plugin visibility,
worker filesystem permissions, public update, Automation, Gateway routing, or
Mac production state needs either an existing production self-diagnostic or a
new bounded diagnostic.

The maintained baseline diagnostics are:

- `scripts/production-status-smoke.js`;
- `scripts/macos-production-profile-audit.js`;
- `scripts/macos-worker-filesystem-access-harness.js`;
- `scripts/macos-gateway-manifest-toolset-smoke.js`;
- `scripts/macos-plugin-directory-production-smoke.js`;
- `scripts/macos-bound-directory-preview-smoke.js`;
- `scripts/macos-automation-cron-audit.js`;
- `scripts/macos-production-closure-validation.js`.

Diagnostic output must be bounded metadata. It must not print raw Access Keys,
provider keys, OAuth tokens, push endpoints, full prompts, full model
responses, private file contents, or long logs. A diagnostic may report paths,
ids, labels, versions, counts, status codes, and issue codes when those values
are needed for repair.

## Productization Acceptance Matrix

Every product-facing change must be reviewed against this acceptance matrix.
The goal is to prevent maintainer-only fixes that work on one Mac but fail for
a fresh public deployment or another workspace.

Required dimensions:

- Owner workspace behavior;
- non-Owner workspace behavior when the surface is user-visible;
- public fresh install behavior without private machine paths or copied runtime
  state;
- public update behavior for an existing clean checkout;
- migration or restore behavior when the change touches persisted state;
- backup and rollback path when production data can be changed;
- permission boundary for workspace, plugin, Gateway, Skill, Memory, Soul, or
  filesystem access;
- UI/PWA visual and cache behavior when static client behavior changes;
- production self-diagnostic coverage for likely failure modes.

If a dimension is not applicable, the implementation note, test plan, or
handoff must say why. If it is applicable but not yet covered, the gap must be
recorded as a follow-up before the work is treated as productized.

## Local Check

Run the governance check directly when changing CI, deployment docs, production
diagnostics, public release behavior, or this document:

```bash
node scripts/engineering-governance-check.js --json
node tests/engineering-governance-check.test.js
```

The broad gate remains:

```bash
npm run productization:check
```
