"use strict";

const assert = require("node:assert");

const bridgeHost = require("../scripts/bridge-host");

async function testStartsGrokGatewayBeforeProxying() {
  let healthy = false;
  let startCount = 0;
  const ready = await bridgeHost.ensureGrokGatewayReady(
    { url: "http://127.0.0.1:18761", profile: "grokgw1" },
    {
      healthCheck: async () => healthy,
      startWorkerProfile: async (worker, context) => {
        startCount += 1;
        assert.equal(worker.profile, "grokgw1");
        assert.equal(context.timeoutMs > 0, true);
        healthy = true;
        return { ok: true };
      },
      waitForHealth: async () => healthy,
    },
  );
  assert.equal(ready, true);
  assert.equal(startCount, 1);
}

async function testConcurrentProxyStartIsSingleFlight() {
  let healthy = false;
  let startCount = 0;
  let releaseStart;
  const startReleased = new Promise((resolve) => {
    releaseStart = resolve;
  });
  const options = {
    healthCheck: async () => healthy,
    startWorkerProfile: async () => {
      startCount += 1;
      await startReleased;
      healthy = true;
      return { ok: true };
    },
    waitForHealth: async () => healthy,
  };
  const target = { url: "http://127.0.0.1:18761", profile: "grokgw1" };
  const first = bridgeHost.ensureGrokGatewayReady(target, options);
  const second = bridgeHost.ensureGrokGatewayReady(target, options);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(startCount, 1);
  releaseStart();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
}

async function testAutostartDisabledDoesNotStartWorker() {
  let startCount = 0;
  const ready = await bridgeHost.ensureGrokGatewayReady(
    { url: "http://127.0.0.1:18761", profile: "grokgw1" },
    {
      autostart: false,
      healthCheck: async () => false,
      startWorkerProfile: async () => {
        startCount += 1;
      },
    },
  );
  assert.equal(ready, false);
  assert.equal(startCount, 0);
}

(async () => {
  await testStartsGrokGatewayBeforeProxying();
  await testConcurrentProxyStartIsSingleFlight();
  await testAutostartDisabledDoesNotStartWorker();
  console.log("bridge-host Grok proxy tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
