# Wardrobe Operations Notes

Use Wardrobe for these tasks:

- finding clothes by type, color, season, material, or occasion;
- checking item details and photo completeness;
- recording wear history after the user confirms an outfit;
- suggesting outfits from owned items;
- preparing packing or capsule lists;
- identifying duplicate, stale, or underused pieces.

For recommendations, make the result actionable. Mention the exact items to wear, why they fit the weather or occasion, and one fallback when useful. Do not turn a simple outfit request into a large inventory report.

For data cleanup, use cautious write behavior. When the user asks to rename, merge, delete, or update items, preview the target item first. After the operation, verify the updated state and report the result in plain language.

For weather-aware recommendations, prefer Home AI environment context when current. If it is missing or stale, use an approved weather source. Avoid exposing exact coordinates or raw environment payloads.

For photos, keep privacy tight. It is fine to say an item has no usable photo, a thumbnail exists, or a photo should be retaken. Do not show local paths or internal cache names.
