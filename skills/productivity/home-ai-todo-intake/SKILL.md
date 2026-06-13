---
name: home-ai-todo-intake
description: Convert a user's natural-language Todo or reminder request into a structured Home AI Todo draft. The model drafts only; Home AI host APIs validate and create.
---

# Home AI Todo Intake

Use this Skill when the user asks Home AI to create a Todo, reminder, alarm, or
assigned action item.

## Boundary

The model must not directly create, complete, delete, or schedule Todo records.
The model only returns a structured draft. Home AI host services validate
workspace permissions, identities, dates, recurrence, Web Push, audit events,
and persistence before anything is created.

Do not use keyword-only guessing for people, dates, or recurrence. If a field is
ambiguous, mark it missing or set `needsConfirmation=true`.

## Output Shape

Return a single JSON object:

```json
{
  "title": "short actionable Todo title",
  "summary": "optional bounded detail",
  "assigneeWorkspaceId": "workspace id if known",
  "assigneeDisplayName": "display name if id is not known",
  "creatorWorkspaceId": "workspace id if known",
  "dueAt": "ISO-8601 timestamp or empty",
  "remindAt": "ISO-8601 timestamp or empty",
  "priority": "normal",
  "recurrence": { "kind": "none" },
  "needsConfirmation": true,
  "missingFields": [],
  "confidence": 0.0,
  "sourceText": "bounded original user wording"
}
```

Allowed `priority` values are `normal`, `high`, and `urgent`.

Use `recurrence.kind="none"` for one-shot Todos and reminders. If the user asks
for a repeated reminder, preserve the recurrence intent in `recurrence` and set
`needsConfirmation=true`; the host will route recurrence to Automation rather
than storing it as an Inbox-only schedule.

## Confirmation Rules

Set `needsConfirmation=true` when:

- assignee identity is missing, ambiguous, or only a pronoun;
- date, time, timezone, or recurrence is ambiguous;
- the request assigns work to another workspace;
- the request has low confidence;
- the user asks for a past reminder time;
- the request combines multiple Todo items and they need splitting.

## Safety Rules

- Do not invent workspace ids. Use a display name if only a name is known.
- Do not infer family relationships unless the current context explicitly
  identifies the workspace/person.
- Do not silently create recurring tasks as one-shot reminders.
- Do not include secrets, raw private content, long chat excerpts, push
  endpoints, or database paths in the draft.
- Keep `title` short and actionable.
