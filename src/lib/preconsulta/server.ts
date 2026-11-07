// Server side of the pre-visit: sessions (the token in the link is the patient's capability), one step of the
// machine per answer applied atomically (preconsulta_apply: optimistic version, conversation turns, staff task),
// and the staff reads for the doctor. Server-only: uses the service role.
import { randomBytes } from "node:crypto";
import { rpc, serverDb } from "@/lib/supabase/server";
import { scrubReason } from "@/lib/scrub";
import { ALARM_WORDS, interpret } from "@/lib/bot/interpret";
import { arrivalWindow } from "./arrival";
import {
  buildSummary,
  currentQuestion,
  initialState,
  isYesNoStep,
  step,
  yesNo,
  type Gender,
  type PcState,
  type PreconsultaDetail,
  type Turn,
} from "./machine";

export const TOKEN = /^[a-f0-9]{32}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** What the first screen says before any question (proposal v5.1 §3.1: consent and what this channel is not). */
export const INTRO =
  "Le escribe el asistente automatizado de la clínica, en una demostración de AsistIA. Antes de su cita puede responder tres preguntas cortas " +
  "para preparar la consulta. No es una consulta médica ni atiende emergencias: si se siente muy mal, acuda a emergencia o llame al 106. " +
  "Use un nombre ficticio y no comparta datos reales de salud. Puede no responder: su cita no cambia.";

type Row = {
  id: string;
  token: string;
  patient_alias: string;
  specialty: string | null;
  appointment_time: string | null;
  status: "pendiente" | "en_curso" | "completa" | "derivada_emergencia" | "con_persona";
  respondent: "paciente" | "acompanante" | null;
  channel: "chat" | "voz";
  source: string;
  consent_at: string | null;
  state: { pc?: PcState };
  summary: PreconsultaDetail | Record<string, never>;
  version: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

const COLS = "id,token,patient_alias,specialty,appointment_time,status,respondent,channel,source,consent_at,state,summary,version,created_at,updated_at,expires_at";

export function windowFor(row: Pick<Row, "appointment_time">) {
  return arrivalWindow({ appointment: row.appointment_time ?? "10:15" });
}

function meta(row: Row) {
  return { sessionId: row.id, channel: row.channel, respondent: row.respondent, startedAt: row.consent_at, window: windowFor(row) };
}

export function cleanAlias(alias: unknown) {
  const a = String(alias ?? "")
    .replace(/[^\p{L}\s'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30);
  return a || "Paciente";
}

export async function createPreconsulta(input: {
  alias: unknown;
  time?: unknown;
  specialty?: unknown;
  gender?: unknown;
  source: "personal" | "paciente" | "escena";
}) {
  await rpc("preconsulta_purge").catch(() => {});
  const alias = cleanAlias(input.alias);
  const time = /^\d{2}:\d{2}$/.test(String(input.time ?? "")) ? String(input.time) : "10:15";
  const gender: Gender = input.gender === "m" || input.gender === "f" ? input.gender : null;
  const pc = initialState(alias, gender);
  const token = randomBytes(16).toString("hex");
  const { data, error } = await serverDb()
    .from("preconsulta_sessions")
    .insert({
      token,
      patient_alias: alias,
      specialty: input.specialty ? String(input.specialty).slice(0, 60) : null,
      appointment_time: time,
      source: input.source,
      state: { pc },
      summary: {},
    })
    .select("id,token")
    .single();
  if (error || !data) throw new Error(error?.message ?? "preconsulta");
  const row = await loadById(data.id);
  if (row) await serverDb().from("preconsulta_sessions").update({ summary: buildSummary(pc, meta(row)) }).eq("id", row.id);
  return { id: data.id as string, token: data.token as string, path: `/preconsulta/${data.token}` };
}

/** Patient creations in the last minute (a QR in the auditorium must not flood the table). */
export async function recentPatientCreations() {
  const { count } = await serverDb()
    .from("preconsulta_sessions")
    .select("id", { count: "exact", head: true })
    .eq("source", "paciente")
    .gt("created_at", new Date(Date.now() - 60_000).toISOString());
  return count ?? 0;
}

export async function loadByToken(token: string) {
  if (!TOKEN.test(token)) return null;
  const { data } = await serverDb().from("preconsulta_sessions").select(COLS).eq("token", token).gt("expires_at", new Date().toISOString()).maybeSingle();
  return (data as Row | null) ?? null;
}

export async function loadById(id: string) {
  if (!UUID.test(id)) return null;
  const { data } = await serverDb().from("preconsulta_sessions").select(COLS).eq("id", id).gt("expires_at", new Date().toISOString()).maybeSingle();
  return (data as Row | null) ?? null;
}

async function transcript(id: string) {
  const { data } = await serverDb().from("preconsulta_answers").select("id,step,who,text,at").eq("session_id", id).order("id").limit(200);
  return (data ?? []) as { id: number; step: string; who: "ia" | "persona"; text: string; at: string }[];
}

/** What the patient's page shows: the conversation and whether it can still answer. Never the summary internals. */
export async function patientView(row: Row) {
  const pc = row.state.pc ?? initialState(row.patient_alias);
  const done = row.status === "completa" || row.status === "derivada_emergencia" || row.status === "con_persona";
  return {
    alias: row.patient_alias,
    status: row.status,
    consent: Boolean(row.consent_at),
    intro: INTRO,
    messages: row.consent_at ? (await transcript(row.id)).map((m) => ({ id: m.id, who: m.who, text: m.text })) : [],
    version: row.version,
    done,
    emergency: row.status === "derivada_emergencia",
    /** quick answers for the current question */
    buttons: done ? [] : isYesNoStep(pc) || pc.step === "alarma" ? ["Sí", "No"] : [],
  };
}

/** The doctor's corrections stay on top of what the machine rebuilds (latest edit of each field wins). */
async function withEdits(id: string, summary: PreconsultaDetail) {
  const { data } = await serverDb().from("preconsulta_edits").select("field,after").eq("session_id", id).order("id");
  const out = { ...summary } as Record<string, unknown>;
  for (const e of data ?? []) if (["motivo", "inicio", "alergias"].includes(e.field)) out[e.field] = e.after;
  return out as PreconsultaDetail;
}

async function apply(row: Row, pc: PcState, status: Row["status"], turns: Turn[], task: { type: string; note: string } | null) {
  const res = await rpc<{ ok: boolean; version: number }>("preconsulta_apply", {
    p_session: row.id,
    p_version: row.version,
    p_state: { pc },
    p_summary: await withEdits(row.id, buildSummary(pc, meta(row))),
    p_status: status,
    p_turns: turns,
    p_task_type: task?.type ?? null,
    p_task_note: task?.note ?? null,
  });
  return res;
}

export async function giveConsent(row: Row, respondent: unknown) {
  if (row.consent_at) return { ok: true };
  const who = respondent === "acompanante" ? "acompanante" : "paciente";
  const { error } = await serverDb()
    .from("preconsulta_sessions")
    .update({ consent_at: new Date().toISOString(), respondent: who, status: "en_curso" })
    .eq("id", row.id)
    .is("consent_at", null);
  if (error) throw new Error(error.message);
  const fresh = (await loadById(row.id))!;
  const pc = fresh.state.pc ?? initialState(fresh.patient_alias);
  await apply(fresh, pc, "en_curso", [{ step: pc.step, who: "ia", text: currentQuestion(pc)! }], null);
  return { ok: true };
}

/** One answer of the patient. The rules read it; the model only reads a yes/no the rules did not understand. */
export async function answer(row: Row, text: string, version: number) {
  if (!row.consent_at) throw new Error("consent required");
  if (row.status !== "en_curso") return { ok: false, reason: "terminada" as const };
  if (version !== row.version) return { ok: false, reason: "version" as const };
  const pc = row.state.pc ?? initialState(row.patient_alias);
  // e-mails, links and long numbers never reach the summary (the bot's own scrubber)
  const clean = scrubReason(text.slice(0, 500));
  let interpreted: "si" | "no" | null = null;
  let by: "reglas" | "modelo" = "reglas";
  if (isYesNoStep(pc) && yesNo(clean) == null) {
    const r = await interpret(currentQuestion(pc) ?? "", clean, "yesno");
    if (r.value === "si" || r.value === "no") {
      interpreted = r.value;
      by = r.by === "model" ? "modelo" : "reglas";
    }
  }
  const r = step(pc, clean, { window: windowFor(row), extraAlarmWords: ALARM_WORDS, interpreted });
  if (r.turns[0]) r.turns[0].by = by;
  const res = await apply(row, r.state, r.status, r.turns, r.task);
  if (!res.ok) return { ok: false, reason: "version" as const };
  return { ok: true };
}

// ---------------------------------------------------------------- staff (the doctor's view)

export async function staffList() {
  const { data } = await serverDb()
    .from("preconsulta_sessions")
    .select("id,patient_alias,status,appointment_time,source,consent_at,created_at,updated_at,token")
    .gt("expires_at", new Date().toISOString())
    .order("updated_at", { ascending: false })
    .limit(30);
  return (data ?? []).map(({ token, ...r }) => ({ ...r, path: `/preconsulta/${token}` }));
}

export async function staffDetail(id: string) {
  const row = await loadById(id);
  if (!row) return null;
  const [{ data: edits }, msgs] = await Promise.all([
    serverDb().from("preconsulta_edits").select("field,before,after,actor,at").eq("session_id", id).order("id"),
    transcript(id),
  ]);
  const summary = (row.summary && "sessionId" in row.summary ? row.summary : buildSummary(row.state.pc ?? initialState(row.patient_alias), meta(row))) as PreconsultaDetail;
  return { id: row.id, status: row.status, version: row.version, summary, edits: edits ?? [], transcript: msgs, path: `/preconsulta/${row.token}` };
}

/** A correction by the doctor: changes the summary (not the patient's words) and records before/after. */
export async function staffEdit(id: string, field: unknown, value: unknown, actor = "Médico") {
  const row = await loadById(id);
  if (!row) throw new Error("preconsulta not found");
  const f = String(field);
  if (!["motivo", "inicio", "alergias"].includes(f)) throw new Error("invalid field");
  const v = String(value ?? "").trim().slice(0, 200);
  if (!v) throw new Error("value required");
  const summary = { ...((row.summary && "sessionId" in row.summary ? row.summary : buildSummary(row.state.pc ?? initialState(row.patient_alias), meta(row))) as PreconsultaDetail) };
  const before = (summary as Record<string, unknown>)[f] ?? null;
  (summary as Record<string, unknown>)[f] = v;
  if (f === "motivo") summary.motivoEstado = "informado";
  if (f === "inicio") summary.inicioEstado = "informado";
  if (f === "alergias") summary.alergiasEstado = "informado";
  summary.actualizado = new Date().toISOString();
  await rpc("preconsulta_edit", { p_session: id, p_field: f, p_before: before, p_after: v, p_summary: summary, p_actor: actor });
}
