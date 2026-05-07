# Privacy Checklist

Run this checklist before pushing to a wider audience or creating a public export.

## Must Not Be Present

- Raw access keys, API keys, OAuth tokens, mailbox passwords, VAPID private keys, or push endpoints.
- Runtime state under `workspace/`, logs, uploads, previews, outbox files, generated reports, or backups.
- Internal workspace context directories or local operator instruction files.
- Private clone URLs, Tailscale hostnames, local-only share URLs, or full user data paths in README examples.

## Private-Only Until Removed

The private repository may temporarily contain adapter implementation details while productizing. Before public export, remove or replace:

- Account-specific names and connector ids.
- Local filesystem conventions.
- Deployment-only plugin names.
- Private CRON/todo/workspace heuristics.

## Required Checks

- `npm test`
- `git diff --check`
- `npm run privacy:scan` for known private path/key patterns.
- README review for install steps that can be followed outside the original Agent workspace.
