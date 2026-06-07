"use strict";

const assert = require("node:assert/strict");

const {
  createGatewayRunStreamStopService,
  defaultDedupe,
} = require("../adapters/gateway-run-stream-stop-service");

function createController() {
  const signal = { aborted: false };
  return {
    signal,
    abortCount: 0,
    abort() {
      this.abortCount += 1;
      signal.aborted = true;
    },
  };
}

function testDefaultDedupeTrimsAndSkipsEmptyValues() {
  assert.deepEqual(defaultDedupe([" run_1 ", "", null, "run_1", "run_2"]), ["run_1", "run_2"]);
}

async function testStopUsesActiveAbortThenGatewayStop() {
  const controller = createController();
  const activeStreams = new Map([["public_run", { controller }]]);
  const stopCalls = [];
  const service = createGatewayRunStreamStopService({
    activeStreamForRun: (runId) => activeStreams.get(runId),
    gatewayTargetForRun: (runId) => ({ apiBase: `http://${runId}.gateway`, apiKey: "worker-key" }),
    gatewayPool: {
      runnerFor(target) {
        return {
          async stopRun(runId, options) {
            stopCalls.push({ runId, options, target });
            if (runId === "gone_run") {
              const err = new Error("missing");
              err.status = 404;
              throw err;
            }
          },
        };
      },
    },
    stopTimeoutMs: 9000,
  });

  const stopped = await service.stopRunIds(["public_run", "public_run", "remote_run", "gone_run"]);

  assert.deepEqual(stopped, ["public_run", "remote_run", "gone_run"]);
  assert.equal(controller.abortCount, 1);
  assert.deepEqual(stopCalls.map((call) => call.runId), ["remote_run", "gone_run"]);
  assert.deepEqual(stopCalls[0].options, {
    gatewayUrl: "http://remote_run.gateway",
    apiKey: "worker-key",
    timeoutMs: 9000,
  });
}

async function testStopTimeoutFallsBackToApiTimeoutCap() {
  const stopCalls = [];
  const service = createGatewayRunStreamStopService({
    activeStreamForRun: () => null,
    gatewayTargetForRun: () => ({ apiBase: "http://worker.gateway", apiKey: "key" }),
    gatewayPool: {
      runnerFor() {
        return {
          async stopRun(runId, options) {
            stopCalls.push({ runId, options });
          },
        };
      },
    },
    apiTimeoutMs: 2400,
  });

  await service.stopRunIds(["remote_run"]);

  assert.equal(stopCalls[0].options.timeoutMs, 2400);
}

async function testStopRethrowsNon404Errors() {
  const service = createGatewayRunStreamStopService({
    activeStreamForRun: () => null,
    gatewayTargetForRun: () => ({ apiBase: "http://worker.gateway", apiKey: "key" }),
    gatewayPool: {
      runnerFor() {
        return {
          async stopRun() {
            const err = new Error("boom");
            err.status = 500;
            throw err;
          },
        };
      },
    },
  });

  await assert.rejects(() => service.stopRunIds(["remote_run"]), /boom/);
}

(async () => {
  testDefaultDedupeTrimsAndSkipsEmptyValues();
  await testStopUsesActiveAbortThenGatewayStop();
  await testStopTimeoutFallsBackToApiTimeoutCap();
  await testStopRethrowsNon404Errors();
  console.log("gateway run stream stop service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
