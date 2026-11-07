// The two scenes of the final pitch (insumos/AsistIA_Guion_Pitch_v7.pdf §3 and §4), as data for the playback
// (src/components/scenes). The AI lines are the EXACT script text with the fictitious "Hospital Mirasur", spoken by
// pre-generated audio with the agents' own voice and model (scripts/scene-audio.mjs, no edits). The lines of the
// narrator and of Tito are said live by the team: the screen does not show them (they only set the pace).
// Pure: types only are imported, so it is tested with node --test (tests/scenes.test.ts).
import type { Scene, SceneId, SceneLine } from "./contract";

/** What the screen does at a line (the playback reads it; the contract's SceneLine stays as is). */
export type SceneCue = {
  /** scene 1: what the phone shows */
  phone?: "ticket" | "entrante" | "activa" | "finalizada";
  /** scene 1: the "Sin AsistIA" / "Con AsistIA" bands */
  band?: "sin" | "con";
  /** scene 2: the line is a chat bubble (ia or persona) and is fed to the pre-visit machine (persona) */
  chat?: boolean;
  /** scene 2: a tap on a button instead of typed text */
  tap?: boolean;
};

export type SceneStep = SceneLine & {
  cue?: SceneCue;
  /** measured length of the audio file (ffprobe), to pace the chat and to measure the scene */
  audioMs?: number;
};

export type PlayableScene = Scene & { lines: SceneStep[]; targetSeconds: number };

export const SCENE_ESTABLISHMENT = "Hospital Mirasur";

/** Scene 1 · Tito en el hospital (about 35 s): the presenter advances each line with a key. */
export const ESCENA_1: PlayableScene = {
  id: "escena1",
  title: "Tito en el hospital",
  targetSeconds: 35,
  lines: [
    { id: "n1", who: "narrador", text: "Él es Tito. Tiene 62 años y su médico le pidió una consulta de oncología cuanto antes.", cue: { phone: "ticket" } },
    { id: "t1", who: "persona", text: "¿Cinco semanas? ¡Me dieron cita para dentro de cinco semanas!", cue: { phone: "ticket" } },
    {
      id: "n2",
      who: "narrador",
      text: "Sin AsistIA, Tito espera. Y en cáncer, cada semana cuenta. Pero hoy, una paciente avisó que no podrá ir a su cita.",
      cue: { phone: "ticket", band: "sin" },
    },
    { id: "s1", who: "pantalla", text: "Suena el celular de Tito.", cue: { phone: "entrante", band: "sin" } },
    {
      id: "ia1",
      who: "ia",
      text: "Buenos días, Tito. Le habla el asistente automatizado del Hospital Mirasur. Se liberó un cupo de oncología para mañana a las 9:00. ¿Desea tomarlo?",
      audio: "/escenas/e1-oferta.mp3",
      audioMs: 8800,
      cue: { phone: "activa", band: "sin" },
    },
    { id: "t2", who: "persona", text: "¡Sí, sí lo quiero!", cue: { phone: "activa", band: "sin" } },
    {
      id: "ia2",
      who: "ia",
      text: "Listo. Su cita quedó reservada para mañana a las 9:00.",
      audio: "/escenas/e1-reservada.mp3",
      audioMs: 4000,
      cue: { phone: "activa", band: "con" },
    },
    {
      id: "n3",
      who: "narrador",
      text: "Tito no usa WhatsApp, por eso AsistIA lo llamó. Y el cupo le llegó porque el personal lo priorizó por su condición clínica.",
      cue: { phone: "finalizada", band: "con" },
    },
  ],
};

/** Medicine confirmation (proposal v5.1 §4.2): on screen only, Tito taps "Sí". The AI's spoken lines are unchanged. */
export const CONFIRM_MED_TEXT = "Anoté: Ibuprofeno. ¿Es correcto? Responda SÍ o NO.";

/** Scene 2 · Preconsulta en la clínica (about 35 s): after the presenter starts it, the chat advances every 2.4 s. */
export const ESCENA_2: PlayableScene = {
  id: "escena2",
  title: "Preconsulta en la clínica",
  targetSeconds: 35,
  lines: [
    { id: "n1", who: "narrador", text: "Tito ya está en tratamiento. Hoy le duele la rodilla y reservó en una clínica." },
    {
      id: "ia1",
      who: "ia",
      text: "Hola, Tito. Antes de su cita, ¿qué molestia quiere consultar?",
      audio: "/escenas/e2-motivo.mp3",
      audioMs: 3680,
      cue: { chat: true },
    },
    { id: "t1", who: "persona", text: "Me duele la rodilla derecha desde hace una semana.", afterMs: 2400, cue: { chat: true } },
    {
      id: "ia2",
      who: "ia",
      text: "¿Tomó algún medicamento? ¿Tiene alergias?",
      audio: "/escenas/e2-medicamentos.mp3",
      audioMs: 2720,
      afterMs: 2400,
      cue: { chat: true },
    },
    { id: "t2", who: "persona", text: "Ibuprofeno. Alergias, ninguna.", afterMs: 2400, cue: { chat: true } },
    { id: "ia3", who: "ia", text: CONFIRM_MED_TEXT, afterMs: 2400, cue: { chat: true } },
    { id: "t3", who: "persona", text: "Sí", afterMs: 1200, cue: { chat: true, tap: true } },
    {
      id: "ia4",
      who: "ia",
      text: "¿Tiene fiebre, o la rodilla está muy hinchada o caliente?",
      audio: "/escenas/e2-alarma.mp3",
      audioMs: 3920,
      afterMs: 2400,
      cue: { chat: true },
    },
    { id: "t4", who: "persona", text: "No.", afterMs: 2400, cue: { chat: true } },
    {
      id: "ia5",
      who: "ia",
      text: "Gracias, Tito. Su médico lo recibirá con este resumen. Su consultorio va con 20 min de atraso: llegue entre 10:20 y 10:35.",
      audio: "/escenas/e2-cierre.mp3",
      audioMs: 8800,
      afterMs: 2400,
      cue: { chat: true },
    },
    {
      id: "n2",
      who: "narrador",
      text: "El médico recibe este resumen antes de verlo, marcado como ‘referido por el paciente’. No diagnostica: si Tito hubiera tenido fiebre, lo derivaba a emergencia.",
    },
  ],
};

export const SCENES: Record<SceneId, PlayableScene> = { escena1: ESCENA_1, escena2: ESCENA_2 };

/** Tito's appointment time in scene 2 (the arrival window of the script comes from it: 10:20 to 10:35). */
export const ESCENA_2_APPOINTMENT = "10:15";

/** Gap after an AI audio before the next chat bubble (the voice is never cut nor overlapped). */
export const AFTER_AUDIO_GAP_MS = 300;

/** Spoken length of a live line (narrator, Tito): ~2.6 words per second, the pace of a calm presentation. */
export function spokenMs(text: string) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.round((words / 2.6) * 1000);
}

/** How long a line occupies the stage: its audio, or the time a person needs to say it, or a beat for the screen. */
export function lineMs(line: SceneStep) {
  if (line.audioMs) return line.audioMs;
  if (line.who === "pantalla") return 2000; // the ring
  if (line.cue?.tap) return 600;
  return spokenMs(line.text);
}

/**
 * When each AUTO line starts, relative to the first line of its run (lines with afterMs follow the previous one
 * automatically). With voice, a bubble waits for the previous AI audio to finish (+ gap): the voice is not cut.
 */
export function autoDelay(prev: SceneStep, next: SceneStep, voice: boolean) {
  const after = next.afterMs ?? 0;
  if (!voice || !prev.audio || !prev.audioMs) return after;
  return Math.max(after, prev.audioMs + AFTER_AUDIO_GAP_MS);
}

/** Estimated length of a whole scene: manual lines take the time to say them, auto lines follow the chat pace. */
export function estimateScene(scene: PlayableScene, voice = true) {
  let total = 0;
  const lines: SceneStep[] = scene.lines;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const nextAuto = lines[i + 1]?.afterMs != null;
    if (nextAuto) total += autoDelay(l, lines[i + 1], voice);
    else total += voice || !l.audio ? lineMs(l) : spokenMs(l.text);
  }
  return total;
}

/** The chat part of scene 2 alone (from the first bubble to the last), for the "ends at 26 s" check. */
export function chatSpanMs(scene: PlayableScene, voice = true) {
  const lines: SceneStep[] = scene.lines;
  const first = lines.findIndex((l) => l.cue?.chat);
  let last = first;
  for (let i = first; i < lines.length; i++) if (lines[i].cue?.chat) last = i;
  let t = 0;
  for (let i = first + 1; i <= last; i++) t += autoDelay(lines[i - 1], lines[i], voice);
  return t + (voice ? lines[last].audioMs ?? 0 : 0);
}
