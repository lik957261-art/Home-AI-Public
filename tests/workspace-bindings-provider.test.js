"use strict";

const assert = require("node:assert/strict");
const { createWorkspaceBindingsProvider } = require("../adapters/workspace-bindings-provider");

function testFiltersCommonToolsetsAndShowsSpecialInterfaces() {
  const provider = createWorkspaceBindingsProvider({
    interfaceToolsetsJson: () => JSON.stringify({
      qqmail: { label: "QQ Mail", category: "Mail" },
    }),
  });
  const bindings = provider.publicBindings({
    id: "workspace_a",
    accountId: "acct",
    userId: "user",
    chatId: "chat",
    target: "origin",
    contextTokenAvailable: true,
    outboundStatus: "verified",
    policy: {
      allowed_toolsets: ["web", "todo", "qqmail", "unknown"],
      connector_profiles: { mail: "qqmail" },
    },
  });

  assert.deepEqual(bindings.allowedToolsets, ["web", "todo", "qqmail", "unknown"]);
  assert.deepEqual(bindings.interfaces, [{ id: "qqmail", label: "QQ Mail", category: "Mail" }]);
  assert.equal(bindings.channels.length, 1);
  assert.equal(bindings.channels[0].type, "weixin");
  assert.equal(bindings.channels[0].label, "微信");
  assert.equal(bindings.channels[0].accountId, "acct");
  assert.deepEqual(bindings.connectorProfiles, ["mail"]);
}

function testOwnerGetsExternalBindings() {
  const provider = createWorkspaceBindingsProvider({
    ownerExternalInterfaceBindings: () => [{ id: "github", label: "GitHub", category: "Connector" }],
  });
  const bindings = provider.publicBindings({
    id: "owner",
    policy: { allowed_toolsets: ["web"] },
  });

  assert.deepEqual(bindings.interfaces, [{ id: "github", label: "GitHub", category: "Connector" }]);
}

function testCustomChannelProvider() {
  const provider = createWorkspaceBindingsProvider({
    workspaceChannels: (workspace) => workspace.id === "local"
      ? [{ type: "email", label: "Email", accountId: "mailbox" }]
      : [],
  });
  const bindings = provider.publicBindings({ id: "local", policy: {} });

  assert.deepEqual(bindings.channels, [{ type: "email", label: "Email", accountId: "mailbox" }]);
}

testFiltersCommonToolsetsAndShowsSpecialInterfaces();
testOwnerGetsExternalBindings();
testCustomChannelProvider();
console.log("workspace-bindings-provider tests passed");
