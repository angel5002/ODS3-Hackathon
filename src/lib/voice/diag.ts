// Voice diagnostics (E5, hito 1). Every state change of a voice session is logged in the browser console
// and sent to the server log with a short random session id. No personal data, no transcripts, no keys:
// only event names, call ids, statuses, reasons and HTTP/close codes.
export type DiagData = Record<string, string | number | boolean | null | undefined>;

export function newDiagId() {
  const r = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(16).slice(2);
  return r.replace(/-/g, "").slice(0, 8);
}

export function voiceDiag(sid: string, event: string, data: DiagData = {}) {
  if (typeof window === "undefined") return;
  const t = Math.round(performance.now());
  console.info(`[voz ${sid}] ${event}`, data);
  try {
    const body = JSON.stringify({ sid, event, data, t, path: window.location.pathname.replace(/\/t\/[^/]+/, "/t/…") });
    const sent = navigator.sendBeacon?.("/api/voice/diag", new Blob([body], { type: "application/json" }));
    if (!sent) void fetch("/api/voice/diag", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
  } catch {
    // diagnostics never break a call
  }
}
