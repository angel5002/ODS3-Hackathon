// The registration bot's script and transitions, PURE (no database, no model): src/lib/bot/machine.ts
// interprets the answer, calls next() and runs the effect it returns (register the request, refer to
// emergency). Unit-tested in tests/bot-script.test.ts. Texts: docs/conversaciones.md §1-§2 (v5.1, 7/11).
//
// Alarm signs (v5.1 §4.3, redesigned after the phone test of 7/11): ONE general question in second person
// with three examples; a question about pregnancy or a small baby ONLY when the person gave that context
// (the reason text or the age); if yes, ask briefly what they feel (for the staff task; never a diagnosis or a
// cause) and refer. The old 7-item list is gone.

export type Kind = "choice" | "age" | "text" | "yesno";
/** One bot message. `buttons` are tap-to-send answers; the UI renders them under the message. */
export type Reply = { body: string; buttons?: string[] };
export type BotState = { step: string; data: Record<string, string>; rechecked?: boolean; tries?: number };

/** What the machine must do after a transition (it has side effects, so it is not done here). */
export type Effect =
  | { type: "register" } // create the request and close with closingRegistered()
  | { type: "refer"; said: string }; // create the request, derive_emergency, task note with `said`, closingAlarm()

// ---------------------------------------------------------------- talking to a person

/** Label of the persistent quick action (the UI shows it as a button at all times, see QUICK_ACTIONS). */
export const PERSON_LABEL = "Hablar con una persona";
/** Button offered after a referral to emergency: it goes through the same PERSONA path. */
export const PERSON_NOW_LABEL = "Hablar ahora con una persona";
/**
 * Quick actions the chat UI keeps visible (GET /api/chat/messages → quickActions). Tapping one SENDS `send` as
 * the person's message: the server already understands it (isPersonRequest).
 */
export const QUICK_ACTIONS = [{ id: "persona", label: PERSON_LABEL, send: PERSON_LABEL }] as const;

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** "PERSONA", "Hablar con una persona", "Hablar ahora con una persona", "3. Hablar con una persona". */
export function isPersonRequest(text: string) {
  const t = norm(text).replace(/^\d+\.\s*/, "");
  return t === "persona" || t.startsWith("hablar con una persona") || t.startsWith("hablar ahora con una persona");
}

export const PERSON_REPLY: Reply = {
  body: "Listo: avisamos al equipo de citas. Una persona le escribirá por este chat; mientras tanto puede seguir escribiendo aquí.",
};

// ---------------------------------------------------------------- steps

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

type Step = { q: string; kind: Kind; options?: [string, string][]; buttons?: string[] };
export const STEPS: Record<string, Step> = {
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
  // the question text depends on who the patient is: see alarmQuestion()
  alarma: { q: "", kind: "yesno", buttons: ["Sí", "No"] },
  alarma_cual: {
    q: "¿Qué siente? Cuéntelo en pocas palabras, para que el equipo sepa qué pasa.",
    kind: "text",
    buttons: ["Dolor fuerte en el pecho", "Falta de aire", "Desmayo"],
  },
  alarma_embarazo: { q: "", kind: "yesno", buttons: ["Sí", "No"] },
  alarma_bebe: { q: "", kind: "yesno", buttons: ["Sí", "No"] },
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
    q: "¿Está correcto el resumen?",
    kind: "choice",
    options: [
      ["si", "Sí"],
      ["corregir", "Corregir"],
    ],
  },
};
export const ORDER = ["para_quien", "nombre", "documento", "edad", "especialidad", "referencia", "motivo", "alarma", "canal", "poco_aviso", "preferente", "resumen"];

// ---------------------------------------------------------------- alarm signs

/** The ONE general question, in second person (or about the patient when the chat is for someone else). */
export function alarmQuestion(data: Record<string, string>) {
  const examples = "como dolor fuerte en el pecho, falta de aire o un desmayo";
  if (data.para_quien === "cuidador") {
    const who = (data.nombre ?? "").trim().split(/\s+/)[0] || "la persona";
    return `¿${who} tiene ahora algo que no puede esperar, ${examples}?`;
  }
  return `¿Siente ahora algo que no puede esperar, ${examples}?`;
}

const PREGNANCY = /embaraz|gestant|gestaci|encinta|prenatal|semanas de embarazo/;
// a baby is said in so many words; "meses" alone is not one ("me cuesta leer desde hace meses", a 50-year-old)
const BABY = /\bbebe\b|\bbebito|recien nacid|lactante|meses de (edad|nacid|vida)|mes(es)? de nacid/;

/** Context questions that apply: only when the person said so (reason text, age 0 = a baby). */
export function alarmFollowUps(data: Record<string, string>): string[] {
  const motivo = norm(data.motivo ?? "");
  const out: string[] = [];
  if (PREGNANCY.test(motivo)) out.push("alarma_embarazo");
  if (data.edad === "0" || BABY.test(motivo)) out.push("alarma_bebe");
  return out;
}

function contextQuestion(step: string, data: Record<string, string>) {
  const self = data.para_quien !== "cuidador";
  if (step === "alarma_embarazo") return self ? "¿Tiene ahora sangrado o un dolor fuerte en el embarazo?" : "¿Ella tiene ahora sangrado o un dolor fuerte en el embarazo?";
  return "¿El bebé tiene fiebre y menos de 3 meses?";
}

/** What the staff task says when a context question was answered yes. */
const CONTEXT_SAID: Record<string, string> = {
  alarma_embarazo: "Embarazo: sangrado o dolor fuerte",
  alarma_bebe: "Bebé de menos de 3 meses con fiebre",
};

// ---------------------------------------------------------------- closings (1–2 sentences: what was
// registered, who reviews it, how we notify, what to do if it gets worse; no time is promised)

/**
 * derive_emergency (Postgres) already delivers this instruction to the chat linked to the request
 * ("Por lo que nos cuenta, no espere una cita: acuda a la emergencia más cercana o llame al 106 (SAMU). …").
 * The bot's own closing must NOT repeat it: repeating it was the duplicated closing of 7/11 (S-0431).
 */
export const DB_ALARM_DELIVERY_PREFIX = "Por lo que nos cuenta, no espere una cita";

export function closingRegistered(code: string, data: Record<string, string>): Reply {
  const via = data.canal === "llamada" ? "con una llamada" : "por este chat";
  const spec = data.especialidad && data.especialidad !== "Por definir" ? ` de ${data.especialidad}` : "";
  return {
    body:
      `Listo: registramos su solicitud${spec} con el código ${code}; todavía no es una cita. ` +
      `Un profesional la revisará y le avisaremos ${via} cuando haya un cupo (si deja de responder, no pierde su lugar); ` +
      "si empeora o aparece algo que no puede esperar, acuda a emergencia o llame al 106.",
  };
}

/** After a referral: the instruction came from derive_emergency; this says what happens next + a button. */
export function closingAlarm(code: string | null): Reply {
  return {
    body:
      `Registramos lo que nos contó${code ? ` en el caso ${code}` : ""}: una persona del equipo de citas lo revisará ahora y le escribirá por este chat. ` +
      "Si empeora mientras tanto, no espere: llame al 106.",
    buttons: [PERSON_NOW_LABEL],
  };
}

// ---------------------------------------------------------------- transitions

export function question(step: string, data: Record<string, string>) {
  if (step === "alarma") return alarmQuestion(data);
  if (step === "alarma_embarazo" || step === "alarma_bebe") return contextQuestion(step, data);
  return STEPS[step]?.q ?? "";
}

export function ask(step: string, data: Record<string, string>): Reply {
  const s = STEPS[step];
  if (step === "resumen") {
    const body =
      `Resumen: ${data.especialidad} · paciente de ${data.edad} ${data.edad === "1" ? "año" : "años"} · ` +
      `${data.referencia === "si" ? "con referencia" : "sin referencia"} · aviso por ${data.canal === "llamada" ? "llamada" : "chat"}. ¿Está correcto?\n1. Sí\n2. Corregir`;
    return { body, buttons: ["1. Sí", "2. Corregir"] };
  }
  return { body: question(step, data), buttons: s.buttons ?? s.options?.map(([, l], i) => `${i + 1}. ${l}`) };
}

function nextInOrder(step: string) {
  return ORDER[ORDER.indexOf(step) + 1];
}

/** Alarm words in the free reason (re-ask once even if the person answered NO). */
export type AlarmWordsFn = (text: string) => boolean;

/**
 * One transition of the registration bot with an already interpreted value (null = not understood).
 * Pure: the caller runs the returned effect and appends its closing.
 */
export function next(state: BotState, value: string | null, hasAlarmWords: AlarmWordsFn): { state: BotState; replies: Reply[]; effect?: Effect } {
  const step = state.step;
  const data = { ...state.data };

  if (value == null) {
    const tries = (state.tries ?? 0) + 1;
    const hint =
      step === "especialidad"
        ? "Gracias. Para orientarla, elija una opción o la 9; un profesional revisará su caso."
        : STEPS[step]?.kind === "yesno"
          ? "Por favor responda Sí o No."
          : "No le entendí bien. Puede responder con el número de la opción.";
    return { state: { ...state, tries }, replies: [{ body: hint }, ask(step, data)] };
  }

  data[step] = value;

  // ---- alarm signs
  if (step === "alarma") {
    if (value === "si") return { state: { ...state, step: "alarma_cual", data, tries: 0 }, replies: [ask("alarma_cual", data)] };
    if (!state.rechecked && hasAlarmWords(data.motivo ?? "")) {
      return {
        state: { ...state, data, rechecked: true, tries: 0 },
        replies: [{ body: "En el motivo mencionó algo que puede ser urgente." }, ask("alarma", data)],
      };
    }
    return toFollowUps(state, data, alarmFollowUps(data));
  }
  if (step === "alarma_cual") {
    return { state: { step: "done", data }, replies: [], effect: { type: "refer", said: value.trim().slice(0, 160) } };
  }
  if (step === "alarma_embarazo" || step === "alarma_bebe") {
    if (value === "si") return { state: { step: "done", data }, replies: [], effect: { type: "refer", said: CONTEXT_SAID[step] } };
    const pending = (data.alarma_pend ?? "").split(",").filter(Boolean);
    return toFollowUps(state, data, pending);
  }

  if (step === "resumen") {
    if (value === "corregir") return { state: { step: "para_quien", data: {} }, replies: [{ body: "De acuerdo, empecemos de nuevo." }, ask("para_quien", {})] };
    return { state: { step: "done", data }, replies: [], effect: { type: "register" } };
  }

  const extra: Reply[] = step === "documento" && value === "sin_documento" ? [{ body: "No hay problema: igual registramos su solicitud." }] : [];
  const n = nextInOrder(step);
  return { state: { step: n, data, rechecked: state.rechecked, tries: 0 }, replies: [...extra, ask(n, data)] };
}

/** After "no" to the general question: the context questions that apply, then the next step (canal). */
function toFollowUps(state: BotState, data: Record<string, string>, pending: string[]) {
  const [first, ...rest] = pending;
  if (first) {
    const d = { ...data, alarma_pend: rest.join(",") };
    return { state: { ...state, step: first, data: d, tries: 0 }, replies: [ask(first, d)] };
  }
  const d = { ...data };
  delete d.alarma_pend;
  return { state: { step: "canal", data: d, rechecked: state.rechecked, tries: 0 }, replies: [ask("canal", d)] };
}
