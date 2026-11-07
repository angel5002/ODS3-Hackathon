// Voice sessions on the server (E5, hito 2). One live session per call, claimed atomically in Postgres
// (voice_claim), kept alive by a heartbeat every 10 s and expired after 30 s without one. Every decision is
// written to voice_events (no personal data).
import { rpc, serverDb } from "@/lib/supabase/server";
import { isCardToken, noisyRoomOn } from "./capacity";
import type { CallRow } from "./tools";

export const HEARTBEAT_MS = 10_000;

/** Simultaneous voice sessions allowed (default 8: the Creator plan allows 10, 2 are kept for test calls). */
export function maxConcurrent() {
  const n = Number(process.env.VOICE_MAX_CONCURRENT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 8;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Claim =
  | { ok: true; session_id: string }
  | { ok: false; reason: "en_otro_dispositivo" }
  | { ok: false; reason: "terminada" }
  | { ok: false; reason: "ocupado"; queue_id: string; position: number; active: number; max: number };

export function claimSession(callId: number, ownerKind: "telefono" | "chat", queueId: string | null, max = maxConcurrent()) {
  return rpc<Claim>("voice_claim", { p_call: callId, p_owner_kind: ownerKind, p_max: max, p_queue: queueId });
}

// ---------------------------------------------------------------- final day: jury cards and noisy room

/** Is this call for a printed jury card? Its patient's token starts with "j-", directly or through the chat
 *  session linked to that patient. */
export async function isCardCall(call: Pick<CallRow, "patient_id" | "chat_session_id">) {
  const db = serverDb();
  let patient = call.patient_id;
  if (!patient && call.chat_session_id) {
    const { data } = await db.from("chat_sessions").select("linked_patient_id").eq("id", call.chat_session_id).maybeSingle();
    patient = (data?.linked_patient_id as string | null) ?? null;
  }
  if (!patient) return false;
  const { data } = await db.from("patients").select("token").eq("id", patient).maybeSingle();
  return isCardToken((data?.token as string | null) ?? null);
}

/** Voice sessions holding a line now (the same states voice_claim counts). */
export async function liveSessionCount(exceptCall?: number) {
  let q = serverDb().from("voice_sessions").select("id", { count: "exact", head: true }).in("state", ["solicitando", "conectando", "activa"]);
  if (exceptCall !== undefined) q = q.neq("call_id", exceptCall);
  const { count } = await q;
  return count ?? 0;
}

/** Noisy-room mode (settings_v51 'sala_ruidosa'): push-to-talk on the phones. ON when the key is missing. */
export async function noisyRoom() {
  const { data, error } = await serverDb().from("settings_v51").select("value").eq("key", "sala_ruidosa").maybeSingle();
  return noisyRoomOn(error ? null : ((data?.value as string | null) ?? null));
}

export async function setNoisyRoom(on: boolean) {
  const { error } = await serverDb()
    .from("settings_v51")
    .upsert({ key: "sala_ruidosa", value: on ? "on" : "off", updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  return on;
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
