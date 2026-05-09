# Privacy Checklist

Run this checklist before publishing a release or creating a public export.

## Must Not Be Present

- Raw access keys, API keys, OAuth tokens, mailbox passwords, VAPID private keys, or push endpoints.
- Runtime state under `workspace/`, logs, uploads, previews, outbox files, generated reports, or backups.
- Internal workspace context directories or local operator instruction files.
- Non-public clone URLs, Tailscale hostnames, local-only share URLs, or full user data paths in README examples.

## Public-Safe Content Review

Before public export, remove or replace:

- Account-specific names and connector ids.
- Local filesystem conventions.
- Deployment-only plugin names.
- CRON/todo/workspace heuristics that only make sense for one installation.

## Required Checks

- `npm test`
- `git diff --check`
- `npm run privacy:scan` for known private path/key patterns.
- `npm run export:public -- --out <clean-public-export-dir> --force` from a clean source tree.
- README review for install steps that can be followed outside the original Agent workspace.
