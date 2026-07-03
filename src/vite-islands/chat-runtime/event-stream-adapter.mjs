import {
  applyChatRuntimeEvent,
  initialChatRuntimeState,
} from "./model.mjs";

const CHAT_EVENT_STREAM_ADAPTER_VERSION = "20260702-vite-chat-event-stream-adapter-v1";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function boundedDiagnostic(code, fields = {}) {
  return Object.freeze({
    code: cleanString(code, 120),
    eventType: cleanString(fields.eventType || "", 120),
    source: cleanString(fields.source || "event_stream_adapter", 120),
    detail: cleanString(fields.detail || "", 240),
    threadId: cleanString(fields.threadId || "", 180),
    messageId: cleanString(fields.messageId || "", 180),
  });
}

function eventTypeOf(payload = {}) {
  return cleanString(payload.type || payload.event || "", 120);
}

function parseChatEventStreamInput(input) {
  let source = "object";
  let payload = input;
  if (typeof input === "string") {
    source = "string";
    try {
      payload = JSON.parse(input);
    } catch (_error) {
      return {
        ok: false,
        source,
        payload: null,
        diagnostic: boundedDiagnostic("event_stream_invalid_json", {
          source,
          detail: input.slice(0, 120),
        }),
      };
    }
  } else if (isObject(input) && "data" in input) {
    source = "message_event";
    const raw = input.data;
    try {
      payload = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (_error) {
      return {
        ok: false,
        source,
        payload: null,
        diagnostic: boundedDiagnostic("event_stream_invalid_json", {
          source,
          detail: String(raw || "").slice(0, 120),
        }),
      };
    }
  }
  if (!isObject(payload)) {
    return {
      ok: false,
      source,
      payload: null,
      diagnostic: boundedDiagnostic("event_stream_invalid_payload", {
        source,
        detail: typeof payload,
      }),
    };
  }
  return {
    ok: true,
    source,
    payload,
    eventType: eventTypeOf(payload),
  };
}

function isChatRuntimePayload(payload = {}) {
  const eventType = eventTypeOf(payload);
  if (["message.delta", "thread.updated", "run.event"].includes(eventType)) return true;
  if (isObject(payload.message)) return true;
  if (eventType === "message" && (isObject(payload.message) || payload.threadId || payload.thread_id)) return true;
  if ((payload.role || payload.id) && (payload.threadId || payload.thread_id)) return true;
  return false;
}

function appendAdapterDiagnostic(state, diagnostic, eventType = "event_stream.diagnostic") {
  const current = initialChatRuntimeState(state);
  return initialChatRuntimeState(Object.assign({}, current, {
    latestEventType: cleanString(eventType || "event_stream.diagnostic", 120),
    diagnostics: current.diagnostics.concat(diagnostic),
  }));
}

function applyChatEventStreamRecord(state, input, options = {}) {
  const parsed = parseChatEventStreamInput(input);
  if (!parsed.ok) {
    return {
      ok: false,
      applied: false,
      ignored: false,
      source: parsed.source,
      eventType: "",
      diagnostic: parsed.diagnostic,
      state: appendAdapterDiagnostic(state, parsed.diagnostic, "event_stream.invalid"),
    };
  }
  const { payload, eventType, source } = parsed;
  if (eventType === "client.version") {
    const diagnostic = boundedDiagnostic("event_stream_ignored_client_version", {
      source,
      eventType,
    });
    return {
      ok: true,
      applied: false,
      ignored: true,
      source,
      eventType,
      diagnostic,
      state: appendAdapterDiagnostic(state, diagnostic, eventType),
    };
  }
  if (!isChatRuntimePayload(payload)) {
    const diagnostic = boundedDiagnostic("event_stream_ignored_non_chat_event", {
      source,
      eventType: eventType || "unknown",
      threadId: payload.threadId || payload.thread_id,
      messageId: payload.messageId || payload.message_id,
    });
    return {
      ok: true,
      applied: false,
      ignored: true,
      source,
      eventType,
      diagnostic,
      state: appendAdapterDiagnostic(state, diagnostic, eventType || "unknown"),
    };
  }
  return {
    ok: true,
    applied: true,
    ignored: false,
    source,
    eventType,
    diagnostic: null,
    state: applyChatRuntimeEvent(state, payload, options),
  };
}

export {
  CHAT_EVENT_STREAM_ADAPTER_VERSION,
  applyChatEventStreamRecord,
  isChatRuntimePayload,
  parseChatEventStreamInput,
};
