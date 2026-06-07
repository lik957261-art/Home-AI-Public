"use strict";

const assert = require("node:assert/strict");
const {
  createGatewayRuntimeChildServiceRegistry,
} = require("../adapters/gateway-runtime-child-service-registry-service");

function makeControllers() {
  return {
    addThreadActiveRun: () => "add",
    applyHermesRunEvent: () => "event",
    markRunCancelled: () => "cancel",
    markRunFailed: () => "fail",
    removeThreadActiveRun: () => "remove",
    replaceThreadActiveRun: () => "replace",
    scheduleNextQueuedRunForTaskGroup: () => "schedule",
    startRunForThread: () => "start",
    streamResponse: () => "stream",
  };
}

function testRegistryBuildsChildServicesLazily() {
  const calls = [];
  const lifecycleService = { id: "lifecycle" };
  const subserviceOptionsService = {
    queueServiceOptions: (controllers) => ({ kind: "queue", controllers }),
    startServiceOptions: (controllers) => ({ kind: "start", controllers }),
    streamServiceOptions: (controllers) => ({ kind: "stream", controllers }),
    eventServiceOptions: (controllers) => ({ kind: "event", controllers }),
  };
  const factories = {
    createGatewayRunEventService: (options) => {
      calls.push({ factory: "event", options });
      return { name: "event", options };
    },
    createGatewayRunLifecycleService: () => {
      throw new Error("explicit lifecycle should be reused");
    },
    createGatewayRunQueueService: (options) => {
      calls.push({ factory: "queue", options });
      return { name: "queue", options };
    },
    createGatewayRunStartService: (options) => {
      calls.push({ factory: "start", options });
      return { name: "start", options };
    },
    createGatewayRunStreamService: (options) => {
      calls.push({ factory: "stream", options });
      return { name: "stream", options };
    },
    createGatewayRuntimeSubserviceOptionsService: () => {
      throw new Error("explicit subservice options should be reused");
    },
  };
  const controllers = makeControllers();
  const registry = createGatewayRuntimeChildServiceRegistry({
    controllers,
    factories,
    lifecycleService,
    subserviceOptionsService,
  });

  assert.equal(registry.lifecycleService, lifecycleService);
  assert.deepEqual(calls, []);

  assert.equal(registry.getQueueService().name, "queue");
  assert.equal(registry.getQueueService().name, "queue");
  assert.equal(registry.getStartService().name, "start");
  assert.equal(registry.getStreamService().name, "stream");
  assert.equal(registry.getEventService().name, "event");

  assert.deepEqual(calls.map((call) => call.factory), ["queue", "start", "stream", "event"]);
  assert.equal(calls[0].options.controllers.startRunForThread, controllers.startRunForThread);
  assert.equal(calls[1].options.controllers.addThreadActiveRun, controllers.addThreadActiveRun);
  assert.equal(calls[1].options.controllers.removeThreadActiveRun, controllers.removeThreadActiveRun);
  assert.equal(calls[1].options.controllers.streamResponse, controllers.streamResponse);
  assert.equal(calls[2].options.controllers.applyHermesRunEvent, controllers.applyHermesRunEvent);
  assert.equal(calls[2].options.controllers.lifecycleService, lifecycleService);
  assert.equal(calls[2].options.controllers.markRunCancelled, controllers.markRunCancelled);
  assert.equal(calls[2].options.controllers.markRunFailed, controllers.markRunFailed);
  assert.equal(calls[3].options.controllers.replaceThreadActiveRun, controllers.replaceThreadActiveRun);
  assert.equal(calls[3].options.controllers.scheduleNextQueuedRunForTaskGroup, controllers.scheduleNextQueuedRunForTaskGroup);
}

function testRegistryCreatesDefaultLifecycleAndFailsClosedForMissingControllers() {
  const lifecycleService = { id: "default-lifecycle" };
  const registry = createGatewayRuntimeChildServiceRegistry({
    factories: {
      createGatewayRunLifecycleService: () => lifecycleService,
      createGatewayRuntimeSubserviceOptionsService: () => ({
        queueServiceOptions: (controllers) => controllers,
      }),
      createGatewayRunQueueService: (options) => options,
    },
  });

  assert.equal(registry.lifecycleService, lifecycleService);
  const queueOptions = registry.getQueueService();
  assert.throws(() => queueOptions.startRunForThread(), /Missing gateway runtime controller: startRunForThread/);
}

testRegistryBuildsChildServicesLazily();
testRegistryCreatesDefaultLifecycleAndFailsClosedForMissingControllers();

console.log("gateway runtime child service registry tests passed");
