# Module: Directory, Files, And Preview

## Responsibility

The directory/file module owns embedded directory browsing, first-level project roots, shared roots, upload/create/delete operations, file preview, artifact access, and deliverable preview.

The same ACL boundary must protect listing, preview, upload, rename, delete,
task directory attachment, and automation deliverable access.

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
- Composer may attach a file that already exists in a Directory-visible server
  folder. This path registers an artifact reference through
  `POST /api/threads/:id/server-file-attachments` and must not copy the file
  through browser `dataBase64` upload. This server-file attachment path is
  Owner-only until a per-workspace server-share root is productized. The route
  must reject non-Owner callers before Directory path resolution and then
  resolve the requested path through the Directory browser boundary before
  registering the artifact.
- Server-file Composer attachment is local-file only in the first version.
  Remote/WSL volume entries remain browsable when supported by Directory, but
  they must not be attached as thread artifacts until a productized streaming
  or staging path exists.
- Delete must be explicit and non-recursive unless a dedicated audited policy says otherwise.
- Rename is a same-parent mutation, not a move operation. It must resolve the
  source entry through the Directory browser boundary, sanitize the new child
  name by entry type, reject overwriting an existing target, reject protected
  project/workspace roots, and keep local and remote/bridge paths under the
  same ACL rules as upload and delete.
- Deleting an empty in-scope directory is ordinary directory work. Deleting a
  non-empty directory is Owner high-privilege work and must be guarded by the
  directory delete policy. A low-permission Gateway result that reports Chinese
  or English permission-boundary text must still surface the Owner elevation
  action in the client.
- Direct Directory UI deletion must make the operation visible after the native
  delete confirmation. It should show an in-app progress/error toast, include
  directory-thread preparation failures in the same error path, and let Owner
  request a one-shot elevation token for the current directory context even when
  the selected workspace is not the Owner workspace. If the backend still
  reports `owner_high_privilege_required`, the client must retry with a
  one-shot token instead of relying on possibly stale local timed-elevation
  state. Message retry elevation remains Owner-workspace-only.
- Direct Directory UI file deletion must never fail silently. If the client
  cannot resolve the entry path from the row action payload, it must surface a
  visible error toast instead of returning without feedback.
- Directory content migration must use the checked mutation boundary rather
  than raw filesystem paths. `/api/directories/move-contents` moves direct
  children only after resolving both source and target through the same
  directory thread/workspace, requires both directories to be writable local
  directories, and fails on target-name conflicts instead of overwriting.
- A direct delete error such as `EACCES: permission denied, rmdir ...` after
  Owner elevation is a filesystem ownership/mode problem, not another model or
  Gateway permission prompt. Mac production diagnostics must catch
  `data/drive/users` directories that lost the owner write bit after import or
  migration.
- An approved Owner high-privilege Gateway run may delete only the exact
  non-empty directory target requested by the user after resolving the target
  through the current directory/workspace boundary. It must not broaden the
  delete to siblings, parent paths, hidden roots, cache roots, sync roots, or
  delivery roots. If the ordinary directory API still returns
  `owner_high_privilege_required` during an approved run, the model should use
  the available elevated filesystem/directory tool path for that exact target
  or report a bounded failure rather than silently attempting a broader delete.
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
- Directory-bound topic grouping must use the concrete directory route path and
  owner/effective workspace identity. A reused directory display name or
  project id, such as two workspaces each exposing `健康`, is not enough to
  merge topic collections.
- Directory-bound topic discovery must use a durable directory-topic index,
  not a full replay of the single-window message history. The mobile topic root
  loads directory collections and only a bounded recent topic page for each
  visible directory. Older topics are fetched by one-directory pagination, and
  concrete topic messages are fetched only after opening that topic.
- Directory-topic index repair must keep SQLite and `data/state.json`
  task-group metadata synchronized. Startup can import a state snapshot into
  SQLite, so a SQLite-only repair is not durable enough for production.
- Runtime-state normalization must preserve directory-topic index metadata such
  as `directoryRouteKey`, `ownerWorkspaceId`, `workspaceId`, `lastReceiptAt`,
  `lastUserPromptAt`, `messageCount`, `sortOrder`, `isDefault`, and `purpose`.
  Dropping those fields during SQLite-to-`state.json` snapshot export can make
  repaired directory-topic lists appear stale again after restart or cache
  refresh.
- Directory-bound topic row summaries use the same concise receipt-title rule
  as save-to-Note: prefer `homeai-note` title metadata, then Markdown headings,
  then the first useful receipt line. They must not fall back to the user's
  prompt when an assistant receipt summary exists.
- Directory-bound topic repair and list projection must use the durable
  `messages` table when available, not only the compact `threads.raw_json`
  snapshot. The compact thread snapshot can lag behind the final assistant
  receipt, so the repair path must update `taskGroupMeta.lastMessageId` and
  `lastReceiptTitle` from the latest real task-group message before syncing
  SQLite and `data/state.json`.
- Opening a directory-bound topic from the topic list must fetch real
  `messageMode=tasks` messages for that `taskGroupId`. Synthetic list entries
  such as `:last-user` and `:last-receipt` are summaries only and must not be
  treated as proof that the final assistant receipt is loaded.
- A plugin may claim a directory topic collection without moving files. Since
  `20260610-plugin-topic-dock-box-v687`, `claimed_by_plugin` claims with
  `hideFromDirectoryTopicRoot=true` are filtered out of the ordinary directory
  topic root and projected into the plugin topic switcher. `auxiliary_context`
  claims remain visible on the ordinary directory root. Claim filtering is keyed
  by effective workspace plus normalized route, not by display label.
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
- Static v643 keeps Directory loading/empty status cards theme-bound during
  navigation refreshes, so dark-mode parent-directory returns do not flash a
  hard-coded pale status surface.
- Static v933 groups child directory topic collections under their configured
  root directory in the topic root. For example, `Fanfan / Study Plan`,
  `Fanfan / Health`, and `Fanfan / Python` remain distinct route-bound topic
  collections internally, but render as one `Fanfan` parent row with
  subdirectory sections. This is a frontend projection only; it does not merge
  directory route keys, ACLs, context selection, or topic-open targets.
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

Since `20260610-plugin-topic-dock-box-v687`, plugin delivery directories do not
enter plugin topic context by scan. The plugin topic context source index marks
eligible files with roles such as `cleaned_summary`, `pinned_context`,
`topic_bound`, `context_source`, or `stage_summary`. Ordinary export PDFs,
images, tables, raw attachments, temporary results, and old report versions are
delivery-only unless an explicit eligible context source record exists.

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
- Markdown task and directory preview links keep the Hermes Markdown preview
  surface and must not be routed through native/original document preview.
  The task preview interceptor must recognize Markdown from all bounded link
  metadata sources used by deliverables (`data-artifact-name`, `download`,
  `title`, `aria-label`, link text, and same-origin `name`/`filename` query
  parameters), because some automation and task routes intentionally hide the
  physical filename behind an opaque delivery URL.
- PowerPoint task artifacts are first-class `presentation` documents in the
  task artifact helper, not generic files. They should keep their MIME/name
  metadata through task cards, preview links, native document bridge requests,
  Web Share/download fallback, and PowerPoint-compatible validation/readback.
- PDF, Word/DOC/DOCX, and PowerPoint/PPT/PPTX task and directory preview links
  must first use the explicit native-shell document bridge when the current
  iOS or Android shell advertises `HomeAINativeDocumentCapability.documentPreview`.
  The Web request type is `homeai.nativeDocument.open` and must include only a
  same-origin authorized file URL, bounded filename, MIME type, document kind,
  source surface, request id, and `requiresAuth:true`. It must not include raw
  filesystem paths, cookies, launch tokens, plugin credentials, or file bytes.
- If that native bridge is absent in ordinary browser/PWA contexts, PDF,
  Word/DOC/DOCX, and PowerPoint/PPT/PPTX task and directory preview links may
  open the in-app preview overlay on coarse-pointer or sub-`768px` mobile
  surfaces. If the page is in an iOS or Android native shell, bridge absence,
  timeout, or bounded native failure must show a visible in-app native-preview
  error state with actionable exits: retry native preview, use native open-in
  when advertised, download/share the same authorized file, copy the file link,
  or explicitly enter `webPreview=1` debug preview. The failure state must not
  silently fall back to PDF.js/DOCX Web preview or strand the user on a dead
  "cannot open" screen. Desktop/non-coarse wide screens may still navigate to
  the resolved original same-origin file URL for native/original document
  preview.
- Word/DOCX and PowerPoint/PPT/PPTX mobile preview should prefer native shell
  document handling. When iOS advertises `documentOpenIn`, task preview may
  enter the Open-In sheet directly for Office formats. Android uses its native
  `ACTION_VIEW` document path from `HomeAINativeDocument.open()`. The
  `file-viewer.html` internal Office text/placeholder preview is only the
  explicit Web debug fallback and must keep a light document surface so dark
  WebView backgrounds cannot make text unreadable.
- The PWA manifest must not lock orientation to portrait. File preview and
  reading surfaces rely on the current fingerprinted manifest allowing both
  portrait and landscape orientation, while the Web shell keeps the same
  single-column mobile layout in either orientation.
- Image preview must expose a same-window `保存到相册` action in both the full `file-viewer.html` shell and the in-app image overlay. The action should prefer system file share with the image blob and fall back to same-window download/long-press guidance; it must not open a separate browser window.
- `pdf-viewer.html` and `file-viewer.html` must also call the native document
  bridge directly on load for PDF, Word/DOC/DOCX, and PowerPoint/PPT/PPTX when
  the viewer is running inside the iOS or Android shell. The task/directory
  link interceptor is not sufficient because Android WebView bridge injection
  can happen after the viewer document starts executing.
- Native-shell viewer pages may wait briefly for the bridge after seeing
  `nativeShell=ios` or `nativeShell=android`. If the bridge does not appear or
  returns a bounded failure, they must show the native-preview error state
  rather than silently rendering Web preview. `webPreview=1` is the explicit
  debug escape hatch that forces the Web fallback.
- Bridge-unavailable messaging must distinguish a missing native capability
  from a transient preview timeout. If `HomeAINativeDocument` is not exposed on
  a native-shell device, the user-facing message should explain that restarting
  usually cannot repair the missing bridge and should direct the user to update
  the native shell or use the explicit Web preview/download/share exits.
- PDF mobile preview surfaces must expose a single preview-mode switch rather
  than a separate external-open action. In a native shell the switch first
  retries `HomeAINativeDocument.open()`; only bridge-unavailable/failure paths
  navigate to the already-authorized original same-origin file URL. This must
  not introduce a separate unauthenticated native-file path or bypass the
  Directory/file ACL boundary. Native-shell PDF failure states must also expose
  the same actionable exits as task preview: open-in when available,
  download/share, and explicit Web debug preview.
- PDF, Word/DOC/DOCX, and PowerPoint/PPT/PPTX preview share/open menus may use
  the native iOS open-in bridge when the shell explicitly advertises
  `HomeAINativeDocumentCapability.documentOpenIn === true`. The Web request is
  the same ACL-protected native document open request plus `mode:"openIn"`;
  success stops the Web share path, while bridge absence or bounded failure
  falls back to the existing Web Share/download behavior. Android and ordinary
  browser/PWA contexts must not regress.
- DOCX adapted text extraction remains available to backend/document-preview
  services only as the bridge-unavailable Web fallback. Native Word viewing is
  the preferred Android/iOS shell path when layout fidelity is needed.
- Gateway `file` toolset document delivery includes real `.pdf`, `.docx`, and
  `.pptx` generation through profile-local `pdf_create`, `docx_create`, and
  `pptx_create`. These tools write only inside the current allowed
  artifact/output roots and must return `MEDIA:<path>` for user-downloadable
  deliverables. `pptx_create` must validate a PowerPoint-compatible OpenXML
  package before returning `MEDIA:<path>`: slide relationships are necessary
  but not sufficient; the deck must also include a normal presentation
  properties/view properties/table styles set, complete theme color/font/format
  scheme, slide master color map, layout, and relationship graph. `pptx_validate`
  is the explicit re-check tool for existing in-scope PPTX decks. Health-plugin
  document workflows such as medication instructions, ECG summaries, checkup
  report organization, and presentation handouts can choose Markdown, PDF,
  Word, or PowerPoint output through the same delivery boundary; private health
  records must not be copied into docs, logs, or model-visible debug output.
- ZIP archive handling for low-permission Gateway runs is provided by the
  profile-local `hermes-mobile-archive` file plugin. `archive_list` may list
  in-scope ZIP entries and `archive_extract_safe` may extract only inside the
  current allowed roots. It must fail closed on path traversal, absolute paths,
  symlinks, encrypted entries, unsupported compression methods, overwrite
  attempts, and configured size/count limits. This is not shell, terminal,
  package-manager access, or a bypass around the Directory/file ACL boundary.
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
- Run `node tests\hermes-mobile-archive-plugin.test.js` when changing the
  profile-local archive file tool.
- Run `node tests\thread-read-upload-api-routes.test.js` and
  `node tests\server-file-attachment-ui.test.js` when changing Composer
  server-file attachment behavior.
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
