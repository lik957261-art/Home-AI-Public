"use strict";

const fs = require("node:fs");
const path = require("node:path");

const TEMPLATE_SKILL_REGISTRY = Object.freeze({
  "programming-assessment": {
    path: path.join("skills", "study-templates", "programming-assessment", "SKILL.md"),
    template: "programming",
    kind: "assessment",
  },
  "reading-analysis": {
    path: path.join("skills", "study-templates", "reading-analysis", "SKILL.md"),
    template: "reading",
    kind: "study-analysis",
  },
  "general-assessment": {
    path: path.join("skills", "study-templates", "general-assessment", "SKILL.md"),
    template: "assessment",
    kind: "assessment",
  },
  "learning-growth-card-creation": {
    path: path.join("skills", "study-templates", "learning-growth-card-creation", "SKILL.md"),
    template: "learning-growth",
    kind: "kanban-card-creation",
  },
  "english-reading-comprehension": {
    path: path.join("skills", "study-templates", "english-reading-comprehension", "SKILL.md"),
    template: "english-reading-comprehension-v1",
    kind: "learning-growth-english-template",
  },
  "english-listening-input": {
    path: path.join("skills", "study-templates", "english-listening-input", "SKILL.md"),
    template: "english-listening-input-v1",
    kind: "learning-growth-english-template",
  },
  "english-speaking-retell": {
    path: path.join("skills", "study-templates", "english-speaking-retell", "SKILL.md"),
    template: "english-speaking-retell-v1",
    kind: "learning-growth-english-template",
  },
  "english-shadowing-pronunciation": {
    path: path.join("skills", "study-templates", "english-shadowing-pronunciation", "SKILL.md"),
    template: "english-shadowing-pronunciation-v1",
    kind: "learning-growth-english-template",
  },
  "english-short-writing": {
    path: path.join("skills", "study-templates", "english-short-writing", "SKILL.md"),
    template: "english-short-writing-v1",
    kind: "learning-growth-english-template",
  },
  "english-rewrite-improvement": {
    path: path.join("skills", "study-templates", "english-rewrite-improvement", "SKILL.md"),
    template: "english-rewrite-improvement-v1",
    kind: "learning-growth-english-template",
  },
  "english-vocabulary-active-use": {
    path: path.join("skills", "study-templates", "english-vocabulary-active-use", "SKILL.md"),
    template: "english-vocabulary-active-use-v1",
    kind: "learning-growth-english-template",
  },
  "english-grammar-expression": {
    path: path.join("skills", "study-templates", "english-grammar-expression", "SKILL.md"),
    template: "english-grammar-expression-v1",
    kind: "learning-growth-english-template",
  },
  "english-presentation-project": {
    path: path.join("skills", "study-templates", "english-presentation-project", "SKILL.md"),
    template: "english-presentation-project-v1",
    kind: "learning-growth-english-template",
  },
  "english-weekly-challenge": {
    path: path.join("skills", "study-templates", "english-weekly-challenge", "SKILL.md"),
    template: "english-weekly-challenge-v1",
    kind: "learning-growth-english-template",
  },
  "english-mistake-repair": {
    path: path.join("skills", "study-templates", "english-mistake-repair", "SKILL.md"),
    template: "english-mistake-repair-v1",
    kind: "learning-growth-english-template",
  },
});

function cleanString(value) {
  return String(value ?? "").trim();
}

function defaultCompactText(value, maxChars = 8000) {
  const text = cleanString(value);
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function stripSkillFrontmatter(text = "") {
  const raw = String(text || "").replace(/^\uFEFF/, "");
  if (!raw.startsWith("---")) return raw.trim();
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return raw.trim();
  return raw.slice(end + 4).trim();
}

function templateSkillPath(skillId, options = {}) {
  const entry = TEMPLATE_SKILL_REGISTRY[cleanString(skillId)];
  if (!entry) return "";
  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, ".."));
  return path.resolve(repoRoot, entry.path);
}

function loadTemplateSkill(skillId, options = {}) {
  const entry = TEMPLATE_SKILL_REGISTRY[cleanString(skillId)];
  if (!entry) {
    return { ok: false, skillId: cleanString(skillId), path: "", text: "", error: "Unknown template skill" };
  }
  const filePath = templateSkillPath(skillId, options);
  try {
    const compactText = typeof options.compactText === "function" ? options.compactText : defaultCompactText;
    const text = compactText(stripSkillFrontmatter(fs.readFileSync(filePath, "utf8")), Number(options.maxChars || 8000) || 8000);
    return { ok: true, skillId: cleanString(skillId), path: filePath, text, entry };
  } catch (err) {
    return { ok: false, skillId: cleanString(skillId), path: filePath, text: "", entry, error: err?.message || String(err) };
  }
}

function templateSkillInstruction(skillId, options = {}) {
  const loaded = loadTemplateSkill(skillId, options);
  if (!loaded.ok || !loaded.text) return "";
  return [
    `Skill: study-templates/${loaded.skillId}`,
    loaded.text,
  ].join("\n\n").trim();
}

module.exports = {
  TEMPLATE_SKILL_REGISTRY,
  loadTemplateSkill,
  stripSkillFrontmatter,
  templateSkillInstruction,
  templateSkillPath,
};
