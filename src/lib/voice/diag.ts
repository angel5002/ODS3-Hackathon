// Voice diagnostics (E5). Every state change of a voice session is logged in the browser console with a short
// id and, once the server granted a voice session, stored in voice_events through /api/voice/event (rate
// limited in Postgres). No personal data, no transcripts, no keys: event names, call ids, states, reasons and
// HTTP/close codes only.
export type DiagData = Record<string, string | number | boolean | null | undefined>;

const bound = new Map<string, { sessionId: string; callId: number | null }>();

export function newDiagId() {
  const r = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(16).slice(2);
  return r.replace(/-/g, "").slice(0, 8);
}

/** From now on, the events of this diagnostics id are also stored on the server for that voice session. */
export function bindDiag(sid: string, sessionId: string, callId: number | null) {
  bound.set(sid, { sessionId, callId });
}

export function voiceDiag(sid: string, event: string, data: DiagData = {}) {
  if (typeof window === "undefined") return;
  console.info(`[voz ${sid}] ${event}`, data);
  const b = bound.get(sid);
  if (!b) return;
  try {
    const body = JSON.stringify({ voiceSessionId: b.sessionId, callId: b.callId, event, data });
    const sent = navigator.sendBeacon?.("/api/voice/event", new Blob([body], { type: "application/json" }));
    if (!sent) void fetch("/api/voice/event", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
  } catch {
    // diagnostics never break a call
  }
}
