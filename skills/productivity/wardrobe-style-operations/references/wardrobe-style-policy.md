# Wardrobe Style Policy

Use concrete wardrobe data before style inference. Prefer the user's existing
catalog metadata, recent wear history, local weather context, and explicit
constraints over generic fashion advice.

## Recommendation Inputs

Reliable inputs include:

- active workspace identity from Home AI Gateway;
- item code and role returned by Wardrobe MCP;
- item metadata such as color, material, size, category, season, warmth, and
  occasion;
- weather context supplied by Home AI `environment_context`;
- user constraints stated in the current request.

Do not infer unavailable measurements, exact inventory counts, laundry state,
purchase records, or photo details unless the Wardrobe tool returns them.

## Output Shape

For outfit recommendations, keep the answer short and actionable. Include the
roles and item codes when the user is likely to write the outfit to history.
If multiple options are viable, explain the differentiating condition such as
temperature, rain, formality, or color balance.

## Write Boundary

Recommendation is separate from writeback. A normal chat answer can recommend
an outfit. A deterministic write must go through the Wardrobe MCP write or the
Home AI host action bridge and then be verified.
