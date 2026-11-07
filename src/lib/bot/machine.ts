// Registration bot of the web chat (RF-14, docs/conversaciones.md §1-§2). A state machine on the server
// controls every step; the model only interprets the answer to the current step (src/lib/bot/interpret.ts).
// The script and the transitions are pure (src/lib/bot/script.ts, unit-tested); this file runs their effects
// against the database: register the request, refer to emergency, tasks for a person.
import { rpc, serverDb } from "@/lib/supabase/server";
import { scrubReason } from "@/lib/scrub";
import { dateEs } from "@/lib/labels";
import { HOSPITAL_NAME } from "@/lib/voice/hospital";
import { hasAlarmWords, interpret } from "./interpret";
import { PERSON_LABEL, PERSON_REPLY, ask, closingAlarm, closingRegistered, next, question, STEPS, type BotState, type Reply } from "./script";

export type { BotState, Reply } from "./script";
export { BOT_SPECIALTIES, QUICK_ACTIONS, isPersonRequest } from "./script";

export const CONSENT =
  `Hola. Le escribe el asistente automatizado del ${HOSPITAL_NAME}, un hospital ficticio de AsistIA para CientíficaHack 2026. ` +
  "Este chat prepara su atención: no es una consulta médica ni atiende emergencias. " +
  "Nunca le pediremos pagos, claves, códigos ni su DNI completo, ni tampoco su número o su correo. " +
  `Use un nombre ficticio y no comparta datos reales de salud. Puede hablar con una persona en cualquier momento con el botón «${PERSON_LABEL}». ` +
  "Esta conversación se borrará al terminar la demostración.\nResponda ACEPTO para continuar o SALIR para terminar.";

const MENU: Reply = {
  body: "Gracias. ¿Qué desea hacer?\n1. Pedir una cita nueva\n2. Ver el estado de mi solicitud\n3. Hablar con una persona",
  buttons: ["1. Pedir una cita nueva", "2. Ver el estado de mi solicitud", "3. Hablar con una persona"],
};

export function initialState(): BotState {
  return { step: "consent", data: {} };
}

type Ctx = { sessionId: string; linkedRequestId: number | null };

/** "Hablar con una persona" (button, PERSONA or menu option 3): a task for the team, one closing. */
export async function personRequest(ctx: Ctx, note: string): Promise<Reply> {
  await rpc("create_task", { p_type: "pide_persona", p_request: ctx.linkedRequestId, p_appt: null, p_source: "chat", p_note: note, p_session: ctx.sessionId });
  return PERSON_REPLY;
}

/** Advances the bot one message. Returns the replies to post (fixed texts from docs/conversaciones.md). */
export async function botStep(state: BotState, text: string, ctx: Ctx): Promise<{ state: BotState; replies: Reply[]; meta?: Record<string, unknown> }> {
  const t = text.trim();
  if (state.step === "consent" || state.step === "menu" || state.step === "done") {
    // the menu
    const choice = /^1|cita nueva|pedir/i.test(t) ? "1" : /^2|estado|solicitud/i.test(t) ? "2" : /^3|persona/i.test(t) ? "3" : null;
    if (choice === "1") return { state: { step: "para_quien", data: {} }, replies: [ask("para_quien", {})] };
    if (choice === "2") return { state: { ...state, step: "menu" }, replies: [await statusReply(ctx), MENU] };
    if (choice === "3") return { state: { ...state, step: "menu" }, replies: [await personRequest(ctx, "Pidió hablar con una persona desde el chat")] };
    return { state: { ...state, step: "menu" }, replies: [MENU] };
  }

  const s = STEPS[state.step];
  if (!s) return { state: { step: "menu", data: {} }, replies: [MENU] };
  const res = await interpret(question(state.step, state.data) || "¿Está correcto el resumen?", t, s.kind, s.options ?? []);
  const meta = { interpreted_by: res.by, model_ms: res.ms };
  // the free reason is scrubbed (names, numbers, links) before it is stored anywhere
  const value = res.value != null && state.step === "motivo" ? scrubReason(res.value, state.data.nombre) : res.value;
  const r = next(state, value, hasAlarmWords);

  if (r.effect?.type === "register") {
    const req = await createRequest(r.state.data, ctx, null);
    return { state: { step: "done", data: {} }, replies: [closingRegistered(req.code, r.state.data)], meta: { ...meta, code: req.code } };
  }
  if (r.effect?.type === "refer") {
    const said = scrubReason(r.effect.said, r.state.data.nombre);
    const req = await createRequest(r.state.data, ctx, said);
    // derive_emergency already delivered the emergency instruction to this chat: the closing only says what
    // happens next and offers a person now (one message each, never the instruction twice)
    return { state: { step: "done", data: {} }, replies: [closingAlarm(req.code)], meta: { ...meta, code: req.code, alarm: true } };
  }
  return { state: r.state, replies: r.replies, meta };
}

/** Creates the request; with `alarmSaid` it is referred to emergency and the staff task says what the person said. */
async function createRequest(data: Record<string, string>, ctx: Ctx, alarmSaid: string | null) {
  const r = await rpc<{ id: number; code: string }>("create_request", {
    p: {
      display_name: data.nombre || "Paciente sin nombre",
      doc_type: data.documento ?? "sin_documento",
      age: Number(data.edad ?? 0),
      specialty: data.especialidad ?? "Por definir",
      referral: data.referencia === "si",
      reason_text: data.motivo ?? null,
      pregnant: data.preferente === "embarazo",
      disability: data.preferente === "discapacidad",
      preferred_channel: data.canal === "llamada" ? "llamada" : "chat",
      short_notice_ok: data.poco_aviso === "si",
      source: "chat",
      chat_session_id: ctx.sessionId,
      actor: "Bot del chat",
    },
  });
  if (alarmSaid !== null) {
    await rpc("derive_emergency", { p_request: r.id, p_actor: "Bot del chat", p_source: "chat" });
    // the task derive_emergency created gets what the person said, so the team knows what is happening
    await serverDb()
      .from("staff_tasks")
      .update({ note: `Signos de alarma. La persona dijo: «${alarmSaid}». Confirmar que acudió a emergencia.`.slice(0, 300) })
      .eq("request_id", r.id)
      .eq("type", "alarma");
  }
  return r;
}

const STATE_TEXT: Record<string, string> = {
  registrada: "en revisión",
  pendiente_regulacion: "en revisión",
  pendiente_informacion: "en revisión: un profesional pidió un dato más",
  priorizada_sin_cupo: "en lista de espera",
  en_espera_prioritaria: "en lista de espera, primera para el próximo cupo de su zona",
  con_oferta: "con una oferta abierta",
  asignada_por_validar: "con un cupo asignado que falta confirmar",
  derivada_emergencia: "derivada a emergencia",
  cerrada_con_causal: "cerrada",
};

async function statusReply(ctx: Ctx): Promise<Reply> {
  if (!ctx.linkedRequestId) return { body: "Todavía no tiene una solicitud registrada en esta conversación. Elija 1 para pedir una cita." };
  const { data: r } = await serverDb().from("requests").select("code,state,current_appointment_id").eq("id", ctx.linkedRequestId).single();
  if (!r) return { body: "No encontramos su solicitud." };
  if (r.state === "con_cita" && r.current_appointment_id) {
    const { data: a } = await serverDb().from("appointments").select("specialty,date,time").eq("id", r.current_appointment_id).single();
    if (a) return { body: `Su solicitud ${r.code} está con cita el ${dateEs(a.date)} a las ${a.time.replace(/^0/, "")} (${a.specialty}).` };
  }
  // never the position in the list nor the index
  return { body: `Su solicitud ${r.code} está ${STATE_TEXT[r.state] ?? "en revisión"}.` };
}

export { MENU };
