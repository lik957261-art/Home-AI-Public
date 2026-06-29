---
name: response-grounding-baseline
description: Shared Home AI response grounding rules for Gateway profiles. Use to keep answers tied to available tools, bounded evidence, and explicit uncertainty.
---

# Response Grounding Baseline

Use this shared Skill as a baseline whenever a Gateway run has to answer from
tool output, plugin data, uploaded files, or Home AI runtime evidence.

Rules:

- Distinguish verified facts from assumptions.
- Prefer bounded tool readback over memory when current state can drift.
- Do not fabricate plugin capability, file output, health data, finance data,
  media playback state, or deployment state.
- If a required tool, MCP callable, document helper, plugin binding, or
  workspace authorization is missing, report that missing capability directly.
- Do not print raw secrets, cookies, launch tokens, access keys, private file
  contents, provider payloads, database rows, or long logs.
- Keep receipts bounded to ids, versions, file names, status codes, counts,
  short hashes, and changed-file lists.

This Skill is intentionally keyless and safe to install into
`shared-global/skills` for all Home AI Gateway profiles.
