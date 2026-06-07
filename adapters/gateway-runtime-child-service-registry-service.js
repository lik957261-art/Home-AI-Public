"use strict";

const { createGatewayRunEventService } = require("./gateway-run-event-service");
const { createGatewayRunLifecycleService } = require("./gateway-run-lifecycle-service");
const { createGatewayRunQueueService } = require("./gateway-run-queue-service");
const { createGatewayRunStartService } = require("./gateway-run-start-service");
const { createGatewayRunStreamService } = require("./gateway-run-stream-service");
const { createGatewayRuntimeSubserviceOptionsService } = require("./gateway-runtime-subservice-options-service");

function requiredController(name) {
  return () => {
    throw new Error(`Missing gateway runtime controller: ${name}`);
  };
}

function controllerFn(controllers, name) {
  return typeof controllers[name] === "function" ? controllers[name] : requiredController(name);
}

function createGatewayRuntimeChildServiceRegistry(options = {}) {
  const deps = options.deps || {};
  const controllers = options.controllers || {};
  const factories = Object.assign({
    createGatewayRunEventService,
    createGatewayRunLifecycleService,
    createGatewayRunQueueService,
    createGatewayRunStartService,
    createGatewayRunStreamService,
    createGatewayRuntimeSubserviceOptionsService,
  }, options.factories || {});
  const lifecycleService = options.lifecycleService
    || deps.lifecycleService
    || factories.createGatewayRunLifecycleService();
  const subserviceOptions = options.subserviceOptionsService
    || deps.subserviceOptionsService
    || factories.createGatewayRuntimeSubserviceOptionsService(deps);
  let queueService = options.queueService || null;
  let startService = options.startService || null;
  let streamService = options.streamService || null;
  let eventService = options.eventService || null;

  function getQueueService() {
    if (!queueService) {
      queueService = factories.createGatewayRunQueueService(subserviceOptions.queueServiceOptions({
        lifecycleService,
        startRunForThread: controllerFn(controllers, "startRunForThread"),
      }));
    }
    return queueService;
  }

  function getStartService() {
    if (!startService) {
      startService = factories.createGatewayRunStartService(subserviceOptions.startServiceOptions({
        addThreadActiveRun: controllerFn(controllers, "addThreadActiveRun"),
        removeThreadActiveRun: controllerFn(controllers, "removeThreadActiveRun"),
        streamResponse: controllerFn(controllers, "streamResponse"),
      }));
    }
    return startService;
  }

  function getStreamService() {
    if (!streamService) {
      streamService = factories.createGatewayRunStreamService(subserviceOptions.streamServiceOptions({
        applyHermesRunEvent: controllerFn(controllers, "applyHermesRunEvent"),
        lifecycleService,
        markRunCancelled: controllerFn(controllers, "markRunCancelled"),
        markRunFailed: controllerFn(controllers, "markRunFailed"),
      }));
    }
    return streamService;
  }

  function getEventService() {
    if (!eventService) {
      eventService = factories.createGatewayRunEventService(subserviceOptions.eventServiceOptions({
        removeThreadActiveRun: controllerFn(controllers, "removeThreadActiveRun"),
        replaceThreadActiveRun: controllerFn(controllers, "replaceThreadActiveRun"),
        scheduleNextQueuedRunForTaskGroup: controllerFn(controllers, "scheduleNextQueuedRunForTaskGroup"),
        startRunForThread: controllerFn(controllers, "startRunForThread"),
      }));
    }
    return eventService;
  }

  return Object.freeze({
    getEventService,
    getQueueService,
    getStartService,
    getStreamService,
    lifecycleService,
  });
}

module.exports = {
  createGatewayRuntimeChildServiceRegistry,
};
