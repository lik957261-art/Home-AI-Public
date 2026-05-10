"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createExternalIntegrationProvider } = require("../adapters/external-integration-provider");

function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-external-provider-"));
  const envPath = path.join(root, "hermes.env");
  const configPath = path.join(root, "config.yaml");
  const githubHostsPath = path.join(root, "hosts.yml");
  const googleTokenPath = path.join(root, "google-token.json");
  const googleSecretPath = path.join(root, "google-secret.json");
  const outlookTokenPath = path.join(root, "outlook-token.json");

  fs.writeFileSync(envPath, [
    "MS_GRAPH_CLIENT_ID=client-id",
    "EMAIL_IMAP_HOST=imap.qiye.aliyun.com",
    "EMAIL_SMTP_HOST=smtp.qiye.aliyun.com",
    "EMAIL_HOME_ADDRESS=owner@hotmail.com",
  ].join("\n"));
  fs.writeFileSync(configPath, "outlook_graph:\n  enabled: true\n");
  fs.writeFileSync(githubHostsPath, "github.com:\n  oauth_token: redacted\n");
  fs.writeFileSync(googleTokenPath, "{}\n");
  fs.writeFileSync(googleSecretPath, "{}\n");
  fs.writeFileSync(outlookTokenPath, "{}\n");

  const provider = createExternalIntegrationProvider({
    envPaths: [envPath],
    configPaths: [configPath],
    githubCliHostsPaths: [githubHostsPath],
    googleTokenPaths: [googleTokenPath],
    googleClientSecretPaths: [googleSecretPath],
    outlookGraphTokenPaths: [outlookTokenPath],
  });

  assert.deepEqual(provider.ownerInterfaceBindings().map((item) => item.id), [
    "owner_github",
    "owner_google",
    "owner_outlook",
    "owner_alimail",
    "owner_hotmail",
  ]);
  assert.deepEqual(provider.ownerAccessPolicy(), {
    allowed_toolsets: ["google_workspace", "hermes-email"],
    connector_profiles: {
      google: "owner",
      gmail: "owner",
      outlook: "owner",
      hotmail: "owner",
      email: "owner",
      alimail: "owner",
    },
  });

  const missingGoogle = createExternalIntegrationProvider({
    envPaths: [envPath],
    configPaths: [configPath],
    githubCliHostsPaths: [githubHostsPath],
    googleTokenPaths: [path.join(root, "missing-token.json")],
    googleClientSecretPaths: [googleSecretPath],
    outlookGraphTokenPaths: [outlookTokenPath],
  }).ownerInterfaceBindings();
  assert.equal(missingGoogle.some((item) => item.id === "owner_google"), false);
}

run();
console.log("external-integration-provider contract passed.");
