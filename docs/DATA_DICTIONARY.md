# Hermes Mobile Data Dictionary

Last updated: 2026-05-26.

This is a public-safe dictionary of durable SQLite tables and their ownership. It intentionally omits raw data values.

## Runtime SQLite

Primary implementation: `adapters/mobile-sqlite-store.js`.

| Table | Domain | Purpose |
| --- | --- | --- |
| `schema_migrations` | runtime | Runtime SQLite schema migration tracking. |
| `meta` | runtime | Small key/value runtime metadata. |
| `workspaces` | auth/workspace | Local workspace records and public-safe config fields. |
| `access_keys` | auth | Hashed Access Key records and key status metadata. |
| `threads` | chat/tasks | Thread records, workspace/project routing, single-window/group metadata. |
| `messages` | chat/tasks | User/assistant messages, statuses, task groups, run metadata summaries. |
| `artifacts` | files | Registered output artifacts tied to threads/messages/workspaces. |
| `push_subscriptions` | web push | Browser push subscription records. Treat endpoints as sensitive. |
| `push_receipts` | web push | Notification read/receipt state and mark keys. |
| `push_deliveries` | web push | Delivery attempt metadata and message type summaries. |
| `shared_directories` | directory/share | Web-created or ACL-derived shared root records and target permissions. |
| `kanban_case_shares` | kanban/share | Case/topic sharing metadata. |
| `todo_items` | todo/kanban | Local or migrated Todo records when backed by SQLite. |
| `automation_jobs` | automation | Local automation records when backed by SQLite. |
| `topic_context_summaries` | topics | Compacted topic context summaries. |
| `topic_working_states` | topics | Active topic working state metadata. |
| `topic_context_refs` | topics | References between topic summaries and target resources. |
| `audit_log` | audit | Security/operation audit entries. Do not store secrets or raw learner content. |

## Topic Context SQLite

Primary implementation:

- `adapters/context-assembly-service.js`
- `adapters/topic-context-compaction-service.js`
- `adapters/mobile-sqlite-store.js`

These tables support layered prompt assembly for Chat, group chat, and task
groups. They are summary/audit metadata, not the source of raw chat truth.
Raw messages remain in `messages`.

| Table | Important Fields | Notes |
| --- | --- | --- |
| `topic_context_summaries` | `topic_id`, `task_group_id`, `workspace_id`, `summary_json`, `summary_version`, `last_compacted_message_id`, `last_compacted_event_id`, `input_hash`, `created_at`, `updated_at` | Stores the compact topic summary used by layered context assembly. `summary_json` should contain only bounded summary fields, source ids, versions, and timestamps. |
| `topic_working_states` | `topic_id`, `task_group_id`, `workspace_id`, `state_json`, `state_version`, `status`, `created_at`, `updated_at` | Stores current working state for a task group. It is not a full execution log. |
| `topic_context_refs` | `ref_id`, `topic_id`, `task_group_id`, `workspace_id`, `ref_type`, `target_id`, `role`, `ref_json`, `created_at`, `updated_at` | Stores compact refs to messages, tool results, artifacts, files, runs, or other evidence. |

Privacy rule: do not store raw prompts, full model responses, full learner
answers, full transcripts, full questions, answer keys, push endpoints, raw
secrets, or long tool logs in these tables.

## Action Inbox SQLite

Primary implementation: `adapters/action-inbox-service.js` plus SQLite helpers in `adapters/mobile-sqlite-store.js`.

These tables were added in runtime SQLite schema version 4 for the `20260526-action-inbox-v247` Inbox UI.

| Table | Domain | Purpose |
| --- | --- | --- |
| `action_inbox_items` | inbox | Local summary/action items for manual todos, automation deliveries, Growth next actions, review requests, and follow-ups. |
| `action_inbox_events` | inbox/audit | Auditable event timeline for Inbox item state changes and source updates. |

## Learning-Growth SQLite

Primary implementation: `adapters/learning-program-repository.js`.

| Table | Domain | Purpose |
| --- | --- | --- |
| `learning_schema_migrations` | learning | Learning schema migration tracking. |
| `learning_programs` | planning | Learner programs, status, goals, and summary config. |
| `learning_plan_drafts` | planning | Draft plans before publication. |
| `learning_parent_review_items` | review | Draft-publication parent review queue. |
| `learning_publications` | planning | Published draft records and timestamps. |
| `learning_sources` | source | Summary-only learning source records. No full answers/transcripts/questions. |
| `learning_goals` | goals | Stage goals and priorities. |
| `learner_profiles` | profile | Summary learner profile records. |
| `learner_skill_states` | profile | Skill-level learner state before the newer mastery profile layer. |
| `learning_curriculum_references` | curriculum | Metadata/reference layer for curriculum stages and domains. |
| `learning_task_cards` | tasks | Canonical native learning task cards. |
| `learning_interaction_sessions` | tasks | Task interaction/session state. |
| `learning_evaluations` | evaluation | Evaluation summaries and verification state. |
| `learning_task_submissions` | submission | Authorized task submissions, including bounded metadata and private task-detail projection. |
| `learning_task_reflections` | reflection | Reflection evidence summaries and audio metadata. |
| `learning_task_artifacts` | artifacts | Task-related artifacts and metadata. |
| `learning_parent_review_requests` | review | Generic evaluation/reward review requests. |
| `learning_reward_settlements` | rewards | Idempotent reward settlement records. |
| `learning_task_series_recommendations` | evergreen | Series recommendation metadata. |
| `learning_growth_evaluation_jobs` | queue | Durable async evaluation queue with lease/retry/completion fields. |
| `learning_growth_mastery_states` | mastery | Fine-grained ability/mastery profile states and evidence summaries. |
| `learning_growth_card_trajectories` | mastery | Auditable card sequence/strategy trajectory records. |

## Privacy Rules

- Do not store full child answers, full transcripts, full questions, answer keys, raw prompts, endpoints, local private paths, or secrets in planning/profile/source docs or handoffs.
- Task-detail APIs may expose authorized learner submissions for the specific card view; do not copy that content into broad summaries or docs.
- Audio routes should stream through authenticated APIs; docs should mention ids/routes only when needed.

## Migration Rules

- Runtime SQLite migrations belong in `mobile-sqlite-store.js` and must preserve existing data.
- Learning migrations belong in `learning-program-repository.js` and must use additive/compatible migration patterns.
- New durable queues or audit-sensitive tables need indexes for status/lookup fields and focused repository tests.
- Action Inbox migrations must remain additive, idempotent, and backed by source-reference dedupe indexes before any production cutover from Kanban-backed Todo.
