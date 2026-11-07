// Contract between the voice logic (state machine, LiveVoice, the call screens' controllers) and the
// presentational call UI (E5, hito 3). The UI components receive ONLY these props: they never import the
// ElevenLabs SDK, never call the server and never read the database. Everything they show comes from here.

/** What the call screen is showing. Mapped from the state machine (src/lib/voice/machine.ts) by the controller. */
export type CallPhase =
  | "entrante" // ringing: Contestar / Rechazar
  | "reconectar" // the screen reopened on a call still open: Volver a conectar / Colgar
  | "conectando" // requesting or connecting the voice session
  | "activa" // live voice (see agentSpeaking / thinking / muted)
  | "guion" // the fixed script (text options + browser voice) after the person chose it
  | "finalizando"
  | "finalizada"
  | "ocupado" // another device has the call, or every line is taken (see busy)
  | "sin_conexion"; // "No pudimos conectar la voz": Reintentar / Seguir por chat

export type BusyInfo = { kind: "otro_dispositivo" | "capacidad"; position: number | null };

export type Caption = { id: number; who: "agente" | "persona"; text: string };

/** Text options of the fixed script (phase "guion"). */
export type ScriptOption = { id: string; label: string; tone?: "primary" | "neutral" };

/**
 * Live audio for the visualization. The getters are read inside requestAnimationFrame (never in React state):
 * byte frequency data (0–255 per bin) of the microphone and of the agent's voice, or null when unavailable.
 */
export type AudioLevels = {
  input: () => Uint8Array | null;
  output: () => Uint8Array | null;
};

export type CallActions = {
  answer?: () => void;
  reject?: () => void;
  hangUp: () => void;
  toggleMute?: () => void;
  toggleCaptions: () => void;
  retry?: () => void;
  continueByChat?: () => void;
  talkToPerson?: () => void;
  /** close this screen without touching the call (another device has it) */
  leave?: () => void;
  /**
   * OPTIONAL (E5 stoic). Push-to-talk: called with `true` when the person presses "Mantener para hablar" and with
   * `false` when they release it (pointer up, pointer leaving the button, or the screen losing focus). Only used
   * when `pushToTalk` is true; the controller owns the logic (open/close the microphone).
   */
  holdToTalk?: (pressed: boolean) => void;
};

export type CallViewProps = {
  phase: CallPhase;
  /** "Confirmación de su cita", "Cupo disponible", "Registro de solicitud"… */
  purposeLabel: string;
  /** shown in the identification line, e.g. "Hospital Mirasur" */
  establishment: string;
  /** who is speaking now during "activa" */
  agentSpeaking: boolean;
  /** the person finished and the agent has not answered yet */
  thinking: boolean;
  muted: boolean;
  /** seconds since the voice connected (or the script started) */
  seconds: number;
  captions: Caption[];
  captionsVisible: boolean;
  busy: BusyInfo | null;
  /** short reason for "sin_conexion" (never technical jargon) */
  errorMessage: string | null;
  levels: AudioLevels | null;
  scriptOptions: ScriptOption[];
  onScriptOption?: (id: string) => void;
  actions: CallActions;
  /**
   * OPTIONAL (E5 stoic). Push-to-talk mode: the "Silenciar" control is replaced by a "Mantener para hablar"
   * button that calls `actions.holdToTalk(true/false)`. Default false.
   */
  pushToTalk?: boolean;
  /**
   * OPTIONAL (E5 stoic). Scene playback on the projector: the call controls (and the options menu) are hidden;
   * the identification, the time, the circles and the last caption stay. Default false.
   */
  scene?: boolean;
};

export type VoiceWaveProps = {
  levels: AudioLevels | null;
  /** draw the live wave (false = flat resting line) */
  active: boolean;
  /** whose voice leads the wave: color of the person's microphone or of the agent */
  speaker: "agente" | "persona" | null;
  /** prefers-reduced-motion: static level, no animation */
  reducedMotion?: boolean;
  className?: string;
};

/** Identification and safety lines (propuesta v5.1, sección 4.3). The v5.1 track may refine the wording. */
export const AGENT_IDENTIFICATION = (establishment: string) => `Asistente automatizado del ${establishment}`;
export const SAFETY_LINES = ["Nunca le pedirá pagos, claves, códigos ni su DNI completo.", "Puede pedir hablar con una persona en cualquier momento."];
