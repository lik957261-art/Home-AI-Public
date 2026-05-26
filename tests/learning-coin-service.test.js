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

function testRedemptionIdempotencyIsScoped() {
  const store = tempStore();
  try {
    const { service } = makeService(store);
    service.grantCoins({ studentId: "child-a", workspaceId: "child-a", coinAmount: 100, idempotencyKey: "seed-a" });
    service.grantCoins({ studentId: "child-b", workspaceId: "child-b", coinAmount: 100, idempotencyKey: "seed-b" });
    service.upsertReward({ id: "snack", title: "Snack", coinCost: 40 });
    const first = service.requestRedemption({
      studentId: "child-a",
      workspaceId: "child-a",
      rewardId: "snack",
      idempotencyKey: "same-client-key",
    });
    const second = service.requestRedemption({
      studentId: "child-b",
      workspaceId: "child-b",
      rewardId: "snack",
      idempotencyKey: "same-client-key",
    });

    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, false);
    assert.notEqual(first.redemption.id, second.redemption.id);
    assert.equal(first.redemption.workspaceId, "child-a");
    assert.equal(second.redemption.workspaceId, "child-b");
    assert.equal(service.getRedemption(first.redemption.id, { workspaceId: "child-b", studentId: "child-b" }), null);
    assert.throws(
      () => service.transitionRedemption(first.redemption.id, "cancel", { workspaceId: "child-b", studentId: "child-b" }),
      /Redemption was not found/,
    );
  } finally {
    store.cleanup();
  }
}

function testSummaryIncludesDerivedGrowthProfile() {
  const store = tempStore();
  try {
    const { service } = makeService(store, {
      nowIso() {
        return "2026-05-16T12:00:00Z";
      },
    });
    service.grantCoins({
      studentId: "fanfan",
      workspaceId: "owner",
      coinAmount: 120,
      reason: "reading pass",
      sourceType: "reading_quiz",
      idempotencyKey: "reading-1",
      createdAt: "2026-05-15T08:00:00Z",
    });
    service.grantCoins({
      studentId: "fanfan",
      workspaceId: "owner",
      coinAmount: 90,
      reason: "assessment pass",
      sourceType: "assessment_exam",
      idempotencyKey: "assessment-1",
      createdAt: "2026-05-16T08:00:00Z",
    });
    service.upsertReward({ id: "book", title: "Book", coinCost: 300, rmbCents: 3000 });

    const summary = service.summary({ studentId: "fanfan", workspaceId: "owner" });

    assert.equal(summary.growth.totalEarnedCoins, 210);
    assert.equal(summary.growth.level.current.level, 2);
    assert.equal(summary.growth.level.next.level, 3);
    assert.equal(summary.growth.level.toNextLevelCoins, 290);
    assert.equal(summary.growth.sevenDayCoins, 210);
    assert.equal(summary.growth.thirtyDayCoins, 210);
    assert.equal(summary.growth.activeDaysInLast7, 2);
    assert.equal(summary.growth.streakDays, 2);
    assert.deepEqual(summary.growth.recentDays.slice(-2), [
      { date: "2026-05-15", coins: 120 },
      { date: "2026-05-16", coins: 90 },
    ]);
    assert.deepEqual(summary.growth.rewardProgress[0], {
      id: "book",
      title: "Book",
      coinCost: 300,
      rmbCents: 3000,
      affordable: false,
      remainingCoins: 90,
      progressPct: 70,
    });
    assert.equal(summary.growth.bestRewardProgress.id, "book");
    assert.equal(summary.growth.sourceBreakdown[0].sourceType, "reading_quiz");
  } finally {
    store.cleanup();
  }
}

function testSummaryIncludesThirtyDayGrowthCoins() {
  const store = tempStore();
  try {
    const { service } = makeService(store, {
      nowIso() {
        return "2026-05-16T12:00:00Z";
      },
    });
    service.grantCoins({
      studentId: "fanfan",
      workspaceId: "owner",
      coinAmount: 10,
      reason: "today",
      idempotencyKey: "today",
      createdAt: "2026-05-16T08:00:00Z",
    });
    service.grantCoins({
      studentId: "fanfan",
      workspaceId: "owner",
      coinAmount: 20,
      reason: "seven-day-window",
      idempotencyKey: "seven-day-window",
      createdAt: "2026-05-10T08:00:00Z",
    });
    service.grantCoins({
      studentId: "fanfan",
      workspaceId: "owner",
      coinAmount: 30,
      reason: "thirty-day-window",
      idempotencyKey: "thirty-day-window",
      createdAt: "2026-05-09T08:00:00Z",
    });
    service.grantCoins({
      studentId: "fanfan",
      workspaceId: "owner",
      coinAmount: 40,
      reason: "outside-thirty-day-window",
      idempotencyKey: "outside-thirty-day-window",
      createdAt: "2026-04-15T08:00:00Z",
    });

    const summary = service.summary({ studentId: "fanfan", workspaceId: "owner" });

    assert.equal(summary.growth.sevenDayCoins, 30);
    assert.equal(summary.growth.thirtyDayCoins, 60);
    assert.equal(summary.growth.totalEarnedCoins, 100);
  } finally {
    store.cleanup();
  }
}

function testGrowthProfileIgnoresRedemptionAndInactiveRewards() {
  const store = tempStore();
  try {
    const { service } = makeService(store, {
      nowIso() {
        return "2026-05-16T12:00:00Z";
      },
    });
    service.grantCoins({ studentId: "fanfan", workspaceId: "owner", coinAmount: 4000, idempotencyKey: "seed" });
    service.upsertReward({ id: "active", title: "Active", coinCost: 100 });
    service.upsertReward({ id: "inactive", title: "Inactive", coinCost: 10, active: false });
    const requested = service.requestRedemption({ studentId: "fanfan", workspaceId: "owner", rewardId: "active" });
    service.transitionRedemption(requested.redemption.id, "reject", { actorPrincipalId: "owner" });

    const summary = service.summary({ studentId: "fanfan", workspaceId: "owner" });

    assert.equal(summary.growth.level.current.level, 6);
    assert.equal(summary.growth.level.next, null);
    assert.equal(summary.growth.level.progressPct, 100);
    assert.equal(summary.growth.totalEarnedCoins, 4000);
    assert.equal(summary.growth.rewardProgress.some((reward) => reward.id === "inactive"), false);
    assert.equal(summary.growth.sourceBreakdown.some((source) => source.sourceType === "redemption"), false);
  } finally {
    store.cleanup();
  }
}

testGrantIsIdempotentAndSanitized();
testRewardRedemptionHoldsAndReleasesCoins();
testApproveAndSettleKeepCoinsReserved();
testInsufficientCoinsCannotRedeem();
testRedemptionIdempotencyIsScoped();
testSummaryIncludesDerivedGrowthProfile();
testSummaryIncludesThirtyDayGrowthCoins();
testGrowthProfileIgnoresRedemptionAndInactiveRewards();
console.log("learning coin service tests passed");
