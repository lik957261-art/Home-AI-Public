# Hermes Web

Hermes Web is a mobile-first web app for using a local Hermes Gateway from a phone or desktop browser. It is separate from the official Hermes dashboard and does not use the dashboard terminal/PTY chat surface as its product model.

This repository is the private productization checkout. It was split from the larger Agent workspace so Hermes Web can be stabilized, tested, packaged, and later exported to a clean public repository.

## Current Scope

- Mobile chat, task list, directory, todo, and automation views.
- Streaming Hermes Gateway runs with usage display.
- Directory-bound task creation and file/artifact preview.
- Workspace-scoped access keys.
- Web Push notifications for task, todo, and automation events.
- CRON/automation list and deliverable preview.

## Run

Install dependencies:

```powershell
npm install
```

Run checks:

```powershell
npm run check
```

Start the listener:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-hermes-web.ps1 -CheckOnly
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-hermes-web.ps1
```

Detached Windows listener:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-hermes-web.ps1 -Detached
```

Restart after code changes:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\restart-hermes-web.ps1
```

WSL/Linux:

```bash
./start-hermes-web.sh -CheckOnly
./start-hermes-web.sh
```

Default URL: `http://0.0.0.0:8797`

## Configuration

Start from `.env.example`. Do not commit real keys, push endpoints, access-key stores, VAPID private keys, local state, uploaded files, or user data.

Important configuration groups:

- `HERMES_WEB_HOST`, `HERMES_WEB_PORT`, `HERMES_WEB_DATA_DIR`
- `HERMES_WEB_KEY` or a deployment secret file
- `HERMES_WEB_HERMES_API_BASE`
- `HERMES_WEB_HERMES_API_KEY` or `HERMES_WEB_HERMES_API_KEY_PATH`
- `HERMES_WEB_ALLOWED_ARTIFACT_ROOTS`
- `HERMES_WEB_VAPID_PATH` or `WEB_PUSH_VAPID_*`

## Repository Boundary

This checkout should contain product source code, static assets, scripts, tests, and non-secret documentation only.

It must not contain:

- Agent workspace context such as `.agent-context/`
- Codex/Hermes operator instructions such as `AGENTS.md`
- runtime state, logs, uploads, generated reports, or private outbox files
- raw access keys, mailbox passwords, OAuth tokens, VAPID private keys, push endpoints, or API tokens

## Productization Plan

See [docs/PRODUCTIZATION.md](docs/PRODUCTIZATION.md).

The public repository should be created from a privacy-scanned export of this private repo, not from the Agent workspace history.
