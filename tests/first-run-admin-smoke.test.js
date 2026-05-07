"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");

async function request(baseUrl, route, options = {}) {
  const res = await fetch(`${baseUrl}${route}`, Object.assign({
    headers: {},
  }, options));
  let body = null;
  try {
    body = await res.json();
  } catch (_) {}
  if (!res.ok) {
    const message = body?.error || `${res.status} ${res.statusText}`;
    throw new Error(`${route}: ${message}`);
  }
  return body;
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 15000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      return await request(baseUrl, "/api/setup/status");
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError || new Error("server did not become ready");
}

function jsonOptions(method, key, body = {}) {
  return {
    method,
    headers: Object.assign(
      { "Content-Type": "application/json" },
      key ? { "X-Hermes-Web-Key": key } : {},
    ),
    body: JSON.stringify(body),
  };
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-mobile-admin-smoke-"));
  const port = 19000 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = Object.assign({}, process.env, {
    HERMES_WEB_HOST: "127.0.0.1",
    HERMES_WEB_PORT: String(port),
    HERMES_WEB_DATA_DIR: path.join(tempDir, "data"),
    HERMES_WEB_AUTH_KEY_PATH: path.join(tempDir, "owner.key"),
  });
  delete env.HERMES_WEB_KEY;
  delete env.HERMES_WEB_DISABLE_AUTH;
  delete env.HERMES_WEB_ALLOW_MEMORY_KEY;
  delete env.WEB_PUSH_VAPID_PUBLIC_KEY;
  delete env.HERMES_WEB_VAPID_PUBLIC_KEY;
  delete env.WEB_PUSH_VAPID_PRIVATE_KEY;
  delete env.HERMES_WEB_VAPID_PRIVATE_KEY;

  const child = spawn(process.execPath, ["server.js"], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(String(chunk)));

  try {
    const initial = await waitForServer(baseUrl);
    assert.equal(initial.setupRequired, true);

    const setup = await request(baseUrl, "/api/setup/owner", jsonOptions("POST", "", {}));
    assert.match(setup.key, /^hwk_/);
    const ownerKey = setup.key;

    const apiKeyPath = path.join(tempDir, "gateway-api.key");
    const vapidPath = path.join(tempDir, "vapid.json");
    fs.writeFileSync(apiKeyPath, "test-gateway-key\n", "utf8");
    const runtimeConfig = await request(baseUrl, "/api/runtime-config", jsonOptions("PATCH", ownerKey, {
      hermesApiBase: baseUrl,
      hermesApiKeyPath: apiKeyPath,
      webPushSubject: "mailto:admin@example.invalid",
      webPushVapidPath: vapidPath,
    }));
    assert.equal(runtimeConfig.config.hermesApiBase, baseUrl);
    assert.equal(runtimeConfig.config.hermesApiKeyConfigured, true);
    assert.equal(runtimeConfig.config.hermesApiKeySource, "file");
    assert.equal(runtimeConfig.config.webPushSubject, "mailto:admin@example.invalid");
    assert.equal(runtimeConfig.config.webPushVapidPath, vapidPath);
    assert.equal(runtimeConfig.config.webPushVapidExists, true);
    assert.equal(fs.existsSync(vapidPath), true);
    const vapid = JSON.parse(fs.readFileSync(vapidPath, "utf8"));
    assert.ok(vapid.publicKey);
    assert.ok(vapid.privateKey);
    const regenerated = await request(baseUrl, "/api/runtime-config/web-push/generate", jsonOptions("POST", ownerKey, { overwrite: true }));
    assert.ok(regenerated.generated.publicKey);
    assert.equal(Object.hasOwn(regenerated.generated, "privateKey"), false);
    const runtimeTest = await request(baseUrl, "/api/runtime-config/test", jsonOptions("POST", ownerKey, {}));
    assert.equal(runtimeTest.status.apiBase, baseUrl);
    assert.equal(runtimeTest.ok, false);

    const created = await request(baseUrl, "/api/workspaces", jsonOptions("POST", ownerKey, {
      workspaceId: "demo-admin-user",
      label: "Demo Admin User",
      defaultWorkspace: "C:\\DemoRoot",
      allowedRoots: ["C:\\DemoRoot", "D:\\Shared"],
      allowedToolsets: ["mail", "calendar"],
    }));
    assert.equal(created.workspace.id, "demo-admin-user");
    assert.equal(created.workspace.source, "local-workspace");
    assert.deepEqual(created.workspace.localConfig.allowedRoots, ["C:\\DemoRoot", "D:\\Shared"]);

    const generated = await request(baseUrl, "/api/access-keys/workspace", jsonOptions("POST", ownerKey, {
      workspaceId: "demo-admin-user",
    }));
    assert.match(generated.key, /^hwk_/);

    const keyStatus = await request(baseUrl, "/api/access-keys?workspaceId=demo-admin-user", {
      headers: { "X-Hermes-Web-Key": ownerKey },
    });
    assert.equal(keyStatus.data[0].hasKey, true);

    const patched = await request(baseUrl, "/api/workspaces/demo-admin-user", jsonOptions("PATCH", ownerKey, {
      label: "Demo Admin Edited",
      defaultWorkspace: "C:\\DemoRoot2",
      allowedRoots: ["C:\\DemoRoot2"],
      allowedToolsets: ["mail"],
    }));
    assert.equal(patched.workspace.label, "Demo Admin Edited");
    assert.deepEqual(patched.workspace.localConfig.allowedToolsets, ["mail"]);

    const revoked = await request(baseUrl, "/api/access-keys/workspace/demo-admin-user", jsonOptions("DELETE", ownerKey, {}));
    assert.equal(revoked.result.revoked, true);

    const deleted = await request(baseUrl, "/api/workspaces/demo-admin-user", {
      method: "DELETE",
      headers: { "X-Hermes-Web-Key": ownerKey },
    });
    assert.equal(deleted.ok, true);

    const finalWorkspaces = await request(baseUrl, "/api/workspaces", {
      headers: { "X-Hermes-Web-Key": ownerKey },
    });
    assert.equal(finalWorkspaces.data.some((item) => item.id === "demo-admin-user"), false);

    console.log("first-run admin smoke passed.");
  } finally {
    await stopChild(child);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
    if (stderr.length && process.env.HERMES_MOBILE_DEBUG_SMOKE) {
      console.error(stderr.join(""));
    }
  }
}

main().catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
