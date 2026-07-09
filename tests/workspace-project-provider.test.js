"use strict";

const assert = require("node:assert/strict");
const { createWorkspaceProjectProvider } = require("../adapters/workspace-project-provider");

function run() {
  let reads = 0;
  const provider = createWorkspaceProjectProvider({
    usersPaths: ["users.json"],
    routeMapPaths: ["routes.json"],
    projectMapPaths: ["projects.json"],
    repoRoot: "/repo",
    defaultOwnerWorkspace: "/data/drive",
    cacheTtlMs: 60_000,
    readJsonFirst(paths, fallback) {
      reads += 1;
      const key = paths[0];
      if (key === "users.json") {
        return {
          path: key,
          data: {
            users: [{
              principal_id: "workspace_a",
              principal_label: "Workspace A User",
              default_workspace: "/workspace/a",
              account_id: "acct_a",
              show_task_id: false,
            }],
          },
        };
      }
      if (key === "routes.json") {
        return {
          path: key,
          data: {
            routes: [{
              principal_id: "workspace_a",
              principal_label: "Workspace A",
              access_mode: "restricted",
              aliases: ["a"],
              max_parallel_tasks: 2,
            }],
            principal_allowed_targets: {},
          },
        };
      }
      if (key === "projects.json") {
        return {
          path: key,
          data: {
            entries: [{ project_key: "alpha", wsl_root: "/workspace/a/alpha", aliases: ["Alpha"] }],
          },
        };
      }
      return { path: "", data: fallback };
    },
    normalizeStringList(value) {
      return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
    },
    buildAccessPolicy(route, user) {
      return {
        principal_id: route.principal_id || user.principal_id || "owner",
        access_mode: route.access_mode || user.access_mode || "restricted",
        default_workspace: user.default_workspace || route.default_workspace || "",
        connector_profiles: Object.assign({}, route.connector_profiles || {}, user.connector_profiles || {}),
        account_type: user.account_type || route.account_type || "",
        allowed_owner_special_plugins: user.allowed_owner_special_plugins || route.allowed_owner_special_plugins || [],
      };
    },
    fallbackOwnerPolicy() {
      return {
        principal_id: "owner",
        principal_label: "Admin Owner",
        access_mode: "unrestricted",
        default_workspace: "/repo",
        reason: "fallback",
      };
    },
    ownerLabel: () => "Admin Owner",
    ownerAliases: () => "owner,admin",
    localWorkspaces: () => [{
      id: "local_user",
      label: "Local User",
      defaultWorkspace: "/workspace/local",
      allowedRoots: ["/workspace/local"],
      connectorProfiles: { google: "local_user", gmail: "local_user" },
      accountType: "media",
      allowedOwnerSpecialPlugins: ["music", "movie"],
    }],
    projectsForWorkspace(workspace, projectEntries) {
      return [{
        id: `${workspace.id}-project`,
        workspaceId: workspace.id,
        label: projectEntries[0]?.aliases?.[0] || "Project",
        root: workspace.defaultWorkspace,
      }];
    },
  });

  const catalog = provider.loadCatalog();
  assert.equal(catalog.sources.users, "users.json");
  assert.equal(catalog.sources.routes, "routes.json");
  assert.equal(catalog.sources.projectMap, "projects.json");
  assert.equal(catalog.workspaces.length, 3);
  assert.equal(catalog.workspaces[0].id, "owner");
  assert.equal(catalog.workspaces[0].label, "Admin Owner");
  assert.equal(catalog.workspaces[0].defaultWorkspace, "/data/drive");
  assert.deepEqual(catalog.workspaces[0].aliases, ["owner", "admin"]);
  assert.equal(catalog.workspaces[1].id, "workspace_a");
  assert.equal(catalog.workspaces[1].label, "Workspace A");
  assert.equal(catalog.workspaces[1].accountId, "acct_a");
  assert.equal(catalog.workspaces[1].showTaskId, false);
  assert.equal(catalog.workspaces[2].id, "local_user");
  assert.equal(catalog.workspaces[2].source, "local-workspace");
  assert.equal(catalog.workspaces[2].accountType, "media");
  assert.equal(catalog.workspaces[2].restrictedMedia, true);
  assert.deepEqual(catalog.workspaces[2].allowedOwnerSpecialPlugins, ["music", "movie"]);
  assert.equal(catalog.workspaces[2].policy.default_workspace, "/workspace/local");
  assert.deepEqual(catalog.workspaces[2].policy.connector_profiles, { google: "local_user", gmail: "local_user" });
  assert.equal(catalog.workspaces[2].policy.account_type, "media");
  assert.deepEqual(catalog.workspaces[2].policy.allowed_owner_special_plugins, ["music", "movie"]);
  assert.equal(catalog.projects.length, 3);
  assert.equal(reads, 3);

  const cached = provider.loadCatalog();
  assert.strictEqual(cached, catalog);
  assert.equal(reads, 3);

  provider.invalidate();
  const reloaded = provider.loadCatalog();
  assert.notStrictEqual(reloaded, catalog);
  assert.equal(reads, 6);
}

run();
console.log("workspace-project-provider contract passed.");
