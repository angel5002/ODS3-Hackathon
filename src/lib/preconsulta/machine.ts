// Pre-visit ("preconsulta") interview, proposal v5.1 §3.1 and §4.1-4.2, pitch v7 scene 2.
// A state machine controls every step (like the chat bot, src/lib/bot/machine.ts); free text is read with rules
// (keywords, negations). The language model never decides a step, never diagnoses and never suggests tests: at
// most the server asks it to read a yes/no answer the rules did not understand (src/lib/bot/interpret.ts).
//
// Summary rules (the doctor's view):
//   - required fields: motive, onset, medicines, allergies, alarm signs; a missing one is "no informado";
//   - "no sé" / "prefiero decirlo en la consulta" are accepted and shown as such (never invented);
//   - negations are VERIFIED: only a clear "no" to a direct, closed question counts; a negation found inside a free
//     answer ("sin fiebre") stays "por verificar" until the direct question confirms it; an ambiguous "no" to a
//     double question is asked again;
//   - medicines are confirmed one by one with the patient;
//   - alarm signs (fever, very swollen or hot joint, plus the chat bot's alarm list) INTERRUPT the interview at any
//     step, tell the person to go to the emergency room or call 106, and create a staff task;
//   - the signs not asked are "no evaluado": the summary never says "sin signos de alarma" for an unfinished question.
// Pure and framework-free (types only are imported): tested with node --test (tests/preconsulta.test.ts).
import type { PreconsultaSummary } from "../demo/contract";
import type { ArrivalWindow } from "./arrival";

export type FieldState = "informado" | "no_sabe" | "prefiere_consulta";
export type Field = { estado: FieldState; valor: string | null; literal: string } | null;

export type SignId = "fiebre" | "hinchazon" | "calor" | "pecho" | "aire" | "desmayo" | "emb_sangrado" | "emb_dolor" | "bebe_fiebre" | "otro";
export type SignState = "no" | "si" | "no_evaluado" | "por_verificar";
export type Sign = { id: SignId; label: string; estado: SignState; fuente: string | null };

/**
 * The alarm questions: ONE per context, in the second person, with 2–3 examples, never a long list.
 *   local   — the person named a joint or limb (scene 2: "¿Tiene fiebre, o la rodilla está muy hinchada o caliente?")
 *   general — otherwise: "¿Siente ahora algo que no puede esperar, como dolor fuerte en el pecho, falta de aire o desmayo?"
 *   embarazo / bebe — only when the person mentioned that context.
 */
export type AlarmQ = "local" | "general" | "embarazo" | "bebe";

export type PcStep =
  | "motivo"
  | "inicio"
  | "medicamentos"
  | "aclarar_no"
  | "confirmar_med"
  | "corregir_med"
  | "alergias"
  | "alarma"
  | "alarma_cual"
  | "fin"
  | "emergencia"
  | "persona";

export type Gender = "m" | "f" | null;

export type PcState = {
  step: PcStep;
  name: string;
  gender: Gender;
  /** body part named in the motive, for the alarm question */
  part: { word: string; fem: boolean } | null;
  motivo: Field;
  inicio: Field;
  medicamentos: { nombre: string; confirmado: boolean }[];
  /** "ninguno" is a verified negation (direct answer to "¿Tomó algún medicamento?") */
  medsEstado: "informado" | "ninguno" | "no_sabe" | "prefiere_consulta" | null;
  medIndex: number;
  alergias: Field;
  alarma: { preguntada: boolean; positiva: boolean; detalle: string | null; literal: string | null };
  signos: Sign[];
  /** the alarm questions planned after the motive, and the one being asked */
  alarmPlan: AlarmQ[];
  alarmIdx: number;
  /** contradictory, not understood or pending data (shown to the doctor) */
  pendientes: string[];
  tries: number;
};

export type Turn = { step: string; who: "ia" | "persona"; text: string; interpreted?: unknown; by?: "reglas" | "modelo" };

export type StepResult = {
  state: PcState;
  replies: string[];
  status: "en_curso" | "completa" | "derivada_emergencia" | "con_persona";
  task: { type: "alarma" | "pide_persona"; note: string } | null;
  turns: Turn[];
};

export type StepOptions = {
  /** arrival window (simulated durations), or null if there is none */
  window?: ArrivalWindow | null;
  /** extra alarm words: the chat bot's list (src/lib/bot/interpret.ts ALARM_WORDS) */
  extraAlarmWords?: string[];
  /** a yes/no the server got from the model when the rules did not understand (confirmation steps only) */
  interpreted?: "si" | "no" | null;
};

// ---------------------------------------------------------------- text helpers

export function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const DONT_KNOW = /^(no se|no lo se|ni idea|no estoy segur[oa]|no recuerdo|no me acuerdo)\b/;
const PREFER = /(prefiero (decirlo|contarlo|hablarlo|comentarlo)|lo digo en la consulta|en la consulta se lo digo)/;
const PERSON = /(\bhablar con\b.*\b(persona|alguien|humano|operador[a]?)\b|^(persona|una persona|humano|operador[a]?)[.!]*$)/;

export function dontKnow(t: string) {
  return DONT_KNOW.test(norm(t));
}
export function prefersConsult(t: string) {
  return PREFER.test(norm(t));
}

export function yesNo(t: string): "si" | "no" | null {
  const a = norm(t).replace(/[.!¡¿?]/g, "").trim();
  if (DONT_KNOW.test(a)) return null; // "no sé" is not a "no"
  if (/^(si|sí|s|claro|correcto|asi es|exacto|ok|de acuerdo|1)( |$)/.test(a)) return "si";
  if (/^(no|n|nop|incorrecto|2)( |$)/.test(a)) return "no";
  return null;
}

/** A clear, complete "no" (nothing positive after it): the only answer that verifies a negation. */
export function clearNo(t: string) {
  const a = norm(t).replace(/[.!¡¿?]/g, "").trim();
  return /^(no|nop|nada|ninguno|ninguna|no tengo|no tengo nada|no nada|no ninguno|no ninguna|para nada|tampoco)$/.test(a);
}

// ---------------------------------------------------------------- alarm signs

/** The pre-visit's own alarm words with the sign they belong to (the chat bot's list is added by the server). */
export const PRECONSULTA_ALARM: { sign: SignId; label: string; words: string[] }[] = [
  { sign: "fiebre", label: "Fiebre", words: ["fiebre", "calentura", "temperatura alta", "afiebrad"] },
  { sign: "hinchazon", label: "Muy hinchada", words: ["muy hinchad", "bien hinchad", "hinchadisim", "demasiado hinchad", "muy inflamad", "bien inflamad"] },
  { sign: "calor", label: "Caliente", words: ["caliente", "calor en la", "calor en el", "quema al tocar"] },
  { sign: "pecho", label: "Dolor fuerte en el pecho", words: ["dolor en el pecho", "dolor fuerte en el pecho", "me duele el pecho", "opresion en el pecho"] },
  { sign: "aire", label: "Falta de aire", words: ["falta de aire", "no puedo respirar", "me ahogo", "ahogo"] },
  { sign: "desmayo", label: "Desmayo", words: ["desmay", "perdi el conocimiento"] },
  { sign: "emb_sangrado", label: "Sangrado", words: ["sangrado", "sangro", "estoy sangrando"] },
  { sign: "emb_dolor", label: "Dolor fuerte de barriga", words: ["dolor fuerte de barriga", "dolor fuerte en la barriga", "dolor fuerte de vientre", "contracciones"] },
];

/** The signs each question asks about (the summary lists them; the ones never asked stay "no evaluado"). */
export const ALARM_SIGNS: Record<AlarmQ, { id: SignId; label: string }[]> = {
  local: [
    { id: "fiebre", label: "Fiebre" },
    { id: "hinchazon", label: "Muy hinchada" },
    { id: "calor", label: "Caliente" },
  ],
  general: [
    { id: "pecho", label: "Dolor fuerte en el pecho" },
    { id: "aire", label: "Falta de aire" },
    { id: "desmayo", label: "Desmayo" },
  ],
  embarazo: [
    { id: "emb_sangrado", label: "Sangrado en el embarazo" },
    { id: "emb_dolor", label: "Dolor fuerte de barriga en el embarazo" },
  ],
  bebe: [{ id: "bebe_fiebre", label: "Fiebre en el bebé" }],
};

const PREGNANCY = /\b(embaraz|gestante|gestacion|estoy esperando (un|una) bebe|semanas de embarazo)/;
const BABY = /\b(bebe|recien nacid|lactante|mi hij[oa] (tiene|de) \d+ (mes|meses|dias))/;

const NEGATORS = /\b(no|ni|sin|tampoco|nunca|nada de)\b/;

/** Alarm mentions in a free answer, split into positive (interrupt) and negated ones (to verify). */
export function alarmMentions(text: string, extraWords: string[] = []) {
  const positive: string[] = [];
  const negated: string[] = [];
  const all = [
    ...PRECONSULTA_ALARM.flatMap((g) => g.words.map((w) => ({ w, label: g.label }))),
    ...extraWords.filter((w) => w !== "106").map((w) => ({ w: norm(w), label: w })),
  ];
  // clauses: "No, pero tengo fiebre" → "no" | "tengo fiebre"
  const clauses = norm(text).split(/[.;,]| pero | aunque /);
  for (const c of clauses) {
    for (const { w, label } of all) {
      const i = c.indexOf(w);
      if (i < 0) continue;
      const before = c.slice(Math.max(0, i - 40), i);
      const words = before.trim().split(" ").slice(-6).join(" ");
      if (NEGATORS.test(words)) negated.push(label);
      else positive.push(label);
    }
  }
  return { positive: [...new Set(positive)], negated: [...new Set(negated)] };
}

// ---------------------------------------------------------------- parsing of free answers

const PARTS: [string, boolean][] = [
  ["rodilla", true],
  ["tobillo", false],
  ["muneca", true],
  ["codo", false],
  ["hombro", false],
  ["cadera", true],
  ["pierna", true],
  ["brazo", false],
  ["mano", true],
  ["pie", false],
  ["espalda", true],
  ["cuello", false],
];

export function bodyPart(text: string) {
  const t = norm(text);
  for (const [word, fem] of PARTS) if (new RegExp(`\\b${word}\\b`).test(t)) return { word: word === "muneca" ? "muñeca" : word, fem };
  return null;
}

const ONSET = [
  /\b(desde hace (?:mas de |casi |unos? |unas? )?[^.,;]+)/i,
  /\b(hace (?:mas de |casi |unos? |unas? )?\d*\s*(?:un|una|dos|tres|cuatro|cinco|seis|siete|varios|varias|algunos|algunas)?\s*(?:dia|dias|semana|semanas|mes|meses|ano|anos|hora|horas))\b/i,
  /\b(desde (?:ayer|anoche|anteayer|hoy|esta manana|el (?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)|la semana pasada|el mes pasado))\b/i,
];

/** "Me duele la rodilla derecha desde hace una semana." → motive "Me duele la rodilla derecha", onset "desde hace una semana" */
export function splitOnset(text: string): { motivo: string; inicio: string | null } {
  const original = text.trim();
  const plain = norm(original);
  for (const re of ONSET) {
    const m = re.exec(plain);
    if (m) {
      // cut the same span in the original text (norm keeps the length unless accents or spaces changed)
      const start = m.index;
      const sameLength = plain.length === original.normalize("NFC").replace(/\s+/g, " ").length;
      const src = original.normalize("NFC").replace(/\s+/g, " ");
      const inicio = sameLength ? src.slice(start, start + m[1].length) : m[1];
      const rest = sameLength ? (src.slice(0, start) + src.slice(start + m[1].length)) : src.replace(new RegExp(m[1], "i"), "");
      const motivo = rest.replace(/\s+([.,;])/g, "$1").replace(/[\s,;.]+$/g, "").trim();
      return { motivo: motivo || original, inicio: inicio.trim() };
    }
  }
  return { motivo: original.replace(/[\s.]+$/g, ""), inicio: null };
}

const MED_NOISE =
  /^(solo|solamente|nada mas que|me tome|me tomo|tome|tomo|estoy tomando|he tomado|tomé|tomó|uso|use|unas?|unos?|pastillas? de|tabletas? de|un poco de|algo de|para el dolor|medicamento|medicamentos|de)\s+/;

function capitalize(s: string) {
  return s ? s[0].toLocaleUpperCase("es") + s.slice(1) : s;
}

export type MedsAnswer = {
  meds: string[];
  medsNone: boolean;
  allergies: { estado: "ninguna" | "informado" | null; valor: string | null };
  /** a bare "No" to the double question: which one it answers is not clear */
  ambiguousNo: boolean;
  dontKnow: boolean;
  prefer: boolean;
};

/** "Ibuprofeno. Alergias, ninguna." → meds ["Ibuprofeno"], allergies "ninguna" */
export function parseMedsAndAllergies(text: string): MedsAnswer {
  const res: MedsAnswer = { meds: [], medsNone: false, allergies: { estado: null, valor: null }, ambiguousNo: false, dontKnow: false, prefer: false };
  const t = norm(text).replace(/[¡!¿?]/g, "");
  if (clearNo(t)) return { ...res, ambiguousNo: true };
  if (prefersConsult(t)) return { ...res, prefer: true };
  if (DONT_KNOW.test(t) && !/alergi/.test(t)) return { ...res, dontKnow: true };
  const clauses = text
    .replace(/[¡!¿?]/g, "")
    .split(/[.;]|\by\s+(?=alergi)|,\s*(?=(?:no\s+tengo\s+)?alergi)/i)
    .map((c) => c.trim())
    .filter(Boolean);
  for (const raw of clauses) {
    const c = norm(raw);
    if (/alergi/.test(c)) {
      const rest = c.replace(/^(y\s+)?(de\s+)?(las\s+)?alergias?\s*(a\s+)?[,:]?\s*/, "").replace(/\balergic[oa]s?\b/, "").trim();
      if (/^(ninguna|ninguno|nada|no|no tengo|no tengo ninguna|ninguna que sepa)$/.test(rest) || /\b(no tengo|sin|ninguna)\b/.test(c) && !/\bsoy alergic|alergic[oa] a\b/.test(c)) {
        res.allergies = { estado: "ninguna", valor: "ninguna" };
      } else if (/\bno se\b/.test(c)) {
        res.allergies = { estado: null, valor: null };
      } else {
        const v = raw.replace(/^(y\s+)?(soy\s+)?(al[eé]rgic[oa]\s+a\s+|alergias?\s*(a\s+)?[,:]?\s*)/i, "").trim();
        res.allergies = { estado: "informado", valor: v || raw };
      }
      continue;
    }
    if (/^(ninguno|ninguna|nada|no|no tome nada|no tome ninguno|no he tomado nada|no tomo nada)$/.test(c)) {
      res.medsNone = true;
      continue;
    }
    let item = raw;
    for (let i = 0; i < 3; i++) item = item.replace(new RegExp(MED_NOISE.source, "i"), "");
    for (const part of item.split(/,|\s+y\s+|\s+e\s+/i)) {
      const name = part.replace(/^(un|una|el|la)\s+/i, "").trim();
      if (name && name.length <= 40 && !/^(no|si|sí)$/i.test(name)) res.meds.push(capitalize(name.toLocaleLowerCase("es")));
    }
  }
  res.meds = [...new Set(res.meds)];
  return res;
}

// ---------------------------------------------------------------- questions

/** The context-specific question when the person named a joint or limb (the script's question for Tito's knee). */
export function alarmQuestion(part: PcState["part"]) {
  if (!part) return GENERAL_ALARM_QUESTION;
  return `¿Tiene fiebre, o ${part.fem ? "la" : "el"} ${part.word} está muy ${part.fem ? "hinchada" : "hinchado"} o caliente?`;
}

export const GENERAL_ALARM_QUESTION = "¿Siente ahora algo que no puede esperar, como dolor fuerte en el pecho, falta de aire o desmayo?";
export const PREGNANCY_ALARM_QUESTION = "Por el embarazo: ¿tiene ahora sangrado o dolor fuerte de barriga?";
export const BABY_ALARM_QUESTION = "¿El bebé tiene fiebre ahora?";

export function questionFor(q: AlarmQ, part: PcState["part"]) {
  return q === "local" ? alarmQuestion(part) : q === "general" ? GENERAL_ALARM_QUESTION : q === "embarazo" ? PREGNANCY_ALARM_QUESTION : BABY_ALARM_QUESTION;
}

/** The plan of alarm questions from what the person said in the motive (one general or local + the contexts named). */
export function alarmPlan(motive: string, part: PcState["part"]): AlarmQ[] {
  const t = norm(motive);
  const plan: AlarmQ[] = [part ? "local" : "general"];
  if (PREGNANCY.test(t)) plan.push("embarazo");
  if (BABY.test(t)) plan.push("bebe");
  return plan;
}

const WORSE = "Si se siente peor antes de la cita, no espere: acuda a emergencia o llame al 106.";

export const Q = {
  motivo: (name: string) => `Hola, ${name}. Antes de su cita, ¿qué molestia quiere consultar?`,
  inicio: "¿Desde cuándo tiene esta molestia?",
  medicamentos: "¿Tomó algún medicamento? ¿Tiene alergias?",
  aclarar_no: "Para estar seguros: ¿no tomó ningún medicamento y no tiene alergias? Responda SÍ o NO.",
  confirmar_med: (med: string) => `Anoté: ${med}. ¿Es correcto? Responda SÍ o NO.`,
  corregir_med: "Escriba el nombre correcto del medicamento, o NINGUNO si no tomó otro.",
  alergias: "¿Tiene alguna alergia, por ejemplo a algún medicamento?",
  alarma_cual: "¿Qué siente? Cuéntelo en pocas palabras. Si es muy fuerte, no espere: acuda a emergencia o llame al 106.",
  emergencia:
    "Por lo que nos cuenta, no espere su cita: acuda a la emergencia más cercana o llame al 106 (SAMU). " +
    "Registramos lo que nos dijo y avisamos al equipo de la clínica: una persona revisará su caso y le escribirá por este chat. " +
    "Si quiere hablar con alguien ahora, toque «Hablar con una persona ahora».",
  persona:
    "Una persona del equipo le escribirá pronto por este chat. Lo que respondió queda registrado para su médico, que lo revisará antes de atenderle. " +
    WORSE,
  persona_ahora: "Listo: avisamos a una persona del equipo y le escribirá por este chat lo antes posible. Mientras tanto, si empeora, acuda a emergencia o llame al 106.",
};

/**
 * The closing. The first line is the script's (scene 2); the second says what was registered, who reviews it, how we
 * will notify and what to do if the person feels worse; the arrival time is always an estimate.
 */
export function closingLines(name: string, gender: Gender, window: ArrivalWindow | null | undefined): string[] {
  const first =
    gender === "m"
      ? `Gracias, ${name}. Su médico lo recibirá con este resumen.`
      : gender === "f"
        ? `Gracias, ${name}. Su médico la recibirá con este resumen.`
        : `Gracias, ${name}. Su médico tendrá este resumen al atenderle.`;
  const registered = "Registramos su molestia, sus medicamentos y sus respuestas: su médico los revisará antes de atenderle.";
  if (!window) return [first, `${registered} ${WORSE}`];
  const w =
    window.atrasoMin > 0
      ? `Su consultorio va con ${window.atrasoMin} min de atraso: llegue entre ${window.desde} y ${window.hasta}.`
      : `Su consultorio va a tiempo: llegue entre ${window.desde} y ${window.hasta}.`;
  return [`${first} ${w}`, `${registered} ${ARRIVAL_DISCLAIMER} Si cambia, le avisaremos por este chat. ${WORSE}`];
}

export const ARRIVAL_DISCLAIMER = "La hora de llegada es una estimación con los tiempos de hoy, no una hora garantizada.";

// ---------------------------------------------------------------- the machine

function plannedSigns(plan: AlarmQ[]): Sign[] {
  return plan.flatMap((q) => ALARM_SIGNS[q].map((x) => ({ ...x, estado: "no_evaluado" as SignState, fuente: null })));
}

export function initialState(name: string, gender: Gender = null): PcState {
  return {
    step: "motivo",
    name: name.trim().slice(0, 40) || "paciente",
    gender,
    part: null,
    motivo: null,
    inicio: null,
    medicamentos: [],
    medsEstado: null,
    medIndex: 0,
    alergias: null,
    alarma: { preguntada: false, positiva: false, detalle: null, literal: null },
    signos: [],
    alarmPlan: [],
    alarmIdx: 0,
    pendientes: [],
    tries: 0,
  };
}

/** The question of the current step (what the assistant asks now). */
export function currentQuestion(s: PcState): string | null {
  switch (s.step) {
    case "motivo":
      return Q.motivo(s.name);
    case "inicio":
      return Q.inicio;
    case "medicamentos":
      return Q.medicamentos;
    case "aclarar_no":
      return Q.aclarar_no;
    case "confirmar_med":
      return Q.confirmar_med(s.medicamentos[s.medIndex]?.nombre ?? "");
    case "corregir_med":
      return Q.corregir_med;
    case "alergias":
      return Q.alergias;
    case "alarma":
      return questionFor(s.alarmPlan?.[s.alarmIdx] ?? (s.part ? "local" : "general"), s.part);
    case "alarma_cual":
      return Q.alarma_cual;
    default:
      return null;
  }
}

/** Steps whose answer is a yes/no: the server may ask the model only for these, when the rules fail. */
export function isYesNoStep(s: PcState) {
  return s.step === "aclarar_no" || s.step === "confirmar_med";
}

export function startInterview(s: PcState): string[] {
  return [Q.motivo(s.name)];
}

function field(text: string, valor: string | null): Field {
  if (dontKnow(text)) return { estado: "no_sabe", valor: null, literal: text.trim() };
  if (prefersConsult(text)) return { estado: "prefiere_consulta", valor: null, literal: text.trim() };
  return { estado: "informado", valor, literal: text.trim() };
}

function setSign(s: PcState, id: SignId, estado: SignState, fuente: string) {
  s.signos = s.signos.map((x) => (x.id === id ? { ...x, estado, fuente } : x));
}

function labelToSign(label: string): SignId {
  return PRECONSULTA_ALARM.find((g) => g.label === label)?.sign ?? "otro";
}

/** After the medicines (and allergies): the next missing required field, or the alarm question. */
function afterMeds(s: PcState): PcStep {
  if (!s.alergias) return "alergias";
  return "alarma";
}

/** Advances the interview one answer. Never throws; unknown or finished states answer nothing. */
export function step(state: PcState, text: string, opts: StepOptions = {}): StepResult {
  const s: PcState = structuredClone(state);
  s.alarmPlan ??= [];
  s.alarmIdx ??= 0;
  s.signos ??= [];
  const t = text.trim().slice(0, 500);
  const turns: Turn[] = [{ step: s.step, who: "persona", text: t }];
  const out = (status: StepResult["status"], replies: string[], task: StepResult["task"] = null): StepResult => {
    for (const r of replies) turns.push({ step: s.step, who: "ia", text: r });
    return { state: s, replies, status, task, turns };
  };
  if (["fin", "emergencia", "persona"].includes(s.step) || !t) {
    return { state: s, replies: [], status: s.step === "fin" ? "completa" : s.step === "emergencia" ? "derivada_emergencia" : s.step === "persona" ? "con_persona" : "en_curso", task: null, turns: [] };
  }

  // 1) a person, at any step
  if (PERSON.test(norm(t))) {
    s.step = "persona";
    return out("con_persona", [Q.persona], { type: "pide_persona", note: "Pidió hablar con una persona durante la preconsulta" });
  }

  // the alarm questions depend on what the person said in the motive (a joint or limb, a pregnancy, a baby)
  if (s.step === "motivo") {
    s.part = bodyPart(t);
    s.alarmPlan = alarmPlan(t, s.part);
    s.alarmIdx = 0;
    s.signos = plannedSigns(s.alarmPlan);
  }

  // 2) alarm signs, at any step: interrupt, refer to emergency, task for the staff. A bare "sí" to an alarm question
  //    first asks briefly which one (for the staff task; never to diagnose); any answer to that refers.
  const mention = alarmMentions(t, opts.extraAlarmWords);
  const yn = yesNo(t) ?? (isYesNoStep(s) ? opts.interpreted ?? null : null);
  if (s.step === "alarma" && yn === "si" && mention.positive.length === 0) {
    s.alarma = { preguntada: true, positiva: true, detalle: "Respondió que sí a la pregunta de signos de alarma", literal: t };
    const q = s.alarmPlan[s.alarmIdx];
    if (q) for (const x of ALARM_SIGNS[q]) setSign(s, x.id, "por_verificar", "respondió que sí a la pregunta");
    s.step = "alarma_cual";
    turns[0].interpreted = { alarma: "si" };
    return out("en_curso", [Q.alarma_cual]);
  }
  if (mention.positive.length > 0 || s.step === "alarma_cual") {
    const detail = mention.positive.length ? mention.positive.join(", ") : `refirió: «${t.slice(0, 80)}»`;
    s.alarma = { preguntada: s.alarma.preguntada || s.step === "alarma" || s.step === "alarma_cual", positiva: true, detalle: detail, literal: t };
    for (const l of mention.positive) {
      const id = labelToSign(l);
      if (id !== "otro" && s.signos.some((x) => x.id === id)) setSign(s, id, "si", "referido por el paciente");
      else if (!s.signos.some((x) => x.label.toLowerCase() === l.toLowerCase())) s.signos.push({ id: "otro", label: capitalize(l), estado: "si", fuente: "referido por el paciente" });
    }
    s.step = "emergencia";
    turns[0].interpreted = { alarma: s.alarma.detalle };
    return out("derivada_emergencia", [Q.emergencia], { type: "alarma", note: `Refirió un signo de alarma (${detail}). Se le indicó acudir a emergencia o llamar al 106.` });
  }
  // negations found in a free answer are only "por verificar" until the direct question
  for (const l of mention.negated) {
    const id = labelToSign(l);
    if (id !== "otro" && s.signos.find((x) => x.id === id)?.estado === "no_evaluado") setSign(s, id, "por_verificar", "lo negó en una respuesta libre");
  }

  switch (s.step) {
    case "motivo": {
      const { motivo, inicio } = splitOnset(t);
      s.motivo = field(t, motivo);
      if (inicio) s.inicio = { estado: "informado", valor: inicio, literal: t };
      turns[0].interpreted = { motivo: s.motivo?.valor ?? s.motivo?.estado, inicio: s.inicio?.valor ?? null };
      s.step = s.inicio || s.motivo?.estado !== "informado" ? "medicamentos" : "inicio";
      return out("en_curso", [currentQuestion(s)!]);
    }
    case "inicio": {
      s.inicio = field(t, t.replace(/[\s.]+$/, ""));
      turns[0].interpreted = { inicio: s.inicio?.valor ?? s.inicio?.estado };
      s.step = "medicamentos";
      return out("en_curso", [currentQuestion(s)!]);
    }
    case "medicamentos": {
      const p = parseMedsAndAllergies(t);
      turns[0].interpreted = p;
      if (p.ambiguousNo) {
        s.step = "aclarar_no";
        return out("en_curso", [Q.aclarar_no]);
      }
      if (p.prefer || p.dontKnow) {
        s.medsEstado = p.prefer ? "prefiere_consulta" : "no_sabe";
        s.step = afterMeds(s);
        return out("en_curso", [currentQuestion(s)!]);
      }
      if (p.allergies.estado) s.alergias = { estado: "informado", valor: p.allergies.valor, literal: t };
      if (p.meds.length) {
        s.medicamentos = p.meds.map((nombre) => ({ nombre, confirmado: false }));
        s.medsEstado = "informado";
        s.medIndex = 0;
        s.step = "confirmar_med";
        return out("en_curso", [currentQuestion(s)!]);
      }
      if (p.medsNone) {
        s.medsEstado = "ninguno";
        s.step = afterMeds(s);
        return out("en_curso", [currentQuestion(s)!]);
      }
      if (s.alergias) {
        // only allergies: the medicines are still missing
        s.tries += 1;
        if (s.tries > 1) {
          s.pendientes.push("Medicamentos: no se entendió la respuesta");
          s.step = "alarma";
          return out("en_curso", [currentQuestion(s)!]);
        }
        return out("en_curso", ["¿Y tomó algún medicamento? Escriba el nombre, o NINGUNO."]);
      }
      s.tries += 1;
      if (s.tries > 1) {
        s.pendientes.push(`Medicamentos y alergias: no se entendió «${t.slice(0, 80)}»`);
        s.tries = 0;
        s.step = "alarma";
        return out("en_curso", [currentQuestion(s)!]);
      }
      return out("en_curso", ["No le entendí bien. Escriba el nombre del medicamento (o NINGUNO) y si tiene alergias."]);
    }
    case "aclarar_no": {
      if (yn === "si") {
        s.medsEstado = "ninguno";
        s.alergias = { estado: "informado", valor: "ninguna", literal: t };
        s.step = "alarma";
        return out("en_curso", [currentQuestion(s)!]);
      }
      if (yn === "no") {
        s.step = "medicamentos";
        return out("en_curso", ["De acuerdo. " + Q.medicamentos]);
      }
      return out("en_curso", ["Por favor responda SÍ o NO.", Q.aclarar_no]);
    }
    case "confirmar_med": {
      const med = s.medicamentos[s.medIndex];
      if (yn === "si") {
        s.medicamentos[s.medIndex] = { ...med, confirmado: true };
      } else if (yn === "no") {
        s.medicamentos.splice(s.medIndex, 1);
        s.pendientes.push(`El paciente corrigió «${med.nombre}»`);
        s.step = "corregir_med";
        return out("en_curso", [Q.corregir_med]);
      } else {
        return out("en_curso", ["Por favor responda SÍ o NO.", currentQuestion(s)!]);
      }
      s.medIndex += 1;
      if (s.medIndex < s.medicamentos.length) return out("en_curso", [currentQuestion(s)!]);
      s.step = afterMeds(s);
      return out("en_curso", [currentQuestion(s)!]);
    }
    case "corregir_med": {
      const n = norm(t);
      if (/^(ninguno|ninguna|nada|no)$/.test(n)) {
        if (s.medicamentos.length === 0) s.medsEstado = "ninguno";
        if (s.medIndex < s.medicamentos.length) {
          s.step = "confirmar_med";
          return out("en_curso", [currentQuestion(s)!]);
        }
        s.step = afterMeds(s);
        return out("en_curso", [currentQuestion(s)!]);
      }
      const p = parseMedsAndAllergies(t);
      const names = p.meds.length ? p.meds : [capitalize(t.slice(0, 40))];
      s.medicamentos.splice(s.medIndex, 0, ...names.map((nombre) => ({ nombre, confirmado: false })));
      s.medsEstado = "informado";
      s.step = "confirmar_med";
      return out("en_curso", [currentQuestion(s)!]);
    }
    case "alergias": {
      const n = norm(t).replace(/[.!]/g, "");
      if (clearNo(n) || /^(no tengo alergias?|ninguna alergia|no soy alergic[oa])$/.test(n)) s.alergias = { estado: "informado", valor: "ninguna", literal: t };
      else if (dontKnow(t) || prefersConsult(t)) s.alergias = field(t, null);
      else s.alergias = { estado: "informado", valor: t.replace(/^(s[ií],?\s*)?(soy\s+)?(al[eé]rgic[oa]\s+a\s+)?/i, "").replace(/[\s.]+$/, "") || t, literal: t };
      turns[0].interpreted = { alergias: s.alergias?.valor ?? s.alergias?.estado };
      s.step = "alarma";
      return out("en_curso", [currentQuestion(s)!]);
    }
    case "alarma": {
      s.alarma.preguntada = true;
      s.alarma.literal = t;
      const q = s.alarmPlan[s.alarmIdx] ?? (s.part ? "local" : "general");
      if (clearNo(t) || (yn === "no" && mention.positive.length === 0 && !/\b(pero|aunque|un poco|algo|a veces)\b/.test(norm(t)))) {
        // verified negation: a clear "no" to the direct, closed question that named those signs
        for (const x of ALARM_SIGNS[q]) setSign(s, x.id, "no", "negó en respuesta directa a pregunta cerrada");
        s.alarma.positiva = false;
        s.alarma.detalle = null;
        s.tries = 0;
        turns[0].interpreted = { negacion_verificada: q };
        if (s.alarmIdx + 1 < s.alarmPlan.length) {
          s.alarmIdx += 1;
          return out("en_curso", [currentQuestion(s)!]);
        }
        s.step = "fin";
        return out("completa", closingLines(s.name, s.gender, opts.window));
      }
      s.tries += 1;
      if (s.tries < 2) return out("en_curso", ["Para estar seguros, responda SÍ o NO.", questionFor(q, s.part)]);
      // still unclear: never written as "sin signos de alarma"; a person follows up
      s.alarma.detalle = "No confirmó la respuesta";
      s.pendientes.push("Signos de alarma: la respuesta no fue clara");
      s.step = "fin";
      const examples = ALARM_SIGNS[q].map((x) => x.label.toLowerCase()).join(" o ");
      return out(
        "completa",
        [
          `No pudimos confirmar su respuesta. Si tiene ${examples}, no espere su cita: acuda a emergencia o llame al 106. Avisamos al equipo: una persona le escribirá por este chat.`,
          ...closingLines(s.name, s.gender, opts.window),
        ],
        { type: "alarma", note: "No pudo confirmar los signos de alarma en la preconsulta" },
      );
    }
    default:
      return out("en_curso", []);
  }
}

// ---------------------------------------------------------------- the doctor's summary

export type PreconsultaMeta = {
  sessionId: string;
  channel?: "chat" | "voz";
  respondent?: "paciente" | "acompanante" | null;
  startedAt?: string | null;
  window?: ArrivalWindow | null;
  now?: string;
};

/** Contract summary + what the doctor needs to read it safely (proposal v5.1 §3.1 template). */
export type PreconsultaDetail = PreconsultaSummary & {
  estado: "en_curso" | "completa" | "derivada_emergencia" | "con_persona";
  canal: "chat" | "voz";
  respondio: "paciente" | "acompanante" | null;
  inicioSesion: string | null;
  motivoEstado: FieldState | null;
  inicioEstado: FieldState | null;
  medicamentosEstado: PcState["medsEstado"];
  alergiasEstado: FieldState | null;
  signos: Sign[];
  /** the fixed list of the pre-visit is short: everything else is "no evaluado" */
  otrosSignos: "no_evaluado";
  pendientes: string[];
};

function fieldText(f: Field): string | null {
  if (!f) return null;
  if (f.estado === "no_sabe") return "No sabe";
  if (f.estado === "prefiere_consulta") return "Prefiere decirlo en la consulta";
  return f.valor;
}

export function statusOf(s: PcState): PreconsultaDetail["estado"] {
  return s.step === "fin" ? "completa" : s.step === "emergencia" ? "derivada_emergencia" : s.step === "persona" ? "con_persona" : "en_curso";
}

export function buildSummary(s: PcState, meta: PreconsultaMeta): PreconsultaDetail {
  const done = s.step === "fin";
  return {
    sessionId: meta.sessionId,
    patient: s.name,
    referidoPorElPaciente: true,
    motivo: fieldText(s.motivo),
    inicio: fieldText(s.inicio),
    medicamentos: s.medicamentos.map((m) => ({ ...m })),
    alergias: fieldText(s.alergias),
    alarma: { preguntada: s.alarma.preguntada, positiva: s.alarma.positiva, detalle: s.alarma.detalle },
    derivadoAEmergencia: s.step === "emergencia",
    // the window is only given once the interview ended normally
    ventanaLlegada: done && meta.window ? { ...meta.window, esEstimacion: true } : null,
    actualizado: meta.now ?? new Date().toISOString(),
    estado: statusOf(s),
    canal: meta.channel ?? "chat",
    respondio: meta.respondent ?? null,
    inicioSesion: meta.startedAt ?? null,
    motivoEstado: s.motivo?.estado ?? null,
    inicioEstado: s.inicio?.estado ?? null,
    medicamentosEstado: s.medsEstado,
    alergiasEstado: s.alergias?.estado ?? null,
    signos: s.signos.map((x) => ({ ...x })),
    otrosSignos: "no_evaluado",
    pendientes: [...s.pendientes, ...s.medicamentos.filter((m) => !m.confirmado && s.step !== "confirmar_med").map((m) => `Medicamento sin confirmar: ${m.nombre}`)],
  };
}

/** What a summary field shows: the value, or "No informado" (never an invented value). */
export function shown(v: string | null | undefined) {
  return v == null || v === "" ? "No informado" : v;
}
