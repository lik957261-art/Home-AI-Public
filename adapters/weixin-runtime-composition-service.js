"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const weixinMarkdownForwardService = require("./weixin-markdown-forward-service");
const { createWeixinFileForwardService } = require("./weixin-file-forward-service");
const { createWeixinForwardService } = require("./weixin-forward-service");
const { createWeixinIngressEventService } = require("./weixin-ingress-event-service");
const { createWeixinOutboundDeliveryService } = require("./weixin-outbound-delivery-service");

function readFirstConfiguredSecret(paths = []) {
  for (const filePath of paths) {
    try {
      if (!filePath || !fs.existsSync(filePath)) continue;
      const text = fs.readFileSync(filePath, "utf8").trim();
      const value = text.split(/\r?\n/)[0].trim();
      if (value) return value;
    } catch (_) {}
  }
  return "";
}

function redactWeixinRunErrorText(value) {
  let text = String(value || "");
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]");
  text = text.replace(/\b(?:sk|sess|eyJ)[A-Za-z0-9._~+/=-]{16,}/g, "[redacted-token]");
  text = text.replace(/\b(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|secret|password|cookie|credential)\s*[:=]\s*([^\s,;]+)/gi, "$1=[redacted]");
  text = text.replace(/(?:[A-Za-z]:\\|\/)[^\s"'<>]*(?:secret|token|auth|credential)[^\s"'<>]*/gi, "[redacted-path]");
  return text;
}

function createWeixinRuntimeCompositionService(deps = {}) {
  let forwardService = null;
  let fileForwardService = null;
  let ingressEventService = null;
  let outboundDeliveryService = null;

  function configuredIngressKey() {
    const env = deps.env || process.env;
    return String(
      env.HERMES_MOBILE_WEIXIN_INGRESS_KEY
        || env.HERMES_WEB_WEIXIN_INGRESS_KEY
        || readFirstConfiguredSecret(deps.ingressKeyPaths || [])
        || "",
    ).trim();
  }

  function requestIngressKey(req) {
    const auth = String(req?.headers?.authorization || "").trim();
    const bearer = auth.match(/^Bearer\s+(.+)$/i);
    return String(
      req?.headers?.["x-hermes-mobile-ingress-key"]
        || req?.headers?.["x-hermes-web-ingress-key"]
        || (bearer ? bearer[1] : "")
        || "",
    ).trim();
  }

  function constantTimeStringEqual(a, b) {
    const left = Buffer.from(deps.hashValue(a), "hex");
    const right = Buffer.from(deps.hashValue(b), "hex");
    return crypto.timingSafeEqual(left, right);
  }

  function authenticateIngressRequest(req) {
    const configured = configuredIngressKey();
    if (!configured) return { ok: false, status: 503, error: "Weixin ingress key is not configured" };
    const provided = requestIngressKey(req);
    if (!provided || !constantTimeStringEqual(provided, configured)) {
      return { ok: false, status: 401, error: "Invalid Weixin ingress key" };
    }
    return { ok: true };
  }

  function requireIngress(req, res) {
    const auth = authenticateIngressRequest(req);
    if (!auth.ok) {
      deps.sendJson(res, auth.status || 401, { ok: false, error: auth.error || "Unauthorized" });
      return null;
    }
    return auth;
  }

  function getForwardService() {
    if (!forwardService) {
      forwardService = createWeixinForwardService({
        authCanAccessWorkspace: deps.authCanAccessWorkspace,
        chatGroupMemberWorkspaceIds: deps.chatGroupMemberWorkspaceIds,
        findWorkspace: deps.findWorkspace,
        isOwnerAuth: deps.isOwnerAuth,
        state: deps.state,
        threadAccessibleToAuth: deps.threadAccessibleToAuth,
        workspaceLabel: deps.workspaceLabel,
      });
    }
    return forwardService;
  }

  function getOutboundDeliveryService() {
    if (!outboundDeliveryService) {
      outboundDeliveryService = createWeixinOutboundDeliveryService({
        state: deps.state,
        nowIso: deps.nowIso,
        normalizeExternalDelivery: deps.normalizeExternalDelivery,
        deliveryId: deps.deliveryId,
        compactText: deps.compactText,
        maxMessageChars: deps.maxMessageChars,
        retryLimit: deps.retryLimit,
        retryBaseMs: deps.retryBaseMs,
        retryMaxMs: deps.retryMaxMs,
        egressDecide: deps.egressDecide,
        isStaleHttpToolAvailabilityClaim: deps.isStaleHttpToolAvailabilityClaim,
        isStaleImageToolAvailabilityClaim: deps.isStaleImageToolAvailabilityClaim,
        saveState: deps.saveState,
        broadcast: deps.broadcast,
        threadSummary: deps.threadSummary,
        compactMessage: deps.compactMessage,
      });
    }
    return outboundDeliveryService;
  }

  function userFacingRunError(err) {
    const raw = redactWeixinRunErrorText(err?.message || err).trim();
    if (!raw) return "Hermes run failed before producing a reply.";
    if (/terminated|cancelled|canceled|aborted/i.test(raw)) {
      return "\u8fd0\u884c\u88ab\u7ec8\u6b62\uff0c\u672a\u751f\u6210\u56de\u590d\u3002";
    }
    return raw;
  }

  function getIngressEventService() {
    if (!ingressEventService) {
      ingressEventService = createWeixinIngressEventService({
        weixinIngressProvider: deps.weixinIngressProvider,
        findWorkspace: deps.findWorkspace,
        findExistingIngressEvent: deps.findExistingIngressEvent,
        wakeOutboundForInbound: wakeOutboundDeliveriesForInboundEvent,
        classifyMaintenanceIntent: deps.classifyMaintenanceIntent,
        ensureThreadForEvent: deps.ensureThreadForEvent,
        taskGroupId: deps.taskGroupId,
        nowIso: deps.nowIso,
        makeId: deps.makeId,
        senderInfoForWorkspace: deps.senderInfoForWorkspace,
        normalizeExternalIngress: deps.normalizeExternalIngress,
        normalizeExternalDelivery: deps.normalizeExternalDelivery,
        deliveryMatchesInboundEvent: deliveryMatchesInboundEvent,
        attachmentContextWindowMs: deps.attachmentContextWindowMs,
        taskGroupHasRunningRun: deps.taskGroupHasRunningRun,
        runConcurrencyError: deps.runConcurrencyError,
        saveState: deps.saveState,
        broadcast: deps.broadcast,
        threadSummary: deps.threadSummary,
        compactThread: deps.compactThread,
        compactMessage: deps.compactMessage,
        startRunForThread: deps.startRunForThread,
        userFacingRunError,
        enqueueTerminalDelivery: enqueueExternalDeliveryForTerminalMessage,
        removeThreadActiveRun: deps.removeThreadActiveRun,
      });
    }
    return ingressEventService;
  }

  function fileResultFromBridgeFileForForward(file, workspaceId) {
    const buffer = deps.bridgeFileBuffer(file);
    if (!buffer.length) return { status: 404, error: "File not found" };
    const safeName = deps.safeFileName(file?.name || path.basename(file?.displayPath || "") || "file");
    const dir = path.join(deps.dataDir, "artifacts", "weixin-forward", deps.safeFileName(workspaceId || "owner"));
    fs.mkdirSync(dir, { recursive: true });
    const localPath = path.join(dir, `${Date.now()}-${deps.makeId("file")}-${safeName}`);
    fs.writeFileSync(localPath, buffer);
    return {
      file: {
        localPath,
        displayPath: file?.displayPath || localPath,
        name: safeName,
        mime: file?.mime || deps.mimeFor(safeName),
        size: buffer.length,
        updatedAt: deps.nowIso(),
      },
    };
  }

  function materializeForwardFile(file, workspaceId) {
    return weixinMarkdownForwardService.materializeWeixinForwardFile(file, workspaceId, {
      dataDir: deps.dataDir,
      makeId: deps.makeId,
      maxBytes: deps.forwardMarkdownMaxBytes,
      mimeFor: deps.mimeFor,
      normalizeLocalPath: deps.normalizeLocalPath,
      nowIso: deps.nowIso,
      safeFileName: deps.safeFileName,
      spawnSync: deps.spawnSync,
    });
  }

  function getFileForwardService() {
    if (!fileForwardService) {
      fileForwardService = createWeixinFileForwardService({
        authCanAccessWorkspace: deps.authCanAccessWorkspace,
        basename: path.basename,
        broadcast: deps.broadcast,
        compactMessage: deps.compactMessage,
        compactText: deps.compactText,
        compactThread: deps.compactThread,
        deliveryId: deps.deliveryId,
        egressPolicyProvider: deps.egressPolicyProvider,
        ensureWeixinSingleWindowThread: deps.ensureWeixinSingleWindowThread,
        fileResultFromBridgeFileForForward,
        findThreadForAuth: deps.findThreadForAuth,
        fs,
        isOwnerAuth: deps.isOwnerAuth,
        isWeixinSingleWindowThread: deps.isWeixinSingleWindowThread,
        makeId: deps.makeId,
        materializeWeixinForwardFile: materializeForwardFile,
        mimeFor: deps.mimeFor,
        normalizeExternalDelivery: deps.normalizeExternalDelivery,
        normalizeLocalPath: deps.normalizeLocalPath,
        nowIso: deps.nowIso,
        publicWeixinOutboundDelivery,
        resolveArtifactForRequest: deps.resolveArtifactForRequest,
        resolveAuthorizedCronDeliverableFile: deps.resolveAuthorizedCronDeliverableFile,
        resolveAuthorizedCronOutputFile: deps.resolveAuthorizedCronOutputFile,
        resolveFileForBrowserRequest: deps.resolveFileForBrowserRequest,
        resolveKanbanOutputFile: deps.resolveKanbanOutputFile,
        resolveWeixinForwardTarget: (...args) => getForwardService().resolveTarget(...args),
        safeFileName: deps.safeFileName,
        saveState: deps.saveState,
        singleWindowChatTaskGroupId: deps.singleWindowChatTaskGroupId,
        state: deps.state,
        threadSummary: deps.threadSummary,
      });
    }
    return fileForwardService;
  }

  function weixinIngressIsAttachmentOnlyEvent(event) {
    return !String(event?.text || "").trim() && Array.isArray(event?.attachments) && event.attachments.length > 0;
  }

  function consumePendingAttachmentMessages(...args) {
    return getIngressEventService().consumePendingAttachmentMessages(...args);
  }

  function ingressInstructions(...args) {
    return getIngressEventService().instructionsForWeixinIngress(...args);
  }

  function enqueueExternalDeliveryForTerminalMessage(...args) {
    return getOutboundDeliveryService().enqueueForTerminalMessage(...args);
  }

  function publicWeixinOutboundDelivery(...args) {
    return getOutboundDeliveryService().publicDelivery(...args);
  }

  function deliveryMatchesInboundEvent(...args) {
    return getOutboundDeliveryService().deliveryMatchesInboundEvent(...args);
  }

  function wakeOutboundDeliveriesForInboundEvent(...args) {
    return getOutboundDeliveryService().wakeForInboundEvent(...args);
  }

  return {
    ackWeixinOutboundDelivery: (...args) => getOutboundDeliveryService().ackDelivery(...args),
    collectRecentWeixinForwardTargets: (...args) => getForwardService().collectRecentTargets(...args),
    consumeWeixinPendingAttachmentMessages: consumePendingAttachmentMessages,
    createWeixinFileForwardDelivery: (...args) => getFileForwardService().createWeixinFileForwardDelivery(...args),
    enqueueExternalDeliveryForTerminalMessage,
    isWeixinDeliveryRetryable: (...args) => getOutboundDeliveryService().isDeliveryRetryable(...args),
    isWeixinInboundWakeRequiredFailure: (...args) => getOutboundDeliveryService().isInboundWakeRequiredFailure(...args),
    pendingWeixinOutboundDeliveries: (...args) => getOutboundDeliveryService().pendingDeliveries(...args),
    publicArtifactForWeixinForward: (...args) => getFileForwardService().publicArtifactForWeixinForward(...args),
    publicWeixinOutboundDelivery,
    redactWeixinRunErrorText,
    requireWeixinIngress: requireIngress,
    resolveFileFromSourceUrlForRequest: (...args) => getFileForwardService().resolveFileFromSourceUrlForRequest(...args),
    resolveWeixinForwardFile: (...args) => getFileForwardService().resolveWeixinForwardFile(...args),
    resolveWeixinForwardTarget: (...args) => getForwardService().resolveTarget(...args),
    startWeixinIngressEvent: (...args) => getIngressEventService().start(...args),
    userFacingWeixinRunError: userFacingRunError,
    weixinDeliveryMatchesInboundEvent: deliveryMatchesInboundEvent,
    weixinDeliveryRetryCount: (...args) => getOutboundDeliveryService().deliveryRetryCount(...args),
    weixinDeliveryRetryDelayMs: (...args) => getOutboundDeliveryService().deliveryRetryDelayMs(...args),
    weixinForwardTargetsForWorkspace: (...args) => getForwardService().targetsForWorkspace(...args),
    weixinIngressInstructions: ingressInstructions,
    weixinIngressIsAttachmentOnlyEvent,
    weixinTargetFromWorkspace: (...args) => getForwardService().targetFromWorkspace(...args),
    wakeWeixinOutboundDeliveriesForInboundEvent: wakeOutboundDeliveriesForInboundEvent,
  };
}

module.exports = {
  createWeixinRuntimeCompositionService,
  readFirstConfiguredSecret,
  redactWeixinRunErrorText,
};
