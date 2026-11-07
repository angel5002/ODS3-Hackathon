// Contract between the parallel E5 tracks for the final (pitch v7, insumos/AsistIA_Guion_Pitch_v7.pdf):
//   - /demo presentation mode (track D) shows the moments of the script and READS what the jury does;
//   - the jury live interaction (track E) issues the printed cards (unique tokens) and WRITES their actions;
//   - the scenes (track C) play the AI lines back inside the "Respira" call screen and run the pre-visit.
// Nothing here talks to the database: these are the shapes the routes return and the components receive.

/** The moments of the script that /demo can project, in order (keyboard ← →). */
export type PresentationMoment = "qr" | "escena1" | "jurado" | "escena2" | "etapas";
export const PRESENTATION_ORDER: PresentationMoment[] = ["qr", "escena1", "jurado", "escena2", "etapas"];

// ---------------------------------------------------------------- jury cards (track E)

/** One printed card: a unique token and a fictitious character with a 2–3 line story. */
export type JuryCard = {
  /** opaque token in the QR (unique per card) */
  token: string;
  /** character's first name, e.g. "Carmen" */
  character: string;
  /** who the person is and what happens to them (≤ 2 lines) */
  story: string;
  /** what they can try (1 line), e.g. "Avise que no podrá ir a su cita del jueves" */
  tryLine: string;
  /** how the card is meant to be used */
  channel: "voz" | "chat" | "voz_o_chat";
  /** URL the QR opens (relative), e.g. "/j/<token>" */
  path: string;
};

export type JuryActivityKind =
  | "abrio"
  | "confirmo"
  | "cancelo"
  | "pidio_cita"
  | "categorizada"
  | "oferta"
  | "acepto"
  | "rechazo"
  | "llamada_inicio"
  | "llamada_fin"
  | "chat";

/** One thing a jury member did (newest first in the overview). No personal data: fictitious characters only. */
export type JuryActivity = {
  token: string;
  character: string;
  kind: JuryActivityKind;
  /** short plain-Spanish sentence for the projector, e.g. "Carmen avisó que no podrá ir" */
  text: string;
  at: string; // ISO
};

/** GET /api/staff/data?view=jurado (staff only). */
export type JuryOverview = {
  cards: (JuryCard & { state: "sin_abrir" | "abierta" | "en_curso" | "completo"; lastAt: string | null })[];
  activity: JuryActivity[];
  /** Carmen's released slot and who got it (scene 1 hand-off), when it happened */
  carmenSlot: { slotId: number; specialty: string; when: string; state: "libre" | "ofrecido" | "asignado"; assignedTo: string | null } | null;
  /** requests created by the jury during the demo, with their waiting-list position */
  newRequests: { code: string; character: string; specialty: string; category: string | null; position: number | null; state: string }[];
};

// ---------------------------------------------------------------- scenes (track C)

export type SceneId = "escena1" | "escena2";

export type SceneLine = {
  id: string;
  who: "ia" | "persona" | "narrador" | "pantalla";
  text: string;
  /** pre-generated audio of the AI line (same voice_id as the agents), served from /public */
  audio?: string;
  /** scene 2: the chat advances every 2.4 s */
  afterMs?: number;
};

export type Scene = { id: SceneId; title: string; lines: SceneLine[] };

/** Pre-visit summary for the doctor (proposal v5.1 §4.1–4.2): required fields, "no informado" when missing,
 *  verified negations, medicines confirmed one by one, never a diagnosis or a suggested test. */
export type PreconsultaSummary = {
  sessionId: string;
  patient: string;
  referidoPorElPaciente: true;
  motivo: string | null;
  inicio: string | null;
  medicamentos: { nombre: string; confirmado: boolean }[];
  alergias: string | null; // "ninguna" is a verified negation; null = "no informado"
  alarma: { preguntada: boolean; positiva: boolean; detalle: string | null };
  derivadoAEmergencia: boolean;
  ventanaLlegada: { desde: string; hasta: string; atrasoMin: number; esEstimacion: true } | null;
  actualizado: string; // ISO
};
