"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  STATUS_CHECK_VERSION,
  buildViteProductionStatus,
  collectSourceChecks,
  formatText,
  parseArgs,
} = require("../scripts/vite-production-status-check");
const {
  REQUIRED_PRODUCTION_READBACK_CHECKS,
} = require("../scripts/vite-production-cutover-preflight");

function test(name, fn) {
  Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`ok - ${name}`);
    })
    .catch((error) => {
      console.error(`not ok - ${name}`);
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}

function makeFixtureRepo(shellMode = "vite") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-vite-status-"));
  fs.mkdirSync(path.join(root, "config"), { recursive: true });
  fs.mkdirSync(path.join(root, "public/vite-islands/home-ai-production-bootstrap"), { recursive: true });
  fs.mkdirSync(path.join(root, "public/vite-islands/.vite"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "config/home-ai-shell-mode.json"),
    JSON.stringify({ shellMode, cutoverVersion: "fixture-cutover" }, null, 2),
  );
  fs.writeFileSync(
    path.join(root, "public/vite-islands/home-ai-production-bootstrap/home-ai-production-bootstrap.js"),
    "window.HomeAiViteProduction = { status() { return {}; } };",
  );
  fs.writeFileSync(
    path.join(root, "public/vite-islands/.vite/manifest.json"),
    JSON.stringify({ "production-bootstrap.mjs": { file: "home-ai-production-bootstrap/home-ai-production-bootstrap.js" } }),
  );
  return root;
}

function makeReadbackFile() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-vite-readback-status-"));
  const file = path.join(root, "readback.json");
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        privacyConfirmed: true,
        checks: REQUIRED_PRODUCTION_READBACK_CHECKS.map((check) => ({
          id: check.id,
          status: "passed",
          evidence: { summary: `${check.id} passed` },
        })),
      },
      null,
      2,
    ),
  );
  return file;
}

function headers(values) {
  return {
    get(name) {
      return values[String(name).toLowerCase()] || "";
    },
  };
}

function response(status, text, headerValues = {}) {
  return {
    status,
    headers: headers(headerValues),
    async text() {
      return text;
    },
  };
}

function fakeFetch(routes) {
  return async (url) => {
    const parsed = new URL(url);
    const key = `${parsed.pathname}${parsed.search}`;
    if (!routes[key]) throw new Error(`missing route ${key}`);
    return routes[key];
  };
}

function validRoutes() {
  return {
    "/": response(
      200,
      '<script type="module" id="home-ai-vite-production-bootstrap"></script>',
      {
        "x-homeai-shell-mode": "vite",
        "x-homeai-vite-bootstrap": "/vite-islands/home-ai-production-bootstrap/home-ai-production-bootstrap.js",
      },
    ),
    "/?homeAiShellMode=classic": response(200, '<script type="module" id="home-ai-vite-production-bootstrap"></script>', {
      "x-homeai-shell-mode": "vite",
      "x-homeai-shell-mode-policy": "vite-only",
    }),
    "/vite-islands/.vite/manifest.json": response(200, '{"entry":{"file":"asset.js"}}'),
    "/vite-islands/home-ai-production-bootstrap/home-ai-production-bootstrap.js": response(
      200,
      "window.HomeAiViteProduction = {};",
    ),
    "/api/public-config": response(200, '{"title":"Home AI"}'),
    "/api/owner/system-console": response(401, '{"ok":false}'),
  };
}

test("source-only status passes for a Vite cutover repository", () => {
  const repoRoot = makeFixtureRepo("vite");
  const checks = collectSourceChecks(repoRoot);
  assert.equal(checks.every((check) => check.ok), true);
});

test("source-only status fails when source config is classic", async () => {
  const repoRoot = makeFixtureRepo("classic");
  const result = await buildViteProductionStatus({ repoRoot });
  assert.equal(result.ok, false);
  assert.equal(result.status, "vite_production_status_incomplete");
  assert.deepEqual(result.failed, ["source_shell_mode_config"]);
});

test("live production probe validates Vite root and ignores classic override", async () => {
  const repoRoot = makeFixtureRepo("vite");
  const result = await buildViteProductionStatus({
    repoRoot,
    baseUrl: "http://127.0.0.1:8797",
    fetchImpl: fakeFetch(validRoutes()),
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "vite_production_status_verified");
  assert.equal(result.statusVersion, STATUS_CHECK_VERSION);
  assert.equal(result.sourceOnly, false);
  assert.equal(result.productionWrites, false);
  assert.equal(result.deployExecuted, false);
  assert.equal(result.liveProbe, true);
});

test("live production probe fails when root leaks back to classic", async () => {
  const repoRoot = makeFixtureRepo("vite");
  const routes = validRoutes();
  routes["/"] = response(200, "<html>classic</html>", {
    "x-homeai-shell-mode": "classic",
  });
  const result = await buildViteProductionStatus({
    repoRoot,
    baseUrl: "http://127.0.0.1:8797",
    fetchImpl: fakeFetch(routes),
  });
  assert.equal(result.ok, false);
  assert.ok(result.failed.includes("production_root_shell_vite"));
});

test("live production probe fails when classic override activates Classic shell", async () => {
  const repoRoot = makeFixtureRepo("vite");
  const routes = validRoutes();
  routes["/?homeAiShellMode=classic"] = response(200, "<html>classic</html>", {
    "x-homeai-shell-mode": "classic",
  });
  const result = await buildViteProductionStatus({
    repoRoot,
    baseUrl: "http://127.0.0.1:8797",
    fetchImpl: fakeFetch(routes),
  });
  assert.equal(result.ok, false);
  assert.ok(result.failed.includes("production_classic_override_ignored"));
});

test("readback packet can be revalidated with the status check", async () => {
  const repoRoot = makeFixtureRepo("vite");
  const result = await buildViteProductionStatus({
    repoRoot,
    readbackJson: makeReadbackFile(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.readbackValidated, true);
  assert.ok(result.checks.some((check) => check.id === "production_readback_packet"));
});

test("formatter and parser expose the maintained status boundary", () => {
  const text = formatText({
    ok: true,
    status: "vite_production_status_verified",
    statusVersion: STATUS_CHECK_VERSION,
    sourceOnly: false,
    productionWrites: false,
    deployExecuted: false,
    liveProbe: true,
    readbackValidated: true,
    passedCount: 9,
    checkCount: 9,
    failed: [],
  });
  assert.match(text, /vite_production_status_verified/);
  assert.match(text, /productionWrites: false/);

  assert.deepEqual(parseArgs([
    "--json",
    "--require-ok",
    "--base=http://127.0.0.1:8797",
    "--readback-json=/tmp/readback.json",
    "--repo-root=/tmp/home-ai",
  ]), {
    json: true,
    requireOk: true,
    baseUrl: "http://127.0.0.1:8797",
    readbackJson: "/tmp/readback.json",
    repoRoot: "/tmp/home-ai",
  });
});

process.on("beforeExit", () => {
  if (process.exitCode) process.exit(process.exitCode);
});
