"use strict";

function createMobileRuntimeHttpServerService(options = {}) {
  const activeStreams = options.activeStreams;
  const authProvider = options.authProvider;
  const eventStreamApiRoutes = options.eventStreamApiRoutes;
  const http = options.http || require("node:http");
  const httpRuntimeService = options.httpRuntimeService;
  const logger = options.logger || console;
  const mobileApiDispatcher = options.mobileApiDispatcher;
  const mobileApiServices = options.mobileApiServices || {};
  const runtimeProcess = options.process || process;

  for (const [name, value] of Object.entries({
    activeStreams,
    eventStreamApiRoutes,
    httpRuntimeService,
    mobileApiDispatcher,
  })) {
    if (!value) throw new Error(`mobile runtime HTTP server service requires ${name}`);
  }
  for (const [name, value] of Object.entries({
    effectiveHermesApiBase: options.effectiveHermesApiBase,
    getUrl: options.getUrl,
    reconcileDetachedActiveRuns: options.reconcileDetachedActiveRuns,
    sendJson: options.sendJson,
    serveStatic: options.serveStatic,
  })) {
    if (typeof value !== "function") throw new Error(`mobile runtime HTTP server service requires ${name}`);
  }

  async function requestHandler(req, res) {
    try {
      httpRuntimeService.attachSecurityHeaders(req, res);
      const url = options.getUrl(req);
      if ((await eventStreamApiRoutes.handle(req, res, url)).handled) return;
      if (url.pathname.startsWith("/api/")) {
        await mobileApiDispatcher.handle(req, res);
        return;
      }
      options.serveStatic(req, res);
    } catch (err) {
      logger.error?.(`Hermes Mobile request failed ${req.method || ""} ${req.url || ""}: ${err.stack || err.message || String(err)}`);
      if (res.headersSent || res.destroyed || res.writableEnded) return;
      options.sendJson(res, 500, { error: err.message || String(err) });
    }
  }

  function shutdown() {
    for (const stream of activeStreams.values()) {
      try {
        stream.controller.abort();
      } catch (_) {}
    }
    runtimeProcess.exit(0);
  }

  function logStartup() {
    logger.log?.(`Hermes Mobile listening on http://${options.host}:${options.port}`);
    logger.log?.(`Hermes API base: ${options.effectiveHermesApiBase()}`);
    logger.log?.(`State directory: ${options.dataDir}`);
    logger.log?.(
      options.disableAuth
        ? "Authentication disabled by HERMES_WEB_DISABLE_AUTH."
        : `Authentication enabled; Owner key source is ${authProvider.ownerKeySource()}.`,
    );
    if (!options.disableAuth && authProvider.ownerKeySource() !== "env") {
      logger.log?.("Current process login key is not printed; use the configured Owner key file or HERMES_WEB_KEY.");
    }
    options.webPushDeliveryService?.startTodoWebPushDispatcher?.();
    options.webPushDeliveryService?.startAutomationWebPushDispatcher?.();
    if (options.scheduleLearningGrowthQueueOnStartup) {
      mobileApiServices.learningGrowthSubmissionService?.scheduleEvaluationQueue?.();
    }
  }

  function start() {
    const server = http.createServer(requestHandler);
    runtimeProcess.on?.("SIGINT", shutdown);
    runtimeProcess.on?.("SIGTERM", shutdown);
    options.reconcileDetachedActiveRuns();
    server.listen(options.port, options.host, logStartup);
    return server;
  }

  return {
    logStartup,
    requestHandler,
    shutdown,
    start,
  };
}

module.exports = {
  createMobileRuntimeHttpServerService,
};
