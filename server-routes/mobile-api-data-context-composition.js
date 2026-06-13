"use strict";

const { createDataContextApiRoutes } = require("./data-context-api-routes");
const { createDataContextService } = require("../adapters/data-context-service");

function createMobileApiDataContextComposition(deps = {}) {
  const dataContextService = deps.dataContextService || createDataContextService({
    dataDir: deps.dataDir,
    dbPath: deps.mobileSqliteDbPath,
  });
  const dataContextApiRoutes = createDataContextApiRoutes({
    dataContextService,
    readBody: deps.readBody,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
  });
  return {
    routes: { dataContextApiRoutes },
    services: { dataContextService },
  };
}

module.exports = {
  createMobileApiDataContextComposition,
};
