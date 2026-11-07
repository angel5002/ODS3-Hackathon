// Client state machine of ONE voice call (E5, hito 2). Pure and framework-free, so it is unit-tested with
// `node --test` (tests/voice-machine.test.ts) and used through React's useReducer.
//
//   idle → solicitando → conectando → activa → finalizando → finalizada
//                 ↘ ocupado (otro dispositivo | capacidad)      ↘ error
//
// Every event that does not apply to the current state is ignored: starting twice, a late SDK callback from
// an older session or a double tap never opens a second session.

export type BusyKind = "otro_dispositivo" | "capacidad";

export type VoiceState =
  | { name: "idle" }
  | { name: "solicitando"; attempt: number }
  | { name: "conectando"; sessionId: string }
  | { name: "activa"; sessionId: string; since: number }
  | { name: "finalizando"; sessionId: string | null }
  | { name: "finalizada"; reason: string }
  | { name: "ocupado"; kind: BusyKind; position: number | null; queueId: string | null }
  | { name: "error"; message: string };

export type VoiceEvent =
  | { type: "START" }
  | { type: "SESSION_GRANTED"; sessionId: string }
  | { type: "SESSION_BUSY"; kind: BusyKind; position?: number | null; queueId?: string | null }
  | { type: "SESSION_FAILED"; message: string }
  | { type: "SDK_CONNECTED"; sessionId: string; at: number }
  | { type: "SDK_DISCONNECTED"; sessionId: string; reason: string }
  | { type: "SDK_ERROR"; sessionId: string; message: string }
  | { type: "HANGUP" }
  | { type: "REMOTE_END"; reason: string }
  | { type: "ENDED"; reason: string };

export const initialVoiceState: VoiceState = { name: "idle" };

const LIVE = new Set(["solicitando", "conectando", "activa"]);

/** True while a session is being requested or is open: the start button must stay locked. */
export function isBusy(s: VoiceState) {
  return LIVE.has(s.name) || s.name === "finalizando";
}

function sessionOf(s: VoiceState): string | null {
  return s.name === "conectando" || s.name === "activa" ? s.sessionId : s.name === "finalizando" ? s.sessionId : null;
}

export function voiceReducer(s: VoiceState, e: VoiceEvent): VoiceState {
  switch (e.type) {
    case "START":
      // idempotent: only from a resting state; waiting in the queue may retry
      if (s.name === "idle" || s.name === "finalizada" || s.name === "error") return { name: "solicitando", attempt: 1 };
      if (s.name === "ocupado") return { name: "solicitando", attempt: 1 };
      return s;
    case "SESSION_GRANTED":
      return s.name === "solicitando" ? { name: "conectando", sessionId: e.sessionId } : s;
    case "SESSION_BUSY":
      return s.name === "solicitando" ? { name: "ocupado", kind: e.kind, position: e.position ?? null, queueId: e.queueId ?? null } : s;
    case "SESSION_FAILED":
      return s.name === "solicitando" ? { name: "error", message: e.message } : s;
    case "SDK_CONNECTED":
      return s.name === "conectando" && s.sessionId === e.sessionId ? { name: "activa", sessionId: e.sessionId, since: e.at } : s;
    case "SDK_ERROR":
      return (s.name === "conectando" || s.name === "activa") && s.sessionId === e.sessionId ? { name: "error", message: e.message } : s;
    case "SDK_DISCONNECTED":
      if (sessionOf(s) !== e.sessionId) return s; // a late callback of an older session
      return s.name === "conectando" || s.name === "activa" || s.name === "finalizando" ? { name: "finalizada", reason: e.reason } : s;
    case "HANGUP":
      if (s.name === "ocupado" || s.name === "solicitando") return { name: "finalizada", reason: "La persona colgó" };
      if (s.name === "conectando" || s.name === "activa") return { name: "finalizando", sessionId: s.sessionId };
      return s;
    case "REMOTE_END":
      return LIVE.has(s.name) || s.name === "ocupado" ? { name: "finalizada", reason: e.reason } : s;
    case "ENDED":
      return s.name === "finalizando" ? { name: "finalizada", reason: e.reason } : s;
    default:
      return s;
  }
}

/** Text shown for each state (hito 3 restyles it; the words stay). */
export function voiceStateText(s: VoiceState, speaking = false): string {
  switch (s.name) {
    case "idle":
      return "Lista para llamar";
    case "solicitando":
    case "conectando":
      return "Conectando…";
    case "activa":
      return speaking ? "El asistente está hablando" : "Te escucho";
    case "finalizando":
      return "Terminando la llamada…";
    case "finalizada":
      return "Llamada finalizada";
    case "ocupado":
      return s.kind === "otro_dispositivo"
        ? "Esta llamada ya se está atendiendo en otro dispositivo"
        : `Todas las líneas están ocupadas${s.position ? `. Su lugar en la fila: ${s.position}` : ""}`;
    case "error":
      return "No se pudo conectar la llamada";
  }
}
