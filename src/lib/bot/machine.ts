// Registration bot of the web chat (RF-14, docs/conversaciones.md §1-§2). A state machine on the server
// controls every step; the model only interprets the answer to the current step (src/lib/bot/interpret.ts).
import { rpc, serverDb } from "@/lib/supabase/server";
import { scrubReason } from "@/lib/scrub";
import { dateEs } from "@/lib/labels";
import { hasAlarmWords, interpret, type Kind } from "./interpret";
import { HOSPITAL_NAME } from "@/lib/voice/hospital";

export type Reply = { body: string; buttons?: string[] };
export type BotState = { step: string; data: Record<string, string>; rechecked?: boolean; tries?: number };

export const CONSENT =
  `Hola. Le escribe el asistente automatizado del ${HOSPITAL_NAME}, un hospital ficticio de AsistIA para CientíficaHack 2026. ` +
  "Este chat prepara su atención: no es una consulta médica ni atiende emergencias. " +
  "Nunca le pediremos pagos, claves, códigos ni su DNI completo, ni tampoco su número o su correo. " +
  "Use un nombre ficticio y no comparta datos reales de salud. Escriba PERSONA en cualquier momento para hablar con una persona. " +
  "Esta conversación se borrará al terminar la demostración.\nResponda ACEPTO para continuar o SALIR para terminar.";

const MENU: Reply = {
  body: "Gracias. ¿Qué desea hacer?\n1. Pedir una cita nueva\n2. Ver el estado de mi solicitud\n3. Hablar con una persona",
  buttons: ["1. Pedir una cita nueva", "2. Ver el estado de mi solicitud", "3. Hablar con una persona"],
};

// The 8 specialties offered first (highest demand on the demo day plus the two with free slots for the jury)
export const BOT_SPECIALTIES = [
  "Medicina Interna",
  "Cardiología",
  "Pediatría General",
  "Ginecología",
  "Traumatología",
  "Oftalmología",
  "Dermatología",
  "Gastroenterología",
];

const ALARM_LIST =
  "¿El paciente tiene AHORA alguno de estos signos? Responda SÍ o NO:\n" +
  "· dolor fuerte en el pecho\n· dificultad para respirar\n· desmayo\n" +
  "· debilidad repentina de un lado del cuerpo o dificultad para hablar\n· sangrado abundante\n" +
  "· fiebre en un bebé de menos de 3 meses\n· en el embarazo: sangrado o dolor fuerte";

type Step = { q: string; kind: Kind; options?: [string, string][]; buttons?: string[] };
const STEPS: Record<string, Step> = {
  para_quien: {
    q: "¿La cita es para usted o para otra persona (por ejemplo, su hijo o su madre)?",
    kind: "choice",
    options: [
      ["paciente", "Para mí"],
      ["cuidador", "Para otra persona"],
    ],
  },
  nombre: { q: "¿Cuál es el nombre del paciente? Puede ser un nombre ficticio.", kind: "text" },
  documento: {
    q: "¿Qué documento tiene el paciente?\n1. DNI\n2. Carné de extranjería\n3. Otro\n4. No tiene documento\n(No necesitamos el número.)",
    kind: "choice",
    options: [
      ["dni", "DNI"],
      ["ce", "Carné de extranjería"],
      ["otro", "Otro"],
      ["sin_documento", "No tiene documento"],
    ],
  },
  edad: { q: "¿Qué edad tiene el paciente?", kind: "age" },
  especialidad: {
    q: `¿Qué especialidad necesita?\n${BOT_SPECIALTIES.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n9. No sé / me lo indicó un médico`,
    kind: "choice",
    options: [...BOT_SPECIALTIES.map((s) => [s, s] as [string, string]), ["Por definir", "No sé / me lo indicó un médico"]],
  },
  referencia: {
    q: "¿Tiene una hoja de referencia de un centro de salud?\n1. Sí\n2. No",
    kind: "choice",
    options: [
      ["si", "Sí"],
      ["no", "No"],
    ],
  },
  motivo: { q: "En una o dos frases, ¿por qué necesita la consulta? (Recuerde: es una demostración, no use datos reales)", kind: "text" },
  alarma: { q: ALARM_LIST, kind: "yesno", buttons: ["SÍ", "NO"] },
  canal: {
    q: "¿Cómo prefiere que le avisemos?\n1. Por este chat\n2. Con una llamada",
    kind: "choice",
    options: [
      ["chat", "Por este chat"],
      ["llamada", "Con una llamada"],
    ],
  },
  poco_aviso: {
    q: "Si se libera un cupo con 2 días de anticipación, ¿podría asistir?\n1. Sí\n2. No",
    kind: "choice",
    options: [
      ["si", "Sí"],
      ["no", "No"],
    ],
  },
  preferente: {
    q: "¿El paciente está embarazada o tiene alguna discapacidad?\n1. Embarazo\n2. Discapacidad\n3. Ninguna\n4. Prefiero no decir",
    kind: "choice",
    options: [
      ["embarazo", "Embarazo"],
      ["discapacidad", "Discapacidad"],
      ["ninguna", "Ninguna"],
      ["no_dice", "Prefiero no decir"],
    ],
  },
  resumen: {
    q: "",
    kind: "choice",
    options: [
      ["si", "Sí"],
      ["corregir", "Corregir"],
    ],
  },
};
const ORDER = ["para_quien", "nombre", "documento", "edad", "especialidad", "referencia", "motivo", "alarma", "canal", "poco_aviso", "preferente", "resumen"];

function ask(step: string, data: Record<string, string>): Reply {
  const s = STEPS[step];
  if (step === "resumen") {
    const body =
      `Resumen: ${data.especialidad} · paciente de ${data.edad} ${data.edad === "1" ? "año" : "años"} · ` +
      `${data.referencia === "si" ? "con referencia" : "sin referencia"} · aviso por ${data.canal === "llamada" ? "llamada" : "chat"}. ¿Está correcto?\n1. Sí\n2. Corregir`;
    return { body, buttons: ["1. Sí", "2. Corregir"] };
  }
  return { body: s.q, buttons: s.buttons ?? s.options?.map(([, l], i) => `${i + 1}. ${l}`) };
}

export function initialState(): BotState {
  return { step: "consent", data: {} };
}

type Ctx = { sessionId: string; linkedRequestId: number | null };

/** Advances the bot one message. Returns the replies to post (fixed texts from docs/conversaciones.md). */
export async function botStep(state: BotState, text: string, ctx: Ctx): Promise<{ state: BotState; replies: Reply[]; meta?: Record<string, unknown> }> {
  const t = text.trim();
  if (state.step === "consent" || state.step === "menu" || state.step === "done") {
    // the menu
    const choice = /^1|cita nueva|pedir/i.test(t) ? "1" : /^2|estado|solicitud/i.test(t) ? "2" : /^3|persona/i.test(t) ? "3" : null;
    if (choice === "1") return { state: { step: "para_quien", data: {} }, replies: [ask("para_quien", {})] };
    if (choice === "2") return { state: { ...state, step: "menu" }, replies: [await statusReply(ctx), MENU] };
    if (choice === "3") {
      await rpc("create_task", { p_type: "pide_persona", p_request: ctx.linkedRequestId, p_appt: null, p_source: "chat", p_note: "Pidió hablar con una persona desde el chat", p_session: ctx.sessionId });
      return { state: { ...state, step: "menu" }, replies: [{ body: "Una persona del equipo de citas le escribirá pronto." }] };
    }
    return { state: { ...state, step: "menu" }, replies: [MENU] };
  }

  const s = STEPS[state.step];
  if (!s) return { state: { step: "menu", data: {} }, replies: [MENU] };
  const res = await interpret(s.q || "¿Está correcto el resumen?", t, s.kind, s.options ?? []);
  const data = { ...state.data };
  const meta = { interpreted_by: res.by, model_ms: res.ms };

  if (res.value == null) {
    const tries = (state.tries ?? 0) + 1;
    const hint =
      state.step === "especialidad"
        ? "Gracias. Para orientarla, elija una opción o la 9; un profesional revisará su caso."
        : state.step === "alarma"
          ? "Por favor responda SÍ o NO."
          : "No le entendí bien. Puede responder con el número de la opción.";
    return { state: { ...state, tries }, replies: [{ body: hint }, ask(state.step, data)], meta };
  }

  data[state.step] = res.value;
  let extra: Reply[] = [];
  if (state.step === "documento" && res.value === "sin_documento") extra = [{ body: "No hay problema: igual registramos su solicitud." }];
  if (state.step === "motivo") data.motivo = scrubReason(res.value, data.nombre);

  // signs of alarm: emergency instructions, request derived, task for a person
  if (state.step === "alarma") {
    if (res.value === "si") {
      const r = await createRequest(data, ctx, true);
      return {
        state: { step: "done", data: {} },
        replies: [
          {
            body:
              "Por lo que nos cuenta, no espere una cita: acuda a la emergencia más cercana o llame al 106 (SAMU). " +
              `Avisamos a una persona del equipo de citas.${r ? ` (Registro ${r.code})` : ""}`,
          },
        ],
        meta,
      };
    }
    if (!state.rechecked && hasAlarmWords(data.motivo ?? "")) {
      return {
        state: { ...state, data, rechecked: true, tries: 0 },
        replies: [{ body: "En el motivo mencionó algo que puede ser un signo de alarma. Revise otra vez, por favor." }, ask("alarma", data)],
        meta,
      };
    }
  }

  if (state.step === "resumen") {
    if (res.value === "corregir") return { state: { step: "para_quien", data: {} }, replies: [{ body: "De acuerdo, empecemos de nuevo." }, ask("para_quien", {})], meta };
    const r = await createRequest(data, ctx, false);
    return {
      state: { step: "done", data: {} },
      replies: [
        {
          body:
            `Listo. Su número de solicitud es ${r.code}. No es una cita todavía: un profesional la revisará y le avisaremos por aquí ` +
            "cuando haya un cupo para usted. Si deja de responder, no pierde su lugar.",
        },
      ],
      meta: { ...meta, code: r.code },
    };
  }

  const next = ORDER[ORDER.indexOf(state.step) + 1];
  return { state: { step: next, data, rechecked: state.rechecked, tries: 0 }, replies: [...extra, ask(next, data)], meta };
}

async function createRequest(data: Record<string, string>, ctx: Ctx, alarm: boolean) {
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
  if (alarm) await rpc("derive_emergency", { p_request: r.id, p_actor: "Bot del chat", p_source: "chat" });
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
