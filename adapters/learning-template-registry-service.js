"use strict";

const {
  englishTemplateRegistryEntries,
} = require("./learning-english-template-pack-service");

const LEARNING_TEMPLATE_REGISTRY = Object.freeze(englishTemplateRegistryEntries());

function cleanString(value) {
  return String(value ?? "").trim();
}

function createLearningTemplateRegistryService() {
  function listTemplates(input = {}) {
    const domain = cleanString(input.domain);
    if (!domain) return LEARNING_TEMPLATE_REGISTRY.slice();
    return LEARNING_TEMPLATE_REGISTRY.filter((template) => template.domain === domain);
  }

  function selectTemplatesForProgram(program = {}) {
    const domain = cleanString(program.domain) || "english";
    const focus = new Set(Array.isArray(program.focusAreas) ? program.focusAreas : []);
    const templates = listTemplates({ domain }).filter((template) => {
      if (!focus.size) return true;
      return template.skillIds.some((id) => focus.has(id));
    });
    if (domain === "english" && !templates.some((template) => template.id === "english-mistake-repair-v1")) {
      templates.push(LEARNING_TEMPLATE_REGISTRY.find((template) => template.id === "english-mistake-repair-v1"));
    }
    return templates.filter(Boolean);
  }

  return {
    listTemplates,
    selectTemplatesForProgram,
  };
}

module.exports = {
  LEARNING_TEMPLATE_REGISTRY,
  createLearningTemplateRegistryService,
};
