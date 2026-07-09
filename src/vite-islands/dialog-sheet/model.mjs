const DIALOG_SHEET_MODEL_VERSION = "20260704-vite-dialog-sheet-model-v1";

const DEFAULT_OPTIONS = Object.freeze({
  title: "确认操作",
  message: "",
  detail: "",
  confirmLabel: "确认",
  cancelLabel: "取消",
  inputLabel: "输入",
  defaultValue: "",
  placeholder: "",
  danger: false,
  multiline: false,
  selectText: true,
});

const VALID_KINDS = new Set(["confirm", "prompt", "message"]);

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).slice(0, Math.max(1, Number(max) || 4000));
}

function normalizeDialogKind(kind = "message") {
  const value = cleanString(kind, 40).trim().toLowerCase();
  return VALID_KINDS.has(value) ? value : "message";
}

function normalizeDialogOptions(options = {}) {
  return {
    title: cleanString(options.title || DEFAULT_OPTIONS.title, 120) || DEFAULT_OPTIONS.title,
    message: cleanString(options.message || DEFAULT_OPTIONS.message, 1000),
    detail: cleanString(options.detail || DEFAULT_OPTIONS.detail, 1000),
    confirmLabel: cleanString(options.confirmLabel || DEFAULT_OPTIONS.confirmLabel, 40) || DEFAULT_OPTIONS.confirmLabel,
    cancelLabel: cleanString(options.cancelLabel || DEFAULT_OPTIONS.cancelLabel, 40) || DEFAULT_OPTIONS.cancelLabel,
    inputLabel: cleanString(options.inputLabel || DEFAULT_OPTIONS.inputLabel, 60) || DEFAULT_OPTIONS.inputLabel,
    defaultValue: cleanString(options.defaultValue ?? DEFAULT_OPTIONS.defaultValue, 1000),
    placeholder: cleanString(options.placeholder || DEFAULT_OPTIONS.placeholder, 160),
    danger: Boolean(options.danger),
    multiline: Boolean(options.multiline),
    selectText: options.selectText !== false,
  };
}

function createDialogState(kind = "message", options = {}) {
  const normalizedKind = normalizeDialogKind(kind);
  return {
    version: DIALOG_SHEET_MODEL_VERSION,
    kind: normalizedKind,
    open: true,
    options: normalizeDialogOptions(options),
    result: {
      settled: false,
      value: null,
      reason: "",
    },
  };
}

function closeDialogState(state = {}, reason = "cancel", promptValue = "") {
  const kind = normalizeDialogKind(state.kind);
  let value = true;
  if (kind === "confirm") value = false;
  if (kind === "prompt") value = null;
  if (reason === "confirm") value = kind === "prompt" ? cleanString(promptValue, 1000) : true;
  return {
    ...state,
    open: false,
    result: {
      settled: true,
      value,
      reason: cleanString(reason || "cancel", 80),
    },
  };
}

function dialogCanCancel(state = {}) {
  return normalizeDialogKind(state.kind) !== "message";
}

function dialogNeedsInput(state = {}) {
  return normalizeDialogKind(state.kind) === "prompt";
}

function dialogButtonPlan(state = {}) {
  const options = normalizeDialogOptions(state.options || {});
  const kind = normalizeDialogKind(state.kind);
  const buttons = [];
  if (kind !== "message") {
    buttons.push({
      id: "cancel",
      label: options.cancelLabel,
      role: "cancel",
      tone: "neutral",
    });
  }
  buttons.push({
    id: "confirm",
    label: options.confirmLabel,
    role: "confirm",
    tone: options.danger ? "danger" : "primary",
  });
  return buttons;
}

export {
  DEFAULT_OPTIONS,
  DIALOG_SHEET_MODEL_VERSION,
  closeDialogState,
  createDialogState,
  dialogButtonPlan,
  dialogCanCancel,
  dialogNeedsInput,
  normalizeDialogKind,
  normalizeDialogOptions,
};
