// /demo presentation mode: stand-in data while the other E5 tracks land (contract: src/lib/demo/contract.ts).
// - JURY_FIXTURE replaces GET /api/staff/data?view=jurado (track E) while that view answers 4xx.
// - SCENE1 / SCENE2 are track C's scene definitions (src/lib/demo/scenes.ts: exact AI lines with their audio); the doctor
//   summary of scene 2 comes from the real pre-visit machine (scene2Summary in src/components/scenes).
// Every screen that shows fixture data says so ("Datos de ejemplo"): nothing here is presented as a real figure.
import type { JuryOverview } from "@/lib/demo/contract";
import { ESCENA_1, ESCENA_2 } from "@/lib/demo/scenes";

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

/** scene 1 (script v7, section 3), with the pre-generated audio of the two AI lines */
export const SCENE1 = ESCENA_1;
/** scene 2 (script v7, section 4): the chat advances every 2.4 s once the presenter starts it */
export const SCENE2 = ESCENA_2;
