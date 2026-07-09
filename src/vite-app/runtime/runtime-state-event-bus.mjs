const RUNTIME_STATE_EVENT_BUS_VERSION = "20260704-vite-runtime-state-event-bus-v1";

function noop() {}

function safeString(value, max = 240) {
  return String(value == null ? "" : value).slice(0, Math.max(1, Number(max) || 240));
}

function safeEventType(type) {
  return safeString(type, 160).trim() || "runtime:unknown";
}

function clonePlainObject(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.assign({}, value);
}

function boundedEventDetail(detail = {}) {
  const cloned = clonePlainObject(detail);
  return Object.freeze(cloned);
}

function pushRecentEvent(recentEvents, event, maxRecentEvents) {
  if (!Array.isArray(recentEvents) || maxRecentEvents <= 0) return;
  recentEvents.push({
    type: event.type,
    timestamp: event.timestamp,
    detailKeys: Object.keys(event.detail || {}).slice(0, 20),
  });
  while (recentEvents.length > maxRecentEvents) recentEvents.shift();
}

export function createRuntimeEventBus(options = {}) {
  const handlers = new Map();
  const wildcardHandlers = new Set();
  const recentEvents = [];
  const maxRecentEvents = Math.max(0, Math.min(100, Number(options.maxRecentEvents ?? 30) || 0));
  const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  const onError = typeof options.onError === "function" ? options.onError : noop;

  function bucket(type) {
    const key = safeEventType(type);
    if (!handlers.has(key)) handlers.set(key, new Set());
    return handlers.get(key);
  }

  function on(type, handler) {
    if (!type || typeof handler !== "function") return noop;
    const key = safeEventType(type);
    const target = key === "*" ? wildcardHandlers : bucket(key);
    target.add(handler);
    return () => off(key, handler);
  }

  function off(type, handler) {
    const key = safeEventType(type);
    const target = key === "*" ? wildcardHandlers : handlers.get(key);
    if (!target) return;
    target.delete(handler);
    if (target !== wildcardHandlers && !target.size) handlers.delete(key);
  }

  function emit(type, detail = {}) {
    const event = Object.freeze({
      type: safeEventType(type),
      detail: boundedEventDetail(detail),
      timestamp: safeString(now(), 80),
    });
    pushRecentEvent(recentEvents, event, maxRecentEvents);
    const targets = [
      ...(handlers.get(event.type) || []),
      ...wildcardHandlers,
    ];
    for (const handler of targets) {
      try {
        handler(event);
      } catch (error) {
        onError(error, event);
      }
    }
    return event;
  }

  function snapshot() {
    return Object.freeze({
      version: RUNTIME_STATE_EVENT_BUS_VERSION,
      listenerTypeCount: handlers.size,
      wildcardListenerCount: wildcardHandlers.size,
      recentEvents: Object.freeze(recentEvents.map((event) => Object.freeze(Object.assign({}, event)))),
    });
  }

  return Object.freeze({ on, off, emit, snapshot });
}

export function createRuntimeStateStore(initialState = {}, events = createRuntimeEventBus()) {
  let current = clonePlainObject(initialState);

  function snapshot() {
    return Object.freeze(clonePlainObject(current));
  }

  function get(key) {
    if (typeof key === "string") return current[key];
    return clonePlainObject(current);
  }

  function set(patch = {}, options = {}) {
    const safePatch = clonePlainObject(patch);
    current = Object.assign({}, current, safePatch);
    events.emit(options.eventType || "state:changed", {
      state: clonePlainObject(current),
      patch: safePatch,
      source: safeString(options.source || "runtime_state_store", 120),
    });
    return get();
  }

  function replace(nextState = {}, options = {}) {
    const previousKeys = Object.keys(current);
    current = clonePlainObject(nextState);
    events.emit(options.eventType || "state:replaced", {
      state: clonePlainObject(current),
      previousKeyCount: previousKeys.length,
      source: safeString(options.source || "runtime_state_store", 120),
    });
    return get();
  }

  function update(updater, options = {}) {
    if (typeof updater !== "function") return get();
    return set(updater(get()) || {}, options);
  }

  return Object.freeze({ get, set, update, replace, snapshot });
}

export {
  RUNTIME_STATE_EVENT_BUS_VERSION,
  createRuntimeEventBus as createEventBus,
  createRuntimeStateStore as createStateStore,
};
