# Module: Group Chat

## Responsibility

Group chat owns shared conversation mode, membership, mention notifications, group-visible AI runs, recall, and group artifact visibility.

Ordinary private chat and group chat share the single-window infrastructure but must not share one visible message list.

## Core Rules

- Ordinary chat uses internal `taskGroupId=chat`.
- Group chat uses internal `taskGroupId=group-chat`.
- Group membership is stored on the single-window thread as `chatGroup.memberWorkspaceIds`.
- Owner manages group membership.
- Ordinary group sends use `messageKind=plain` and do not start Hermes.
- Group AI sends use `messageKind=ai`, create the usual assistant response, and keep both prompt and reply visible to group members.
- AI run access policy is resolved from the sending workspace, not blindly from the thread owner.

## Push Rules

- Normal group messages and group AI terminal events must not create broad generic Web Push notifications.
- Explicit `@member` mentions may send high-urgency Web Push only to mentioned member principals and never to the sender.
- Mention notification links should deep-link to `view=single&groupChat=1`.

## Artifact Rules

- A non-owner group member may preview only artifacts attached to visible `group-chat` messages in a group they belong to.
- Future group-chat AI deliverables should be written under the Web-managed group delivery root and referenced by `MEDIA:` so every group member can preview them through Hermes Mobile.

## Recall Rules

- A group member can revoke their own group user message.
- Owner can revoke any group user message.
- Revoked messages keep sender/time/revocation metadata and replace content with a fixed revoked placeholder.
- If the revoked user message was an AI request, the immediately paired assistant reply should also be revoked, active runs should be stopped when possible, artifacts removed, and the next queued group-chat run scheduled if needed.

## Validation

- Route/service tests for group membership, read/write, recall, mentions, and artifact access.
- `node tests\web-push-delivery-service.test.js` when mention notifications change.
- `node tests\task-list-ui.test.js` when group chat UI routing changes.
