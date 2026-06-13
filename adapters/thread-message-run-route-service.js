"use strict";

const DEFAULT_THREAD_MESSAGE_INITIAL_LIMIT = 60;
const MESSAGE_BODY_TOO_LARGE_ERROR = "Message is too large. Please attach it as a file or split it into smaller messages.";

function asObject(value, fallback = {}) {
  return value && typeof value === "object" ? value : fallback;
}

function requiredFunction(name) {
  return () => {
    throw new TypeError(`thread message run route service requires ${name}`);
  };
}

function optionalFunction(value, fallback) {
  return typeof value === "function" ? value : fallback;
}

function serviceGetter(options, getterName, serviceName) {
  if (typeof options[getterName] === "function") return options[getterName];
  if (options[serviceName]) return () => options[serviceName];
  return requiredFunction(`${getterName} or ${serviceName}`);
}

function normalizeInitialLimit(value) {
  const numeric = Number(value || DEFAULT_THREAD_MESSAGE_INITIAL_LIMIT);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : DEFAULT_THREAD_MESSAGE_INITIAL_LIMIT;
}

function requestBodyErrorResponse(err) {
  const message = err?.message || String(err || "Invalid request body");
  const code = err?.code || "";
  if (err?.status === 413 || code === "request_body_too_large" || /too large/i.test(message)) {
    return {
      status: 413,
      payload: {
        error: MESSAGE_BODY_TOO_LARGE_ERROR,
        code: "message_body_too_large",
      },
    };
  }
  return {
    status: err?.status && err.status >= 400 && err.status < 500 ? err.status : 400,
    payload: {
      error: message || "Invalid request body",
      code: "invalid_request_body",
    },
  };
}

function createCompactThreadForMessageCreatePlan(options = {}) {
  const compactThread = optionalFunction(options.compactThread, (thread) => thread);
  const compactThreadWithMessagePage = optionalFunction(options.compactThreadWithMessagePage, compactThread);
  const initialLimit = normalizeInitialLimit(
    options.threadMessageInitialLimit || options.initialMessageLimit || options.messageInitialLimit,
  );

  return function compactThreadForMessageCreatePlan(thread, plan = {}) {
    const descriptor = asObject(plan.responseDescriptor);
    if (descriptor.type === "message-page") {
      const pageOptions = Object.assign({}, asObject(descriptor.options));
      if (!pageOptions.limit) pageOptions.limit = initialLimit;
      return compactThreadWithMessagePage(thread, pageOptions);
    }
    return compactThread(thread);
  };
}

function createThreadMessageRunRouteService(options = {}) {
  const findThreadForRequest = optionalFunction(options.findThreadForRequest, requiredFunction("findThreadForRequest"));
  const readBody = optionalFunction(options.readBody, requiredFunction("readBody"));
  const authenticateRequest = optionalFunction(options.authenticateRequest, requiredFunction("authenticateRequest"));
  const requireOwner = optionalFunction(options.requireOwner, requiredFunction("requireOwner"));
  const sendJson = optionalFunction(options.sendJson, requiredFunction("sendJson"));
  const attachUploadedArtifactsToMessage = optionalFunction(options.attachUploadedArtifactsToMessage, () => {});
  const nowIso = optionalFunction(options.nowIso, () => new Date().toISOString());

  const getThreadMessageCreateService = serviceGetter(
    options,
    "getThreadMessageCreateService",
    "threadMessageCreateService",
  );
  const getThreadDirectCreateExecutionService = serviceGetter(
    options,
    "getThreadDirectCreateExecutionService",
    "threadDirectCreateExecutionService",
  );
  const getThreadOwnerElevationRetryService = serviceGetter(
    options,
    "getThreadOwnerElevationRetryService",
    "threadOwnerElevationRetryService",
  );
  const compactThreadForMessageCreatePlan = optionalFunction(
    options.compactThreadForMessageCreatePlan,
    createCompactThreadForMessageCreatePlan(options),
  );

  function send(status, payload, res) {
    sendJson(res, status, payload);
    return { status, payload };
  }

  async function handleThreadMessageCreate(req, res, _url, context = {}) {
    const thread = findThreadForRequest(req, context.threadId || "");
    let body = null;
    try {
      body = await readBody(req);
    } catch (err) {
      const response = requestBodyErrorResponse(err);
      return Object.assign(send(response.status, response.payload, res), {
        ok: false,
        code: response.payload.code,
      });
    }
    const auth = context.auth || authenticateRequest(req);
    const service = getThreadMessageCreateService();
    const plan = service.prepareThreadMessageCreate({ thread, body, auth, createdAt: nowIso() });

    if (!plan.ok) {
      const status = plan.status || 400;
      const payload = plan.response || { error: plan.error || "Message creation failed" };
      return Object.assign(send(status, payload, res), { ok: false, plan });
    }

    attachUploadedArtifactsToMessage(thread, plan.userMessage);
    const compactResponseThread = () => compactThreadForMessageCreatePlan(thread, plan);

    if (plan.nextAction === "plain-message") {
      const committed = service.commitPlainMessage(thread, plan);
      const status = committed.status || 201;
      const payload = { ok: true, thread: compactResponseThread() };
      return Object.assign(send(status, payload, res), { ok: true, plan, result: committed });
    }

    if (plan.nextAction === "direct-kanban-create") {
      const executed = await getThreadDirectCreateExecutionService().executeDirectCreate({
        thread,
        plan,
        compactResponseThread,
      });
      const status = executed.status || 400;
      const payload = executed.response || { error: executed.error || "Direct create failed" };
      return Object.assign(send(status, payload, res), { ok: Boolean(executed.ok), plan, result: executed });
    }

    const dispatched = await service.commitRunMessageAndDispatch(thread, plan);
    if (dispatched.ok) {
      const status = dispatched.status || 202;
      const payload = {
        run: dispatched.run,
        thread: compactResponseThread(),
      };
      if (plan.directCreateResult?.type === "todo") {
        payload.todo = plan.directCreateResult.todo;
        payload.inboxItem = plan.directCreateResult.inboxItem;
        payload.todoDraft = plan.directCreateResult.todoDraft;
      }
      return Object.assign(send(status, payload, res), { ok: true, plan, result: dispatched });
    }

    const status = dispatched.status || 502;
    const payload = { error: dispatched.error, thread: compactResponseThread() };
    return Object.assign(send(status, payload, res), { ok: false, plan, result: dispatched });
  }

  async function handleThreadMessageOwnerElevation(req, res, _url, context = {}) {
    const ownerAuth = requireOwner(req, res);
    if (!ownerAuth) return { ok: false, status: 401, payload: null, code: "owner_required" };

    const thread = findThreadForRequest(req, context.threadId || "");
    if (!thread) {
      return Object.assign(send(404, { error: "Thread not found" }, res), {
        ok: false,
        code: "thread_not_found",
      });
    }

    const messageId = String(context.messageId || "");
    const message = (Array.isArray(thread.messages) ? thread.messages : [])
      .find((item) => String(item.id || "") === messageId);
    if (!message || message.role !== "assistant") {
      return Object.assign(send(404, { error: "Assistant message not found" }, res), {
        ok: false,
        code: "assistant_message_not_found",
        thread,
      });
    }

    if (!message.elevationRequired) {
      return Object.assign(
        send(409, { error: "This message is not waiting for Owner elevation approval" }, res),
        {
          ok: false,
          code: "message_not_waiting_for_owner_elevation",
          thread,
          message,
        },
      );
    }

    const body = await readBody(req).catch((err) => ({ __error: err }));
    if (body.__error) {
      return Object.assign(send(400, { error: body.__error.message || "Invalid request body" }, res), {
        ok: false,
        code: "invalid_request_body",
        thread,
        message,
      });
    }

    const result = await getThreadOwnerElevationRetryService().retryOwnerElevation({
      ownerAuth,
      thread,
      messageId,
      message,
      body,
    });
    sendJson(res, result.status, result.payload);
    return result;
  }

  return Object.freeze({
    compactThreadForMessageCreatePlan,
    handleThreadMessageCreate,
    handleThreadMessageOwnerElevation,
  });
}

module.exports = {
  createCompactThreadForMessageCreatePlan,
  createThreadMessageRunRouteService,
};
