"use strict";

const assert = require("node:assert/strict");
const { createMobileRuntimeSqliteStoreFacadeService } = require("../adapters/mobile-runtime-sqlite-store-facade-service");

function testStoreIsLazyMigratedAndStable() {
  const calls = [];
  const createdStore = {
    migrate() {
      calls.push(["migrate"]);
    },
  };
  const service = createMobileRuntimeSqliteStoreFacadeService({
    dbPath: "/data/mobile.sqlite3",
    createMobileSqliteStore(options) {
      calls.push(["create", options]);
      return createdStore;
    },
  });

  assert.deepEqual(calls, []);
  assert.equal(service.mobileSqliteStore(), createdStore);
  assert.equal(service.mobileSqliteStore(), createdStore);
  assert.deepEqual(calls, [
    ["create", { dbPath: "/data/mobile.sqlite3" }],
    ["migrate"],
  ]);
}

function testMigrateIsOptionalForInjectedStores() {
  const service = createMobileRuntimeSqliteStoreFacadeService({
    createMobileSqliteStore() {
      return { readonly: true };
    },
  });
  assert.deepEqual(service.mobileSqliteStore(), { readonly: true });
}

function testRequiredFactoryGuard() {
  assert.throws(
    () => createMobileRuntimeSqliteStoreFacadeService({}),
    /requires createMobileSqliteStore/,
  );
}

testStoreIsLazyMigratedAndStable();
testMigrateIsOptionalForInjectedStores();
testRequiredFactoryGuard();
console.log("mobile runtime sqlite store facade service tests passed");
