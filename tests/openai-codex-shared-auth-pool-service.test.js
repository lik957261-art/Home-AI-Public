"use strict";

const assert = require("node:assert/strict");
const {
  entryIsUsable,
  importCodexHomeCredential,
  publicSummary,
  rotateAfterUsageLimit,
} = require("../adapters/openai-codex-shared-auth-pool-service");

function authDoc() {
  return {
    version: 1,
    providers: {
      "openai-codex": {
        auth_mode: "chatgpt",
        tokens: {
          access_token: "access-previous",
          refresh_token: "refresh-previous",
          account_id: "account-previous",
        },
      },
    },
    credential_pool: {
      "openai-codex": [
        {
          id: "homeai-previous",
          label: "Home AI Previous",
          source: "homeai-managed-profile",
          priority: 1,
          access_token: "access-previous",
          refresh_token: "refresh-previous",
          account_id: "account-previous",
        },
        {
          id: "homeai-default",
          label: "Home AI Default",
          source: "homeai-managed-profile",
          priority: 2,
          access_token: "access-default",
          refresh_token: "refresh-default",
          account_id: "account-default",
        },
      ],
    },
  };
}

function testRotatesToNextHomeAiManagedProfile() {
  const result = rotateAfterUsageLimit(authDoc(), {
    nowIso: "2026-06-27T08:00:00.000Z",
    nowMs: Date.parse("2026-06-27T08:00:00.000Z"),
    resetAt: 1782559255,
  });

  assert.equal(result.changed, true);
  assert.equal(result.rotated, true);
  assert.equal(result.previous_profile_id, "homeai-previous");
  assert.equal(result.active_profile_id, "homeai-default");
  assert.equal(result.doc.providers["openai-codex"].tokens.access_token, "access-default");
  assert.equal(result.doc.credential_pool["openai-codex"][1].last_error_reason, "usage_limit_reached");
  assert.equal(result.summary.active_profile_id, "homeai-default");
  assert.equal(result.summary.pool_size, 2);
  assert.equal(JSON.stringify(result.summary).includes("access-default"), false);
}

function testNoAlternateFailsClosedWithoutInventingProfile() {
  const doc = authDoc();
  doc.credential_pool["openai-codex"] = [doc.credential_pool["openai-codex"][0]];
  const result = rotateAfterUsageLimit(doc, {
    nowIso: "2026-06-27T08:00:00.000Z",
    nowMs: Date.parse("2026-06-27T08:00:00.000Z"),
  });

  assert.equal(result.changed, true);
  assert.equal(result.rotated, false);
  assert.equal(result.reason, "openai_codex_credential_pool_no_alternate");
  assert.equal(result.summary.active_profile_id, "homeai-previous");
}

function testExpiredUsageLimitCanBecomeUsableAgain() {
  assert.equal(entryIsUsable({
    access_token: "access",
    refresh_token: "refresh",
    last_error_code: 429,
    last_error_reason: "usage_limit_reached",
    last_error_reset_at: 1,
  }, 2), true);
  assert.equal(entryIsUsable({
    access_token: "access",
    refresh_token: "refresh",
    last_error_code: 429,
    last_error_reason: "usage_limit_reached",
    last_error_reset_at: 99,
  }, 2), false);
}

function testExplicitImportDoesNotDependOnCodexActiveProfile() {
  const result = importCodexHomeCredential(authDoc(), {
    auth_mode: "chatgpt",
    tokens: {
      access_token: "access-imported",
      refresh_token: "refresh-imported",
      account_id: "account-imported",
    },
    last_refresh: "2026-06-26T01:02:03.000Z",
  }, {
    profileId: "homeai-imported",
    label: "Home AI Imported",
    makeActive: true,
    importedFrom: "/Users/example/path",
    nowIso: "2026-06-27T08:00:00.000Z",
  });

  assert.equal(result.imported, true);
  assert.equal(result.active_profile_id, "homeai-imported");
  assert.equal(result.doc.providers["openai-codex"].tokens.access_token, "access-imported");
  assert.equal(result.summary.entries[0].source, "homeai-managed-profile");
  assert.equal(publicSummary(result.doc).entries[0].account_hash.length, 12);
  assert.equal(JSON.stringify(result.summary).includes("refresh-imported"), false);
}

testRotatesToNextHomeAiManagedProfile();
testNoAlternateFailsClosedWithoutInventingProfile();
testExpiredUsageLimitCanBecomeUsableAgain();
testExplicitImportDoesNotDependOnCodexActiveProfile();

console.log("openai codex shared auth pool service tests passed");
