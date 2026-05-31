"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createMobileSqliteStore } = require("../adapters/mobile-sqlite-store");
const { createPlatformCurrencyService, TONGBAO_CURRENCY } = require("../adapters/platform-currency-service");

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-platform-currency-"));
  const store = createMobileSqliteStore({ dbPath: path.join(dir, "store.sqlite3") });
  store.migrate();
  return {
    dir,
    store,
    cleanup() {
      store.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

function testWalletDefaultsToZeroAndIsIdempotent() {
  const fixture = tempStore();
  try {
    const service = createPlatformCurrencyService({
      store: () => fixture.store,
      nowIso: () => "2026-05-31T08:00:00.000Z",
    });

    const first = service.walletSummary({ workspaceId: "weixin_test_1" });
    const second = service.walletSummary({ workspaceId: "weixin_test_1" });

    assert.equal(first.workspaceId, "weixin_test_1");
    assert.equal(first.currency, TONGBAO_CURRENCY);
    assert.equal(first.availableBalance, 0);
    assert.equal(first.heldBalance, 0);
    assert.equal(first.totalBalance, 0);
    assert.deepEqual(second, first);
    assert.equal(fixture.store.tableCounts().platform_currency_wallets, 1);
    assert.equal(fixture.store.tableCounts().platform_currency_ledger_entries, 0);
  } finally {
    fixture.cleanup();
  }
}

function testLedgerStartsEmpty() {
  const fixture = tempStore();
  try {
    const service = createPlatformCurrencyService({ store: () => fixture.store });
    service.ensureWallet({ workspaceId: "owner" });
    assert.deepEqual(service.listLedger({ workspaceId: "owner" }), []);
  } finally {
    fixture.cleanup();
  }
}

testWalletDefaultsToZeroAndIsIdempotent();
testLedgerStartsEmpty();

console.log("platform currency service tests passed");
