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

## Operating Pattern

When the user asks about clothes, outfits, packing, missing photos, wardrobe cleanup, or wear history, use the Wardrobe MCP toolset as the source of truth. Start with readback before writing: list or search items, inspect the item or look that will be changed, then perform the smallest write needed. After a write, verify with a second readback and summarize only the user-visible result.

Never assume another workspace's wardrobe. The host provides the active workspace through the local Hermes binding, and this skill must not override it with a manual workspace id. If a tool reports that the workspace is missing or unauthorized, stop and report a setup problem instead of trying alternate keys or paths.

For styling advice, combine wardrobe facts with the user's current context. Use available weather, calendar intent, formality, travel, laundry constraints, and recent wear history. If those signals are absent, ask a narrow follow-up only when it materially changes the recommendation. Prefer practical outfits over exhaustive catalog dumps.

For photos and media checks, use the plugin's own photo/status tools. Do not read local image files directly unless the tool explicitly returns a safe, plugin-owned preview path. Avoid embedding private local paths in answers; describe the item and whether the photo state is usable.

For exports or printable summaries, use the helper script in `scripts/render_wardrobe_phone_pdf.py` only with sanitized JSON produced by Wardrobe tools. The script is a formatter, not an authority. Do not add access keys, launch tokens, session cookies, or raw database rows to the input.

## Evidence To Return

Keep receipts compact. Good evidence includes item names, look names, high-level counts, tool success states, and the specific user-facing change made. Bad evidence includes raw access keys, bearer headers, SQLite paths, full inventory dumps, private image paths, or hidden plugin session details.
