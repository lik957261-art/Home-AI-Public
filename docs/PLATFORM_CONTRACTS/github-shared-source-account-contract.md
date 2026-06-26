# GitHub Shared Source Account Contract

Contract version: `20260625-v2`.

## Purpose

Home AI and its plugin workspaces may push their own source changes to GitHub.
The platform must provide one local, reusable GitHub source identity so plugin
threads do not create ad-hoc SSH keys, personal access tokens, or per-plugin
credential copies.

This contract defines the Home AI GitHub Shared Source Account, abbreviated
`GitHub SSA`.

## Scope

The GitHub SSA is for development-source Git operations only:

- local `git fetch`, `git pull`, and `git push` from Home AI or plugin
  workspaces;
- plugin-owned commits and pushes after their local checks pass;
- shared Home AI platform docs, scripts, and contract updates.

The GitHub SSA is not a runtime credential:

- it must not be deployed into Home AI production services;
- it must not be stored in plugin source, production mirrors, `.agent-context`,
  docs, screenshots, logs, task cards, or model context;
- it must not be used by Home AI host code to clone private repositories at
  request time;
- it must not replace public installation source URLs.

## Identity Model

The GitHub SSA should be a GitHub machine user or an equivalent bounded GitHub
identity with repository-level write access to the Home AI and plugin source
repositories that need automated/local Codex push.

Do not attach the shared Home AI SSA public key to a personal GitHub account
unless the operator intentionally accepts that all plugin pushes will be
attributed to that personal account. A repository deploy key is also not the
default choice because GitHub deploy keys are repository-scoped and cannot be
shared cleanly across all plugin repositories.

## Local Key And SSH Alias

The standard local development key path is:

```text
~/.ssh/homeai_github_ssa_ed25519
```

The public key is:

```text
~/.ssh/homeai_github_ssa_ed25519.pub
```

The standard SSH host alias is:

```text
github.com-homeai-ssa
```

The SSH config entry must be equivalent to:

```sshconfig
Host github.com-homeai-ssa
    HostName github.com
    User git
    IdentityFile ~/.ssh/homeai_github_ssa_ed25519
    IdentitiesOnly yes
    AddKeysToAgent yes
```

Use the alias form for plugin remotes after the public key is registered on the
GitHub SSA account:

```text
git@github.com-homeai-ssa:pentiumxp/<repo>.git
```

The default `github.com` host entry may keep using the user's existing personal
SSH key. The GitHub SSA must not silently replace that default.

## Runtime Secret Boundary

The private key is local operator secret material. It must remain outside the
Home AI repository and plugin repositories. Required permissions:

- private key: `0600`
- public key: `0644`
- SSH config: not world-writable

Docs, handoffs, task cards, and test output may include only:

- key path;
- public key path;
- public key fingerprint;
- SSH host alias;
- bounded smoke status.

They must not include the private key body or raw authentication tokens.

## Public Source Manifest Boundary

`config/public-plugin-sources.json` and public installation workflows must keep
using HTTPS public GitHub URLs. The GitHub SSA is a private local development
and push path. It does not change public installer source URLs and must not make
fresh public installations depend on private SSH access.

## Source Repository Naming

Existing plugin source repositories remain authoritative during GitHub SSA
adoption. Do not rename an existing source repository only to make its name
match this section; that would break history, bookmarks, and local remotes
without improving the credential boundary.

When a plugin workspace has no configured source remote, create a private source
repository using this canonical name:

```text
HomeAI-<CanonicalPluginName>
```

Rules:

- owner: `pentiumxp`, unless the central Home AI configuration explicitly
  changes the GitHub owner;
- prefix: exactly `HomeAI-`;
- plugin component: ASCII PascalCase product/plugin name, for example `Music`,
  `Movie`, `CodexMobile`;
- visibility: private by default;
- public repositories, if needed later, must be created separately and must not
  replace this private source repository.

Examples:

```text
music -> pentiumxp/HomeAI-Music
movie -> pentiumxp/HomeAI-Movie
codex-mobile -> pentiumxp/HomeAI-CodexMobile
```

The source repository URL for plugin remotes must use the SSA alias:

```text
git@github.com-homeai-ssa:pentiumxp/HomeAI-<CanonicalPluginName>.git
```

Repository creation is a one-time source-control operation. Home AI may create
the missing private repository after operator approval or an explicit user
instruction. The plugin thread still owns setting its local remote, running its
checks, committing any local pointer update, and pushing its own source.

## Required Tooling

Home AI owns the local helper:

```bash
node scripts/github-shared-source-account.js status --json
node scripts/github-shared-source-account.js init --execute --json
node scripts/github-shared-source-account.js print-public-key
node scripts/github-shared-source-account.js smoke --repo git@github.com-homeai-ssa:pentiumxp/Home-AI.git --json
node scripts/github-shared-source-account.js repo-name --plugin music --json
```

The helper may generate the local key, install/update the SSH alias, report a
fingerprint, print the public key for GitHub registration, and run a bounded
`git ls-remote` smoke. It also returns the canonical private source repository
name for a plugin that has no source remote. It must never print the private
key.

## GitHub-Side Registration

After local key generation, an operator must add the public key to the GitHub
SSA identity or equivalent GitHub account with write access to the required
repositories.

If the key is not registered yet, plugin threads must leave their remote URLs
unchanged and report `github_ssa_registration_pending`. They must not work
around the missing registration by copying private keys, creating per-plugin
tokens, or switching to an unrelated personal identity without explicit user
approval.

## Plugin Push Rule

Plugin workspaces may push their own source changes when all of the following
are true:

- the change belongs to that plugin workspace;
- local required checks have passed or the remaining risk is explicitly
  recorded;
- `git diff --check` passes for committed source changes;
- no raw secrets, cookies, launch tokens, OAuth tokens, device credentials, or
  private payloads are present in the commit;
- the remote points to the expected source repository;
- GitHub SSA smoke has passed for that repository or the operator has approved
  using an existing registered identity for that push.

Home AI should not receive task cards just to push plugin-owned commits. Home AI
only owns shared credential policy, the helper script, platform docs, and
GitHub SSA troubleshooting.

## Plugin Adoption

Each plugin should record only a short local pointer, not a copy of this full
contract. The pointer may include:

```text
GitHub shared source account:
- Central contract: <Home-AI>/docs/PLATFORM_CONTRACTS/github-shared-source-account-contract.md
- Local helper: <Home-AI>/scripts/github-shared-source-account.js
- SSH host alias: github.com-homeai-ssa
- Source repository: git@github.com-homeai-ssa:pentiumxp/<repo>.git
- Private key: local operator secret, never copied into this repo
- Status: pending / adopted / blocked
```

Plugin-local docs must not include the private key body, private network
details, GitHub tokens, or raw credential material.

## Failure Handling

Use these bounded statuses:

- `github_ssa_key_missing`: local key has not been generated.
- `github_ssa_public_key_unregistered`: GitHub rejects SSH auth for the alias.
- `github_ssa_repo_access_denied`: the key is registered but lacks repository
  read/write access.
- `github_ssa_remote_missing`: the plugin has no source remote configured.
- `github_ssa_remote_missing_repo_created`: Home AI created the canonical
  private `HomeAI-<CanonicalPluginName>` repository and the plugin still needs
  to bind/push it.
- `github_ssa_remote_not_adopted`: the plugin still uses its old remote.
- `github_ssa_smoke_passed`: `git ls-remote` succeeded through the alias.

Troubleshooting evidence may include sanitized command status, exit code,
fingerprint, alias, and repository slug. It must not include raw private key
material, tokens, or full verbose SSH logs.
