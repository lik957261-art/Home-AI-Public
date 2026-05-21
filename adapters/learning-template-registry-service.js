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

  function getTemplateById(templateId, input = {}) {
    const id = cleanString(templateId);
    if (!id) return null;
    return listTemplates(input).find((template) => template.id === id) || null;
  }

  function getTemplateForSkill(skillId, input = {}) {
    const id = cleanString(skillId);
    if (!id) return null;
    return listTemplates(input).find((template) => template.skillIds.includes(id)) || null;
  }

  function registeredSkillIds(input = {}) {
    return [...new Set(listTemplates(input).flatMap((template) => template.skillIds || []))];
  }

  function assertRegisteredTask(task = {}) {
    const domain = cleanString(task.domain) || "english";
    const templateId = cleanString(task.templateId);
    const skillId = cleanString(task.skillId);
    const template = getTemplateById(templateId, { domain });
    if (!template) {
      const err = new Error("Learning task recommendation uses an unsupported template");
      err.status = 422;
      throw err;
    }
    if (!skillId || !template.skillIds.includes(skillId)) {
      const err = new Error("Learning task recommendation skill does not match the template registry");
      err.status = 422;
      throw err;
    }
    return template;
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
    assertRegisteredTask,
    getTemplateById,
    getTemplateForSkill,
    listTemplates,
    registeredSkillIds,
    selectTemplatesForProgram,
  };
}

module.exports = {
  LEARNING_TEMPLATE_REGISTRY,
  createLearningTemplateRegistryService,
};
