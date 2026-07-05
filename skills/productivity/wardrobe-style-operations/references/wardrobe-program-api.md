# Wardrobe Program API Boundary

Wardrobe runs as a local Hermes embedded plugin. Home AI owns the browser shell, workspace authorization, same-origin proxy, and launch-token exchange. The Wardrobe plugin owns wardrobe data, photos, outfit history, local database state, and MCP tools.

The host registers a workspace with `POST /api/v1/hermes/plugin/workspaces`. The request uses a server-side owner registration credential and a generated workspace access key. The raw key is stored only in the workspace-local `.hermes-wardrobe/access-key.txt` file and must not be shown to the user or copied into chat.

The host launches the iframe with `POST /api/v1/hermes/plugin/launch`. The launch request uses the workspace access key server-side and returns a short-lived launch path. The iframe should open through Home AI's same-origin proxy path, not by exposing the raw plugin origin to the browser.

Model-side operations should use the Wardrobe MCP tools. They should not call the Program API directly unless the platform has explicitly exposed a safe wrapper tool. If a launch or authorization error appears, report it as a deployment issue and avoid trying to discover or print secrets.

Expected safe workflow:

1. Read the relevant wardrobe state with MCP tools.
2. Perform the requested change or recommendation.
3. Verify through a second readback.
4. Return a short, user-facing summary.

Forbidden workflow:

1. Reading `.hermes-wardrobe/access-key.txt`.
2. Printing bearer tokens, launch tokens, session cookies, or local database paths.
3. Switching to another workspace id.
4. Returning raw inventory dumps or private photo paths.
