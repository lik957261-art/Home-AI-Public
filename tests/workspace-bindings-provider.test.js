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
  assert.equal(bindings.channels[0].accountId, "acct");
  assert.deepEqual(bindings.connectorProfiles, ["mail"]);
}

function testOwnerGetsExternalBindingsAndAccessPolicyAdditions() {
  const provider = createWorkspaceBindingsProvider({
    ownerExternalAccessPolicy: () => ({
      allowed_toolsets: ["hermes-email"],
      connector_profiles: { email: "owner", hotmail: "owner" },
    }),
    ownerExternalInterfaceBindings: () => [{ id: "github", label: "GitHub", category: "Connector" }],
  });
  const bindings = provider.publicBindings({
    id: "owner",
    policy: { allowed_toolsets: ["web"] },
  });

  assert.deepEqual(bindings.interfaces, [{ id: "github", label: "GitHub", category: "Connector" }]);
  assert.deepEqual(provider.accessPolicyAdditions({ id: "owner", policy: { allowed_toolsets: ["web"] } }), {
    allowed_toolsets: ["web", "hermes-email"],
    connector_profiles: { email: "owner", hotmail: "owner" },
  });
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

function testQqmailToolsetsAreShownAndGrantedAsOwnMailConnector() {
  const provider = createWorkspaceBindingsProvider();
  const bindings = provider.publicBindings({
    id: "weixin_example_user",
    policy: {
      allowed_toolsets: ["web", "example_user_qqmail", "qq_mail"],
    },
  });

  assert.deepEqual(bindings.interfaces.map((item) => item.id), ["example_user_qqmail", "qq_mail"]);
  assert.deepEqual(provider.accessPolicyAdditions({
    id: "weixin_example_user",
    policy: { allowed_toolsets: ["web", "example_user_qqmail"] },
  }), {
    allowed_toolsets: ["web", "example_user_qqmail"],
    connector_profiles: { mail: "example_user_qqmail", qqmail: "example_user_qqmail" },
  });
}

testFiltersCommonToolsetsAndShowsSpecialInterfaces();
testOwnerGetsExternalBindingsAndAccessPolicyAdditions();
testCustomChannelProvider();
testQqmailToolsetsAreShownAndGrantedAsOwnMailConnector();
console.log("workspace-bindings-provider tests passed");
