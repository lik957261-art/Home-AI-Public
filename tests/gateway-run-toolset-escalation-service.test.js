"use strict";

const assert = require("node:assert/strict");
const {
  expandCommonWebEscalationToolsets,
  findEscalationUserMessage,
  parseToolsetEscalationRequest,
  routeOmittedAuthorizedToolsets,
  routeSelectedToolsets,
  sanitizeToolsetEscalationVisibleText,
  toolsetEscalationMessage,
  uniqueCleanStrings,
} = require("../adapters/gateway-run-toolset-escalation-service");

function testParseRequestFiltersAuthorizedAndBlockedToolsets() {
  const message = {
    runOptions: {
      toolsetRouting: {
        selected_toolsets: ["file"],
        omitted_authorized_toolsets: ["web", "search"],
      },
    },
  };

  const request = parseToolsetEscalationRequest(
    "prefix HERMES_TOOLSET_ESCALATION_REQUIRED {\"toolsets\":[\"web\",\"terminal\",\"search\"],\"reason\":\"needs current data\"}",
    message,
  );

  assert.deepEqual(request.toolsets, ["web", "search"]);
  assert.deepEqual(request.requestedToolsets, ["web", "terminal", "search"]);
  assert.deepEqual(request.retryableToolsets, ["web", "search"]);
  assert.deepEqual(request.blockedToolsets, ["terminal"]);
  assert.equal(request.reason, "needs current data");
  assert.equal(request.source, "model_toolset_escalation");
}

function testSchemaMismatchSourceWhenAlreadySelected() {
  const message = {
    runOptions: {
      toolsetRouting: {
        selected_toolsets: ["wardrobe"],
        omitted_authorized_toolsets: ["web"],
      },
    },
  };
  const request = parseToolsetEscalationRequest(
    "HERMES_TOOLSET_ESCALATION_REQUIRED {\"toolsets\":[\"wardrobe\"],\"reason\":\"needs wardrobe\"}",
    message,
  );

  assert.deepEqual(request.toolsets, ["wardrobe"]);
  assert.deepEqual(request.retryableToolsets, []);
  assert.equal(request.source, "model_toolset_schema_mismatch");
}

function testRouteToolsetsReadPolicyFallback() {
  const message = {
    runOptions: {
      access_policy_context: {
        allowed_toolsets: ["file", "vision"],
        toolset_routing: {
          omitted_authorized_toolsets: ["wardrobe"],
        },
      },
    },
  };

  assert.deepEqual(routeSelectedToolsets(message), ["file", "vision"]);
  assert.deepEqual(routeOmittedAuthorizedToolsets(message), ["wardrobe"]);
}

function testSanitizeMarkerAndMessageProjection() {
  const sanitized = sanitizeToolsetEscalationVisibleText("Visible\nHERMES_TOOLSET_ESCALATION_REQUIRED {\"toolsets\":[\"web\"]}");
  assert.deepEqual(sanitized, { text: "Visible", found: true });
  assert.deepEqual(sanitizeToolsetEscalationVisibleText("Plain"), { text: "Plain", found: false });

  const retryable = toolsetEscalationMessage({ toolsets: ["web"], retryableToolsets: ["web"], reason: "needs search" });
  assert.equal(retryable.includes("web"), true);
  assert.equal(retryable.includes("needs search"), true);
  assert.equal(retryable.includes("HERMES_TOOLSET_ESCALATION_REQUIRED"), false);

  const blocked = toolsetEscalationMessage({ toolsets: ["terminal"], blockedToolsets: ["terminal"], reason: "blocked" });
  assert.equal(blocked.includes("terminal"), true);
  assert.equal(blocked.includes("Blocked toolsets"), true);
}

function testExpandCommonWebCompanionsOnlyWhenAuthorized() {
  assert.deepEqual(
    expandCommonWebEscalationToolsets(["web"], ["web", "search", "browser", "terminal"]),
    ["web", "search", "browser"],
  );
  assert.deepEqual(
    expandCommonWebEscalationToolsets(["wardrobe"], ["web", "search", "browser", "wardrobe"]),
    ["wardrobe"],
  );
}

function testFindEscalationUserMessage() {
  const thread = {
    messages: [
      { id: "user_1", role: "user", taskGroupId: "group_a" },
      { id: "assistant_1", role: "assistant", taskGroupId: "group_a" },
      { id: "user_2", role: "user", taskGroupId: "group_b" },
      { id: "assistant_2", role: "assistant", taskGroupId: "group_b", replyToMessageId: "user_2" },
    ],
  };

  assert.equal(findEscalationUserMessage(thread, thread.messages[3]).id, "user_2");
  assert.equal(findEscalationUserMessage(thread, thread.messages[1]).id, "user_1");
  assert.equal(findEscalationUserMessage({ messages: [{ id: "assistant", role: "assistant" }] }, { id: "assistant" }), null);
}

function testUniqueCleanStrings() {
  assert.deepEqual(uniqueCleanStrings([" web ", "", "web", "search"]), ["web", "search"]);
}

testParseRequestFiltersAuthorizedAndBlockedToolsets();
testSchemaMismatchSourceWhenAlreadySelected();
testRouteToolsetsReadPolicyFallback();
testSanitizeMarkerAndMessageProjection();
testExpandCommonWebCompanionsOnlyWhenAuthorized();
testFindEscalationUserMessage();
testUniqueCleanStrings();

console.log("gateway run toolset escalation service tests passed");
