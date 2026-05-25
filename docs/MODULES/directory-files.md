# Module: Directory, Files, And Preview

## Responsibility

The directory/file module owns embedded directory browsing, first-level project roots, shared roots, upload/create/delete operations, file preview, artifact access, and deliverable preview.

The same ACL boundary must protect listing, preview, upload, delete, task directory attachment, and automation deliverable access.

## Core Files

- `server-routes/directory-browser-api-routes.js`
- `server-routes/directory-mutation-api-routes.js`
- `server-routes/directory-share-api-routes.js`
- `server-routes/file-artifact-api-routes.js`
- `adapters/directory-browser-boundary-service.js`
- `adapters/directory-delete-policy-service.js`
- `adapters/shared-directory-provider.js`
- `adapters/shared-directory-projection-service.js`
- `adapters/semantic-directory-attachment-service.js`
- `adapters/file-resource-service.js`
- `adapters/file-response-service.js`
- `adapters/file-artifact-access-service.js`
- `adapters/file-artifact-resolver-service.js`
- `public/app-thread-directory-ui.js`
- `public/app-shared-directory-ui.js`
- `public/file-viewer.html`
- `public/directory-viewer.html`

## Directory Rules

- Directory mode is the primary in-app file manager surface.
- Root listing should include normal project-map roots, workspace-directory roots, and shared roots together.
- Directory entries should be filtered by the authenticated workspace and shared-directory ACLs.
- Shared roots may be read-only; create/upload/delete must reject non-owner writes to read-only shares.
- Upload must not overwrite existing files by default.
- Delete must be explicit and non-recursive unless a dedicated audited policy says otherwise.
- Protected roots include workspace root, sync/download roots, cache/delivery roots, hidden roots, and allowed-root boundaries.

## Preview Rules

- Preview access must be resolved through thread/message/group/automation ACLs, not by raw filesystem path.
- File viewer shells such as `file-viewer.html`, `pdf-viewer.html`, and `markdown-viewer.html` are UI surfaces, not durable notification targets.
- Automation deliverables must be verified as outputs of the requested automation job or its authorized delivery path.
- Group-chat artifacts are visible to a member only when the artifact is attached to a visible group-chat message in a group the member belongs to.

## Validation

- Syntax-check touched frontend/static files.
- Run focused directory/share/file-artifact tests when touching these route modules.
- Run `node tests\task-list-ui.test.js` for directory UI routing/static version changes.
- Run `git diff --check`; frontend files may have existing CRLF normalization warnings.

## Debug Pointers

If a directory is invisible, inspect root projection and share filtering. If a file previews for the wrong user, inspect `file-artifact-access-service` and the route auth context. If Web Push opens a viewer inside another viewer, use `docs/RUNBOOKS/web-push-wrong-page.md`.
