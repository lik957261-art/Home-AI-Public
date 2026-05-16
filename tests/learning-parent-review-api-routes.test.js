"use strict";

const assert = require("node:assert/strict");
const {
  LEARNING_PARENT_REVIEW_API_ROUTE_SPECS,
  createLearningParentReviewApiRoutes,
} = require("../server-routes/learning-parent-review-api-routes");

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(body = "") {
      this.body = body;
    },
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function makeUrl(path) {
  return new URL(path, "http://localhost");
}

function makeRoutes() {
  const calls = [];
  const service = {
    list(input) {
      calls.push(["list", input]);
      return [{ reviewRequestId: "req-1", status: "pending" }];
    },
    get(reviewRequestId) {
      calls.push(["get", reviewRequestId]);
      return { reviewRequestId, status: "pending" };
    },
    decide(reviewRequestId, input) {
      calls.push(["decide", reviewRequestId, input]);
      return { reviewRequestId, status: input.decision };
    },
  };
  const routes = createLearningParentReviewApiRoutes({
    learningParentReviewRequestService: service,
    async readBody(req) {
      return req.body || {};
    },
    requireOwner(req, res) {
      if (!req.auth?.isOwner) {
        sendJson(res, 403, { error: "Owner access required" });
        return null;
      }
      return req.auth;
    },
    sendJson,
  });
  return { routes, calls };
}

async function request(routes, method, path, options = {}) {
  const res = makeResponse();
  const req = {
    method,
    url: path,
    body: options.body || {},
    auth: options.auth || { isOwner: true, principalId: "owner" },
  };
  const result = await routes.handle(req, res, makeUrl(path), { auth: req.auth });
  return { result, res, body: JSON.parse(res.body || "{}") };
}

async function testMetadata() {
  assert.equal(LEARNING_PARENT_REVIEW_API_ROUTE_SPECS.length, 3);
  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/learning/parent-review-requests" }).id, "learning-parent-review-requests-list");
  assert.equal(routes.match({ method: "POST", path: "/api/learning/parent-review-requests/req-1/decision" }).id, "learning-parent-review-request-decision");
}

async function testOwnerOnlyListAndDecision() {
  const { routes, calls } = makeRoutes();
  const denied = await request(routes, "GET", "/api/learning/parent-review-requests", {
    auth: { isOwner: false, workspaceId: "weixin_stephen" },
  });
  assert.equal(denied.res.statusCode, 403);
  const list = await request(routes, "GET", "/api/learning/parent-review-requests?learnerId=weixin_stephen&requestType=evaluation_review");
  assert.equal(list.res.statusCode, 200);
  assert.equal(list.body.reviewRequests[0].reviewRequestId, "req-1");
  const decision = await request(routes, "POST", "/api/learning/parent-review-requests/req-1/decision", {
    body: { decision: "approved" },
  });
  assert.equal(decision.res.statusCode, 200);
  assert.equal(decision.body.reviewRequest.status, "approved");
  assert.deepEqual(calls.map((call) => call[0]), ["list", "decide"]);
}

(async () => {
  await testMetadata();
  await testOwnerOnlyListAndDecision();
  console.log("learning parent review api routes tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
