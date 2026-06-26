# GitHub Shared Source Account Runbook

Use this runbook when Home AI or plugin workspaces need a shared GitHub push
identity.

Canonical contract:

```text
docs/PLATFORM_CONTRACTS/github-shared-source-account-contract.md
```

## Status

```bash
node scripts/github-shared-source-account.js status --json
```

The status output reports whether the private key, public key, SSH config alias,
and public-key fingerprint are present. It must not print private key content.

## Initialize Local Key And SSH Alias

Plan only:

```bash
node scripts/github-shared-source-account.js init --json
```

Generate or repair local state:

```bash
node scripts/github-shared-source-account.js init --execute --json
```

Default local state:

```text
Private key: ~/.ssh/homeai_github_ssa_ed25519
Public key:  ~/.ssh/homeai_github_ssa_ed25519.pub
SSH alias:   github.com-homeai-ssa
```

The helper writes the alias inside `~/.ssh/config` without changing the default
`github.com` host entry.

## Register Public Key In GitHub

Print only the public key:

```bash
node scripts/github-shared-source-account.js print-public-key
```

Add that public key to the GitHub SSA machine user or equivalent GitHub
identity. Grant that identity repository-level write access to Home AI and the
plugin repositories that should push through the shared identity.

Do not paste the private key into GitHub, docs, task cards, handoffs, or plugin
repositories.

## Smoke Repository Access

Read access smoke:

```bash
node scripts/github-shared-source-account.js smoke \
  --repo git@github.com-homeai-ssa:pentiumxp/Home-AI.git \
  --json
```

For a plugin repo, replace the repository slug:

```bash
node scripts/github-shared-source-account.js smoke \
  --repo git@github.com-homeai-ssa:pentiumxp/finance-mcp.git \
  --json
```

If smoke fails before GitHub registration, report
`github_ssa_public_key_unregistered` and stop. Do not create per-plugin
credential workarounds.

## Name A Missing Plugin Source Repository

Existing plugin source repositories keep their current names. For a plugin
workspace with no configured source remote, use the canonical private source
repository name from the helper:

```bash
node scripts/github-shared-source-account.js repo-name --plugin music --json
```

The canonical pattern is:

```text
HomeAI-<CanonicalPluginName>
```

Examples:

```text
music -> pentiumxp/HomeAI-Music
movie -> pentiumxp/HomeAI-Movie
```

Use this only for missing source remotes. Do not rename existing repositories
such as `finance-mcp`, `codex-mobile-web`, or other historical source repos
during routine SSA adoption.

## Create A Missing Private Source Repository

After explicit operator/user approval, create the missing private repository
from the central Home AI thread. Example:

```bash
gh repo create pentiumxp/HomeAI-Music \
  --private \
  --description "Home AI Music plugin private source workspace" \
  --disable-issues \
  --disable-wiki
```

Then verify SSA access:

```bash
node scripts/github-shared-source-account.js smoke \
  --repo git@github.com-homeai-ssa:pentiumxp/HomeAI-Music.git \
  --json
```

After the smoke passes, route a task card to the plugin thread. The plugin
thread owns setting `origin`, running local checks, committing any local pointer
update, pushing its own source, and returning bounded evidence.

## Adopt A Plugin Remote

After smoke passes for a repository, a plugin may switch a push remote to the
alias form:

```bash
git remote set-url origin git@github.com-homeai-ssa:pentiumxp/<repo>.git
git remote -v
node /Users/example/path smoke \
  --repo git@github.com-homeai-ssa:pentiumxp/<repo>.git \
  --json
```

Use the plugin's actual source repository. Do not change public installer
manifests; they remain HTTPS public URLs.

## Push Discipline

Before a plugin pushes:

```bash
git status --short
git diff --check
```

Run the plugin's required tests/checks from its local docs. Push only after the
commit is intentional and contains no raw secrets, tokens, cookies, launch
tokens, device credentials, private records, or large logs.

## Troubleshooting

Common bounded outcomes:

- `github_ssa_key_missing`: run `init --execute`.
- `github_ssa_public_key_unregistered`: add the printed public key to the GitHub
  SSA identity.
- `github_ssa_repo_access_denied`: grant the GitHub SSA identity access to that
  repository.
- `github_ssa_remote_not_adopted`: update the plugin remote after access is
  confirmed.
- `github_ssa_smoke_passed`: repository access works through the shared alias.

Do not run verbose SSH with secret-bearing environment variables in logs. If a
deeper SSH trace is necessary, keep it local and summarize only sanitized
status, alias, repository slug, and exit code.
