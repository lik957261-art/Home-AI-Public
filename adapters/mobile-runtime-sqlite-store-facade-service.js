"use strict";

function requireFunction(options, name) {
  const value = options[name];
  if (typeof value !== "function") {
    throw new Error(`MobileRuntimeSqliteStoreFacadeService requires ${name}`);
  }
  return value;
}

function createMobileRuntimeSqliteStoreFacadeService(options = {}) {
  const createMobileSqliteStore = requireFunction(options, "createMobileSqliteStore");
  const dbPath = options.dbPath;
  let store = null;

  function mobileSqliteStore() {
    if (!store) {
      store = createMobileSqliteStore({ dbPath });
      if (store && typeof store.migrate === "function") store.migrate();
    }
    return store;
  }

  return Object.freeze({
    mobileSqliteStore,
  });
}

module.exports = {
  createMobileRuntimeSqliteStoreFacadeService,
};
