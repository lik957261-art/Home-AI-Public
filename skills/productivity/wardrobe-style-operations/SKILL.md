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
