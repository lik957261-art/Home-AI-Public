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
- `adapters/directory-run-scope-service.js`
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
- Directory is presented as a built-in plugin card on the topic surface instead
  of a permanent mobile bottom-navigation tab. This is only an entry-point
  change; all directory operations remain protected by the directory module's
  ACL and mutation rules.
- Root listing should include normal project-map roots, workspace-directory roots, and shared roots together.
- The Directory built-in plugin entry must open the directory root list, not the
  currently selected root directory. It should reset the active directory path
  before rendering so the breadcrumb remains `Directory` and shared roots stay
  visible.
- Directory entries should be filtered by the authenticated workspace and shared-directory ACLs.
- Shared roots may be read-only; create/upload/delete must reject non-owner writes to read-only shares.
- Upload must not overwrite existing files by default.
- Delete must be explicit and non-recursive unless a dedicated audited policy says otherwise.
- Protected roots include workspace root, sync/download roots, cache/delivery roots, hidden roots, and allowed-root boundaries.
- When Directory is opened as the built-in plugin, right-swipe/back must return
  through directory levels first, then return from a route root to the
  Directory root listing, and only the next root-list back gesture restores the
  outer plugin/topic route. Plugin delivery directories that were opened from a
  plugin topic may still restore their captured route at the delivery route
  root.
- When a directory chip is opened from a topic or message, Directory preview
  uses the current topic thread as the ACL context while a directory return
  route exists. It must not blindly create a new single-window directory thread
  from the current workspace selector, because shared topics and migrated
  Windows-origin bindings can otherwise combine a topic from one workspace with
  a preview context from another workspace.
- Renaming a single-window task/topic must preserve the existing
  `taskGroupMeta.<taskGroupId>` object. It must update only the title and
  timestamp fields, because directory-bound topics, shared-topic ACL metadata,
  and future topic references may be stored on the same metadata object.

## Directory Topic Collections

Directory-bound topics are different from plugin-bound topics. A plugin has one
primary application topic because the plugin is a structured app/data domain. A
directory is a project or evidence container, so the same directory may collect
multiple topic chats for different purposes.

Product rules:

- One directory may bind multiple topics.
- One directory may have at most one default primary topic for quick entry.
- Additional bound topics are secondary/special-purpose topic entries, for
  example planning, analysis, issue tracking, summary, or report drafting.
- The top-level Directory application entry may use a compact icon/card
  presentation to open the file manager. Directory-bound topic collections
  below it should use collapsible folder-tree rows: the parent directory row
  toggles expand/collapse, and bound topic rows are indented children with
  readable titles and inline default markers.
- When a directory has multiple bound topics, each bound-topic entry must show a
  readable short topic name, not only repeated chat icons. Manual topic names
  take priority; otherwise the UI may derive a deterministic short name from the
  first user message until service-owned title generation exists.
- The main card click should not be ambiguous: opening a directory and opening
  a topic are separate actions unless a future UI explicitly labels the default.
- Deleting or unbinding a topic must not delete the directory or other bound
  topics.

Context rules:

- Directory topic context may include cleaned summaries, selected files, pinned
  reports, and bounded previews resolved through the existing directory
  boundary service.
- The context selector must not blindly inject every file in the directory.
- Raw secrets, Access Keys, push endpoints, browser cookies, provider tokens,
  full learner content, full mailboxes, raw ledgers, private inventories, and
  long logs must not enter topic context, docs, handoff, or tests.
- Owner viewing another workspace must resolve that workspace's directory topic
  bindings, default topic, and files. Owner fallback is a permission bug.
- Directory-bound Gateway runs must separate actor and data scope. Owner may
  initiate a run, but a directory binding to another workspace must select that
  target workspace for access policy, Gateway worker/profile routing, and
  plugin/MCP data access. Missing directory workspace metadata falls back to the
  actor workspace rather than guessing from natural language.

Current frontend projection:

- Static v444 renders directory-topic cards from the existing topic directory
  bindings. This is display-only and does not create a new persistence table.
- Static v446 adds short named bound-topic entries inside directory-topic cards
  and preserves native mobile topic-list scrolling instead of intercepting
  normal vertical pan gestures.
- Static v453 exposes Directory as a built-in plugin card in the topic
  application grid and hides the standalone mobile bottom Directory tab.
- Static v547 renders directory-bound topics as compact collapsible folder-tree
  rows, keeps the built-in Directory card tighter on mobile, and fixes
  top-left Directory back from route-root pages with a captured return route.
- Static v634 fixes built-in Directory plugin back behavior so route-root back
  first returns to the Directory root listing, adds stable dark-mode page
  background for Directory navigation transitions, and routes directory-bound
  runs through the target workspace when directory metadata identifies one.
- Until a service-owned explicit default topic exists, the card opens the most
  recently updated topic in that directory as the temporary default.
- Changing persistence, context assembly, or workspace binding resolution must
  follow the H1 harness path in `docs/IMPLEMENTATION_NOTES/directory-topic-collections.md`.

## Plugin Topic Delivery Directories

Plugin-bound application topics may create a standard workspace-local delivery
directory, for example a displayed `交付/<plugin title>` route. The route must
be resolved through the same directory boundary service as ordinary directory
listing, preview, upload, and delete. The physical path is implementation-owned
and should not be inferred from a free-form folder name by the model.

These directories are for cleaned reports, selected exports, and user-facing
outputs. They are not plugin databases and must not contain raw plugin keys,
launch tokens, browser cookies, provider credentials, full mailbox bodies, raw
ledger rows, private inventories, health record dumps, or raw learner content.
Context assembly may read bounded summaries and selected report metadata from
the directory, but authoritative live data should come from the plugin MCP when
available.

Runtime task-directory attachment explicitly excludes fixed plugin task groups
such as `plugin:wardrobe`, `plugin:finance`, `plugin:email`, and
`plugin:health`. A plugin delivery `directoryRoute` can remain on the message
for UI navigation and artifact receipts, but it must not become the ordinary
`taskDirectory` that triggers directory-topic cleaning or frozen-directory
instructions.

## Preview Rules

- Preview access must be resolved through thread/message/group/automation ACLs, not by raw filesystem path.
- File viewer shells such as `file-viewer.html`, `pdf-viewer.html`, and `markdown-viewer.html` are UI surfaces, not durable notification targets.
- File viewer shells must follow the current Hermes theme. `file-viewer.html`,
  `markdown-viewer.html`, and `pdf-viewer.html` read `hermesWebTheme` before
  paint and must use the same dark page and text contrast as the main PWA
  instead of a separate light document surface.
- `pdf-viewer.html` must render through the already-authorized fetched PDF
  bytes (`Uint8Array` data passed to PDF.js), not by handing PDF.js a secondary
  `blob:` URL fetch with credentials. This keeps PDF preview aligned with the
  same-origin ACL/download path used by the other viewers.
- PDF task and directory preview links are device-shape aware at the
  shared `public/app-task-preview-ui.js` entrypoint. Coarse-pointer phone
  widths up to `540px` keep the embedded Hermes preview overlay. Wide
  tablet/foldable/desktop widths (`>=768px`, or coarse-pointer `>=720px` with
  enough height) open the resolved original same-origin file URL in the same
  window so the platform can use a native PDF preview. Word/DOCX remains inside
  the Home AI `file-viewer.html` preview path on all viewport sizes because
  mobile browsers commonly treat raw DOCX URLs as downloads rather than inline
  previews.
- Image preview must expose a same-window `保存到相册` action in both the full `file-viewer.html` shell and the in-app image overlay. The action should prefer system file share with the image blob and fall back to same-window download/long-press guidance; it must not open a separate browser window.
- Automation deliverables must be verified as outputs of the requested automation job or its authorized delivery path.
- Group-chat artifacts are visible to a member only when the artifact is attached to a visible group-chat message in a group the member belongs to.

## Validation

- Syntax-check touched frontend/static files.
- Run `node tests\document-preview-device-policy.test.js` when changing the
  file/document preview viewport policy.
- Run `node scripts\pdf-viewer-render-harness.js` when changing
  `pdf-viewer.html`; the harness must verify at least one rendered PDF canvas,
  not only that the iframe/viewer shell opened.
- Run focused directory/share/file-artifact tests when touching these route modules.
- Run `node tests\shared-directory-projection-service.test.js` when changing
  directory root projection or shared-root visibility.
- Run `node tests\task-list-ui.test.js` for directory UI routing/static version changes.
- Run `git diff --check`; frontend files may have existing CRLF normalization warnings.

## Debug Pointers

If a directory is invisible, inspect root projection and share filtering. If
directory-topic chips or artifact cards fail only after a Windows/WSL-to-Mac
data migration, first run the checked dry-run in
`docs/RUNBOOKS/macos-directory-path-migration-repair.md`; persisted
`messages.*directory*` and `artifacts.*` metadata can still contain
`/mnt/c/ProgramData/HermesMobile/data/drive/users/` or
`C:\ProgramData\HermesMobile\data\drive\users\` even when the actual files were
copied to the Mac drive root. On Mac, also run the enhanced
`--repair-rootless-drive` mode when metadata points at
`<root>/data/drive/<top>/...` instead of the Owner workspace drive. Write
repairs must also use `--reset-state-snapshot` so a newer stale `state.json`
snapshot cannot re-import old paths after listener restart. Closure must include
`scripts/macos-bound-directory-preview-smoke.js --all-workspaces` with
`includeChat=false` so current topic/plugin bindings prove previewable in every
active workspace that has directory-bound metadata. For UI chip failures after
Windows-to-Mac migration, add `--simulate-ui-route` so the smoke resolves
`projectId/subprojectId/path` through `/api/projects` like the static client
before previewing; also add `--use-bound-thread-context` so the preview uses
the persisted message thread for each binding rather than only a fresh
single-window thread. Path-only or single-window-only preview is not sufficient
evidence for clicked chips. Unknown/decommissioned workspaces may be reported as `skipped:
unknown-workspace`. Use `--include-chat` only for separate historical
stale-reference cleanup. If a file previews for the wrong user, inspect
`file-artifact-access-service` and the route auth context. If Web Push opens a
viewer inside another viewer, use `docs/RUNBOOKS/web-push-wrong-page.md`.
If the migration path dry-run and bound-directory preview smoke are clean but
older directory-bound task topics still have chips with missing task-level
routes, run `scripts/macos-task-directory-route-backfill.js`. This backfills
`taskGroupMeta.<taskGroupId>.directoryRoute` from existing message-level
directory routes and should be treated as a one-time compatibility repair.
