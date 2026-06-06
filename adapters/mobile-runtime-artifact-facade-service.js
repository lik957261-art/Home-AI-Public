"use strict";

const {
  createArtifactTextRegistrationService: defaultCreateArtifactTextRegistrationService,
} = require("./artifact-text-registration-service");

function requiredObject(options, name) {
  const value = options[name];
  if (value && typeof value === "object") return value;
  throw new Error(`MobileRuntimeArtifactFacadeService requires ${name}`);
}

function requiredFactory(options, name, fallback = null) {
  const value = options[name] || fallback;
  if (typeof value === "function") return value;
  throw new Error(`MobileRuntimeArtifactFacadeService requires ${name}`);
}

function createMobileRuntimeArtifactFacadeService(options = {}) {
  const fileArtifactAccessService = requiredObject(options, "fileArtifactAccessService");
  const createArtifactTextRegistrationService = requiredFactory(
    options,
    "createArtifactTextRegistrationService",
    defaultCreateArtifactTextRegistrationService
  );
  const sourceMarkdownSearchCache = options.sourceMarkdownSearchCache || new Map();
  let artifactTextRegistrationService = null;

  function getArtifactTextRegistrationService() {
    if (!artifactTextRegistrationService) {
      artifactTextRegistrationService = createArtifactTextRegistrationService({
        dedupe: options.dedupe,
        effectiveProjectForThread: options.effectiveProjectForThread,
        extractArtifactPaths: options.extractArtifactPaths,
        findProject: options.findProject,
        findSubproject: options.findSubproject,
        isPathAllowedForThread: options.isPathAllowedForThread,
        makeId: options.makeId,
        mimeFor: options.mimeFor,
        normalizeLocalPath: options.normalizeLocalPath,
        nowIso: options.nowIso,
        sourceMarkdownSearchCache,
        sourceMarkdownSearchLimit: options.sourceMarkdownSearchLimit,
        state: options.state,
      });
    }
    return artifactTextRegistrationService;
  }

  function fileArtifact(methodName, args) {
    return fileArtifactAccessService[methodName](...args);
  }

  function textArtifact(methodName, args) {
    return getArtifactTextRegistrationService()[methodName](...args);
  }

  return Object.freeze({
    safeFileName: (...args) => fileArtifact("safeFileName", args),
    safeDirectoryName: (...args) => fileArtifact("safeDirectoryName", args),
    uniqueChildPath: (...args) => fileArtifact("uniqueChildPath", args),
    workspaceDefaultRoot: (...args) => fileArtifact("workspaceDefaultRoot", args),
    threadUploadRoot: (...args) => fileArtifact("threadUploadRoot", args),
    workspaceUploadRoot: (...args) => fileArtifact("workspaceUploadRoot", args),
    uploadWorkspaceAllowedForThread: (...args) => fileArtifact("uploadWorkspaceAllowedForThread", args),
    uploadWorkspaceIdForRequest: (...args) => fileArtifact("uploadWorkspaceIdForRequest", args),
    uploadRootsForThread: (...args) => fileArtifact("uploadRootsForThread", args),
    workspaceUploadDirectoryForRequest: (...args) => fileArtifact("workspaceUploadDirectoryForRequest", args),
    registerUploadArtifact: (...args) => fileArtifact("registerUploadArtifact", args),
    publicArtifactFromClient: (...args) => fileArtifact("publicArtifactFromClient", args),
    attachUploadedArtifactsToMessage: (...args) => fileArtifact("attachUploadedArtifactsToMessage", args),
    getArtifactTextRegistrationService,
    compactArtifactForMessage: (...args) => textArtifact("compactArtifactForMessage", args),
    compactArtifactPathKey: (...args) => textArtifact("compactArtifactPathKey", args),
    compactArtifactStemKey: (...args) => textArtifact("compactArtifactStemKey", args),
    publicMarkdownPreviewArtifact: (...args) => textArtifact("publicMarkdownPreviewArtifact", args),
    sourceMarkdownSearchRoots: (...args) => textArtifact("sourceMarkdownSearchRoots", args),
    findMarkdownByStemUnderRoot: (...args) => textArtifact("findMarkdownByStemUnderRoot", args),
    findSourceMarkdownForArtifact: (...args) => textArtifact("findSourceMarkdownForArtifact", args),
    companionMarkdownPathForArtifact: (...args) => textArtifact("companionMarkdownPathForArtifact", args),
    findThreadForMessage: (...args) => textArtifact("findThreadForMessage", args),
    compactArtifactsForMessage: (...args) => textArtifact("compactArtifactsForMessage", args),
    registerArtifactsFromText: (...args) => textArtifact("registerArtifactsFromText", args),
  });
}

module.exports = {
  createMobileRuntimeArtifactFacadeService,
};
