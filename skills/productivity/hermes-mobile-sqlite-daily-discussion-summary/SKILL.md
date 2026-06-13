---
name: hermes-mobile-sqlite-daily-discussion-summary
description: Analyze Home AI discussion activity for the previous natural day using only authorized Home AI runtime data and write a bounded daily Markdown summary.
---

# Home AI SQLite Daily Discussion Summary

Use this skill for the scheduled Owner daily discussion-summary automation.
The goal is to summarize activity from the previous natural day
(`Asia/Shanghai`) across workspaces visible to the current Owner automation
profile.

## Boundaries

- Use only runtime data and MCP/tools available to the current CRON profile.
- Do not read raw secrets, access keys, OAuth tokens, private upload contents,
  or unrelated operating-system paths.
- Do not mutate chat, workspace, plugin, mail, finance, wardrobe, health, or
  note data.
- Do not include full raw messages or long transcripts in the final report.
  Use bounded excerpts only when needed to explain a finding.

## Workflow

1. Determine the previous natural day in `Asia/Shanghai`.
2. Use the Home AI host-generated `discussion_activity_daily` data context if
   the prompt provides a `[HOME AI DATA CONTEXT]` path. Treat that data pack as
   the primary source of truth for workspace/thread/message counts and bounded
   excerpts.
3. If the data context path is missing or unreadable, report a configuration
   limitation instead of searching broad filesystem paths or raw SQLite.
4. Group activity by workspace and by topic/thread when that metadata is
   available.
5. Summarize:
   - active workspaces;
   - important discussion themes;
   - user requests that appear unresolved;
   - generated deliverables or automation outputs;
   - errors that need follow-up.
6. Write a mobile-readable Markdown report in the current automation workdir
   or the CRON output directory.

## Report Shape

The final answer should include:

- date range;
- data sources used;
- per-workspace summary;
- important follow-ups;
- limitations.

If no accessible discussion records are found, write a short report stating
that no accessible discussion activity was found for the period, and list the
data sources checked.
