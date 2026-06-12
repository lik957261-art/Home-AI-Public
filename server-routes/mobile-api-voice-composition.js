"use strict";

const { createVoiceInputApiRoutes } = require("./voice-input-api-routes");
const { createVoiceInputAsrProvider } = require("../adapters/voice-input-asr-provider");
const { createVoiceInputCorrectionService } = require("../adapters/voice-input-correction-service");
const { createVoiceInputService } = require("../adapters/voice-input-service");

function createMobileApiVoiceComposition(deps = {}) {
  const voiceInputAsrProvider = deps.voiceInputAsrProvider || createVoiceInputAsrProvider({
    env: deps.env || process.env,
  });
  const voiceInputCorrectionService = deps.voiceInputCorrectionService || createVoiceInputCorrectionService({
    makeId: deps.makeId,
    nowIso: deps.nowIso,
    saveState: deps.saveState,
    state: deps.state,
  });
  const voiceInputService = deps.voiceInputService || createVoiceInputService({
    asrProvider: voiceInputAsrProvider,
    correctionService: voiceInputCorrectionService,
    dataDir: deps.dataDir,
    env: deps.env || process.env,
    fs: deps.fs,
    makeId: deps.makeId,
    nowIso: deps.nowIso,
    path: deps.path,
    saveState: deps.saveState,
    state: deps.state,
  });
  const voiceInputApiRoutes = createVoiceInputApiRoutes({
    readBody: deps.readBody,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
    voiceInputService,
  });

  return {
    routes: { voiceInputApiRoutes },
    services: {
      voiceInputAsrProvider,
      voiceInputCorrectionService,
      voiceInputService,
    },
  };
}

module.exports = {
  createMobileApiVoiceComposition,
};
