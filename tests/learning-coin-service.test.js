"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLearningCoinService } = require("../adapters/learning-coin-service");

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-learning-coins-"));
  return {
    dir,
    file: path.join(dir, "learning-coins.json"),
    cleanup() {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

function makeService(store, extra = {}) {
  let counter = 0;
  const auditEvents = [];
  const service = createLearningCoinService(Object.assign({
    storagePath: store.file,
    ensureDataDir() {
      fs.mkdirSync(store.dir, { recursive: true });
    },
    makeId(prefix) {
      counter += 1;
      return `${prefix}_${counter}`;
    },
    nowIso() {
      counter += 1;
      return `2026-05-16T00:00:${String(counter).padStart(2, "0")}Z`;
    },
    audit(eventType, payload) {
      auditEvents.push({ eventType, payload });
    },
  }, extra));
  return { service, auditEvents };
}

function testGrantIsIdempotentAndSanitized() {
  const store = tempStore();
  try {
    const { service, auditEvents } = makeService(store);
    const first = service.grantCoins({
      studentId: "fanfan",
      workspaceId: "owner",
      coinAmount: 30,
      reason: "reading quiz passed",
      sourceType: "reading-card",
      sourceId: "card-1",
      idempotencyKey: "reading-card:card-1:pass",
      metadata: {
        answer: "should not be stored as raw answer text because metadata is compacted",
      },
    });
    const second = service.grantCoins({
      studentId: "fanfan",
      workspaceId: "owner",
      coinAmount: 30,
      reason: "retry",
      idempotencyKey: "reading-card:card-1:pass",
    });

    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(service.summary({ studentId: "fanfan", workspaceId: "owner" }).balances.availableCoins, 30);
    assert.equal(service.listLedger({ studentId: "fanfan", workspaceId: "owner" }).length, 1);
    assert.equal(auditEvents.length, 1);
    assert.equal(auditEvents[0].eventType, "learning_coin.grant");
  } finally {
    store.cleanup();
  }
}

function testRewardRedemptionHoldsAndReleasesCoins() {
  const store = tempStore();
  try {
    const { service } = makeService(store);
    service.grantCoins({
      studentId: "fanfan",
      workspaceId: "owner",
      coinAmount: 100,
      reason: "manual seed",
      idempotencyKey: "seed",
    });
    const reward = service.upsertReward({
      id: "snack",
      title: "Snack",
      coinCost: 40,
      rmbCents: 500,
    });
    const requested = service.requestRedemption({
      studentId: "fanfan",
      workspaceId: "owner",
      rewardId: reward.id,
      idempotencyKey: "redeem-snack",
    });

    assert.equal(requested.redemption.status, "requested");
    assert.deepEqual(requested.balances, {
      availableCoins: 60,
      heldCoins: 40,
      totalCoins: 100,
      earnedCoins: 100,
      spentCoins: 0,
    });

    const rejected = service.transitionRedemption(requested.redemption.id, "reject", {
      actorPrincipalId: "owner",
      note: "not today",
    });
    assert.equal(rejected.redemption.status, "rejected");
    assert.equal(rejected.balances.availableCoins, 100);
    assert.equal(rejected.balances.heldCoins, 0);
    assert.equal(service.listLedger({ studentId: "fanfan", workspaceId: "owner" }).length, 3);
  } finally {
    store.cleanup();
  }
}

function testApproveAndSettleKeepCoinsReserved() {
  const store = tempStore();
  try {
    const { service } = makeService(store);
    service.grantCoins({ studentId: "fanfan", workspaceId: "owner", coinAmount: 80, idempotencyKey: "seed" });
    service.upsertReward({ id: "cash", title: "Cash", coinCost: 50, rmbCents: 1000 });
    const requested = service.requestRedemption({ studentId: "fanfan", workspaceId: "owner", rewardId: "cash" });
    const approved = service.transitionRedemption(requested.redemption.id, "approve", { actorPrincipalId: "owner" });
    const settled = service.transitionRedemption(requested.redemption.id, "settle", { actorPrincipalId: "owner" });

    assert.equal(approved.redemption.status, "approved");
    assert.equal(settled.redemption.status, "settled");
    assert.equal(settled.balances.availableCoins, 30);
    assert.equal(settled.balances.heldCoins, 0);
    assert.equal(settled.balances.spentCoins, 50);
  } finally {
    store.cleanup();
  }
}

function testInsufficientCoinsCannotRedeem() {
  const store = tempStore();
  try {
    const { service } = makeService(store);
    service.upsertReward({ id: "big", title: "Big", coinCost: 1000 });
    assert.throws(
      () => service.requestRedemption({ studentId: "fanfan", workspaceId: "owner", rewardId: "big" }),
      /Insufficient coins/,
    );
  } finally {
    store.cleanup();
  }
}

testGrantIsIdempotentAndSanitized();
testRewardRedemptionHoldsAndReleasesCoins();
testApproveAndSettleKeepCoinsReserved();
testInsufficientCoinsCannotRedeem();
console.log("learning coin service tests passed");
