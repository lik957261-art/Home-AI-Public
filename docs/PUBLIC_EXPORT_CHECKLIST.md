# Public Export Checklist

Create a public repository only from a clean export, not from deployment runtime history.

## Required Before Public Push

- Run `npm test`.
- Run `npm run productization:check`.
- Run `git diff --check`.
- Run the privacy scan: `npm run privacy:scan`.
- Create the export with `npm run export:public -- --out <clean-public-export-dir> --force`.
- The export command should run from a clean source checkout. Do not use `--allow-dirty` for a public release.
- Run the privacy scan against the export root if it is moved or edited: `node scripts/privacy-scan.js --root <clean-public-export-dir> --all-files`.
- Review `README.md` in the public export and update it in the same public commit.
- Confirm the public README clone URL points to the public repository, not an internal source repository.

## Must Not Export

- `.agent-context/`
- `AGENTS.md`
- runtime databases, JSON state, backups, logs, uploads, generated reports, or delivery folders
- raw Access Keys, Hermes API keys, VAPID private keys, push endpoints, OAuth tokens, mailbox app passwords, or `.env` files with secrets
- deployment-only paths such as operator home directories, WSL UNC paths, NAS paths, or Tailscale-only hostnames
- non-public repository clone URLs
- worker-pool manifests containing API keys
- private incident reports that include deployment-specific message ids, profile paths, or machine-local recovery details

## Export Shape

The public export should include:

- source code under `server.js`, `public/`, `adapters/`, `scripts/`, and bridge stubs
- tests
- docs
- `.env.example`
- package metadata
- public-safe sample configs only

The public export should not include deployment-specific production launchers. Provide example launchers that use environment variables and secret-file paths supplied by the installer.

Do not manually copy files into a public repository. Use the export command so only tracked source files are copied and ignored runtime data stays out of the public tree.

## Public README Requirements

Every public release commit must update README details for:

- user-visible changes
- configuration impact
- operational notes
- validation scope
- known limitations

If a commit changes runtime behavior but does not update README, do not push it to the public repository.
