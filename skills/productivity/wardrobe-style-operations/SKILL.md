---
name: wardrobe-style-operations
description: Use the Wardrobe MCP toolset for the active Hermes workspace's wardrobe reads, writes, photo checks, and outfit history. This is a keyless template; credentials live only in the workspace .hermes-wardrobe directory.
---

# Wardrobe Style Operations

Use the `wardrobe` MCP toolset for wardrobe item search, item readback, photo upload or verification, outfit recommendations, and wear-history writeback.

Rules:

- Treat the active Hermes workspace as the only wardrobe owner.
- Do not override the Wardrobe MCP workspace at runtime.
- Do not read, print, copy, or summarize access-key files.
- Do not store keys, launch tokens, private image paths, or full inventory dumps in chats, logs, docs, or receipts.
- For writes, prefer dry-run or preview first when the tool supports it, then verify through Wardrobe readback.
- For outfit recommendations, first use Home AI `environment_context` when it is present and matches the user's current-device location and target time. Treat it as the primary local weather context.
- If `environment_context` is unavailable, lacks weather, is stale for the requested target time, or the user asks about another city or destination, fall back to the `weather` toolset instead of inventing conditions.
- Do not expose raw native location payloads, exact coordinates, or full forecast arrays in the visible answer or Markdown receipt.

## Operating Flow

1. Resolve the active workspace from the host-provided Gateway context. Do not
   infer another wardrobe owner from chat history, file names, or copied notes.
2. Use the Wardrobe MCP tools for catalog lookup and readback. Prefer code,
   role, season, color, material, size, warmth, and wear-history facts returned
   by the tool over free-form text in the conversation.
3. For outfit recommendations, keep uncertain facts explicit. If an item code
   is missing, ask for clarification or use a read-only search before proposing
   a write action.
4. For deterministic wear-history writeback, use the host action bridge when it
   supplies an `outfit_wear_intent`. Do not simulate that bridge with a normal
   model reply.
5. When a tool returns `needs_confirmation`, explain the conflict briefly and
   wait for the host confirmation action before using replace mode.
6. After a write, verify through Wardrobe readback and summarize only bounded
   fields such as date, roles, item codes, and stored state.

## Safety Boundary

Wardrobe operations are workspace-private. This Skill does not contain keys,
launch tokens, image payloads, private database rows, or plugin-local paths.
Never ask the user to paste those values. If a required MCP callable or
workspace binding is absent, report the missing capability instead of
inventing inventory facts or recording history through another route.
