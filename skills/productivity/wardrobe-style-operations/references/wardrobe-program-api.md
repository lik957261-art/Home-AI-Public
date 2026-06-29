# Wardrobe Program API Reference

This reference is a non-secret operational summary for Home AI Gateway runs.
Use the active Hermes workspace and the Wardrobe MCP toolset only. Do not read
or print workspace key files, launch tokens, cookies, local image payloads, or
raw database rows.

## Read Before Write

Use Wardrobe read tools to resolve stable item codes, roles, and existing
history before writing. The visible response may mention bounded facts such as
item code, role, color, material, size, season, and stored state. It must not
include plugin private paths, key file locations, full image payloads, or raw
database exports.

## Outfit Wear Intent

When Home AI attaches an `outfit_wear_intent` to a message, the host action
button owns execution. A model run should not execute the write implicitly.
The intent is expected to carry:

- `type: outfit_wear_intent`
- `schema_version`
- `plugin_id: wardrobe`
- `principal_id`
- `workspace_id`
- `wear_date`
- `timezone`
- `items` with role and item code
- `source_message`
- `idempotency_key`
- `expires_at`

If any required field is missing, stale, cross-workspace, or cross-principal,
treat the intent as not executable.

## Confirmation

If execution returns `needs_confirmation`, do not retry automatically. Wait for
the host confirmation UI and then use the explicit replace confirmation shape
required by the current Wardrobe MCP contract.

## Result Summary

After a successful write, summarize stored state, outfit id if present, date,
and item role/code pairs. If readback verification fails, say that the write
was not verified rather than presenting it as confirmed.
