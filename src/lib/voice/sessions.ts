// Voice sessions on the server (E5, hito 2). One live session per call, claimed atomically in Postgres
// (voice_claim), kept alive by a heartbeat every 10 s and expired after 30 s without one. Every decision is
// written to voice_events (no personal data).
import { rpc } from "@/lib/supabase/server";
import type { CallRow } from "./tools";

export const HEARTBEAT_MS = 10_000;

/** Simultaneous voice sessions allowed (default: the 10 of the ElevenLabs Creator plan). */
export function maxConcurrent() {
  const n = Number(process.env.VOICE_MAX_CONCURRENT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Claim =
  | { ok: true; session_id: string }
  | { ok: false; reason: "en_otro_dispositivo" }
  | { ok: false; reason: "terminada" }
  | { ok: false; reason: "ocupado"; queue_id: string; position: number; active: number; max: number };

export function claimSession(callId: number, ownerKind: "telefono" | "chat", queueId: string | null) {
  return rpc<Claim>("voice_claim", { p_call: callId, p_owner_kind: ownerKind, p_max: maxConcurrent(), p_queue: queueId });
}

export function updateSession(sessionId: string, state: string | null, extra: { conversation?: string | null; reason?: string | null; agent?: string | null } = {}) {
  return rpc<{ alive: boolean; state: string; call_status?: string; accepted?: boolean }>("voice_update", {
    p_session: sessionId,
    p_state: state,
    p_conversation: extra.conversation ?? null,
    p_reason: extra.reason ?? null,
    p_agent: extra.agent ?? null,
  });
}

export function endSession(sessionId: string, reason: string, closeCall: boolean, result?: string) {
  return rpc<{ ended: boolean; call_id?: number; state?: string }>("voice_end", {
    p_session: sessionId,
    p_reason: reason.slice(0, 160),
    p_close_call: closeCall,
    p_result: result?.slice(0, 200) ?? null,
  });
}

export function logEvent(sessionId: string | null, callId: number | null, source: "cliente" | "servidor" | "elevenlabs", kind: string, detail: Record<string, unknown> = {}) {
  return rpc<boolean>("voice_log", { p_session: sessionId, p_call: callId, p_source: source, p_kind: kind.slice(0, 40), p_detail: detail }).catch(() => false);
}

// ---------------------------------------------------------------- dynamic variables

/** Every variable the agents' prompts use. ElevenLabs needs all of them; an empty one makes the agent say
 *  things like "¿Hablo con o con su cuidador?". */
const ALL_VARS = ["call_id", "token", "patient_name", "role", "specialty", "slot_text", "deadline_text"] as const;

/** Variables each task really needs; if one is missing the server says so in voice_events. */
const REQUIRED: Record<CallRow["purpose"], string[]> = {
  confirmacion: ["patient_name", "specialty", "slot_text"],
  oferta: ["patient_name", "specialty", "slot_text", "deadline_text"],
  validacion: ["patient_name", "specialty", "slot_text"],
  registro: [],
  prueba: ["patient_name"],
};

/** Neutral phrases that read well inside the prompts when a value is missing. */
const NEUTRAL: Record<string, string> = {
  patient_name: "el paciente",
  role: "paciente",
  specialty: "su especialidad",
  slot_text: "en la fecha indicada en su mensaje",
  deadline_text: "el plazo indicado en su mensaje",
};

export function completeVariables(purpose: CallRow["purpose"], vars: Record<string, string>) {
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const k of ALL_VARS) {
    const v = (vars[k] ?? "").trim();
    if (v) out[k] = v;
    else {
      out[k] = NEUTRAL[k] ?? "";
      if (REQUIRED[purpose]?.includes(k)) missing.push(k);
    }
  }
  return { vars: out, missing };
}
