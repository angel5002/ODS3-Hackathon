// /demo presentation mode: stand-in data while the other E5 tracks land (contract: src/lib/demo/contract.ts).
// - JURY_FIXTURE replaces GET /api/staff/data?view=jurado (track E) while that view answers 4xx.
// - SCENE1 / SCENE2 are the lines of the pitch script v7 (sections 3 and 4) until track C ships its scenes.
// - summaryAt() builds the doctor summary step by step, in sync with the scene 2 chat (track C's component renders it).
// Every screen that shows fixture data says so ("Datos de ejemplo"): nothing here is presented as a real figure.
import type { JuryOverview, PreconsultaSummary, Scene } from "@/lib/demo/contract";

/** fictitious first names only; times are relative to when the page opened */
export function juryFixture(t0: number): JuryOverview {
  const at = (minAgo: number) => new Date(t0 - minAgo * 60000).toISOString();
  return {
    cards: [
      { token: "ej-carmen", character: "Carmen", story: "", tryLine: "", channel: "chat", path: "/j/ej-carmen", state: "completo", lastAt: at(3) },
      { token: "ej-rosa", character: "Rosa", story: "", tryLine: "", channel: "voz", path: "/j/ej-rosa", state: "en_curso", lastAt: at(2) },
      { token: "ej-julio", character: "Julio", story: "", tryLine: "", channel: "chat", path: "/j/ej-julio", state: "abierta", lastAt: at(1) },
      { token: "ej-lucia", character: "Lucía", story: "", tryLine: "", channel: "voz_o_chat", path: "/j/ej-lucia", state: "sin_abrir", lastAt: null },
      { token: "ej-mario", character: "Mario", story: "", tryLine: "", channel: "chat", path: "/j/ej-mario", state: "sin_abrir", lastAt: null },
    ],
    activity: [
      { token: "ej-julio", character: "Julio", kind: "pidio_cita", text: "Julio pidió una cita de Dermatología", at: at(1) },
      { token: "ej-rosa", character: "Rosa", kind: "llamada_inicio", text: "El asistente llama a Rosa", at: at(2) },
      { token: "ej-carmen", character: "Carmen", kind: "cancelo", text: "Carmen avisó que no podrá ir", at: at(3) },
      { token: "ej-carmen", character: "Carmen", kind: "abrio", text: "Carmen abrió su cartilla", at: at(4) },
    ],
    carmenSlot: { slotId: 0, specialty: "Oncología", when: "mañana 9:00", state: "libre", assignedTo: null },
    newRequests: [
      { code: "S-EJ1", character: "Julio", specialty: "Dermatología", category: "P3", position: 4, state: "priorizada_sin_cupo" },
      { code: "S-EJ2", character: "Lucía", specialty: "Cardiología", category: "P2", position: 2, state: "priorizada_sin_cupo" },
      { code: "S-EJ3", character: "Mario", specialty: "Traumatología", category: null, position: null, state: "pendiente_regulacion" },
    ],
  };
}

/** scene 1 (script v7, section 3): the AI lines the call screen says out loud */
export const SCENE1: Scene = {
  id: "escena1",
  title: "Tito en el hospital",
  lines: [
    { id: "n1", who: "narrador", text: "Él es Tito. Tiene 62 años y su médico le pidió una consulta de oncología cuanto antes." },
    { id: "t1", who: "persona", text: "¿Cinco semanas? ¡Me dieron cita para dentro de cinco semanas!" },
    { id: "ia1", who: "ia", text: "Buenos días, Tito. Le habla el asistente automatizado del hospital. Se liberó un cupo de oncología para mañana a las 9:00. ¿Desea tomarlo?" },
    { id: "t2", who: "persona", text: "¡Sí, sí lo quiero!" },
    { id: "ia2", who: "ia", text: "Listo. Su cita quedó reservada para mañana a las 9:00." },
  ],
};

/** scene 2 (script v7, section 4): one chat message every 2.4 s, the last one at 24 s; the summary closes at 26 s */
export const SCENE2: Scene = {
  id: "escena2",
  title: "Preconsulta en la clínica",
  lines: [
    { id: "a1", who: "ia", text: "Hola, Tito. Antes de su cita, ¿qué molestia quiere consultar?", afterMs: 2400 },
    { id: "p1", who: "persona", text: "Me duele la rodilla derecha desde hace una semana.", afterMs: 2400 },
    { id: "a2", who: "ia", text: "¿Tomó algún medicamento? ¿Tiene alergias?", afterMs: 4800 },
    { id: "p2", who: "persona", text: "Ibuprofeno. Alergias, ninguna.", afterMs: 2400 },
    { id: "a3", who: "ia", text: "¿Tiene fiebre, o la rodilla está muy hinchada o caliente?", afterMs: 4800 },
    { id: "p3", who: "persona", text: "No.", afterMs: 2400 },
    { id: "a4", who: "ia", text: "Gracias, Tito. Su médico lo recibirá con este resumen. Su consultorio va con 20 min de atraso: llegue entre 10:20 y 10:35.", afterMs: 4800 },
  ],
};

/** when each chat message of scene 2 appears (ms from the start of the moment) */
export const SCENE2_AT = SCENE2.lines.reduce<number[]>((acc, l) => [...acc, (acc.at(-1) ?? 0) + (l.afterMs ?? 2400)], []);
/** the summary fields fill 2.4 s after the answer that gives them; the arrival window closes the scene at 26.4 s */
export const SUMMARY_AT = { motivo: 7200, medicamentos: 14400, alarma: 21600, ventana: 26400 } as const;

export function summaryAt(ms: number): PreconsultaSummary {
  const motivo = ms >= SUMMARY_AT.motivo;
  const meds = ms >= SUMMARY_AT.medicamentos;
  const alarma = ms >= SUMMARY_AT.alarma;
  return {
    sessionId: "ejemplo",
    patient: "Tito",
    referidoPorElPaciente: true,
    motivo: motivo ? "Dolor de rodilla derecha" : null,
    inicio: motivo ? "Hace una semana" : null,
    medicamentos: meds ? [{ nombre: "Ibuprofeno", confirmado: true }] : [],
    alergias: meds ? "ninguna" : null,
    alarma: { preguntada: alarma, positiva: false, detalle: alarma ? "Niega fiebre, hinchazón y calor" : null },
    derivadoAEmergencia: false,
    ventanaLlegada: ms >= SUMMARY_AT.ventana ? { desde: "10:20", hasta: "10:35", atrasoMin: 20, esEstimacion: true } : null,
    actualizado: new Date(0).toISOString(),
  };
}
