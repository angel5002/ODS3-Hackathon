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
   * Noisy-room mode ("modo sala ruidosa", final day): present only when the call must use push-to-talk. The
   * view then draws a "Mantener para hablar" button in place of "Silenciar": pointer down (or Space/Enter down)
   * → start(); pointer up / cancel / lost capture, key up or the window losing focus → end(); `talking` is true
   * while it is held (the button turns ink and the rings follow the microphone). The microphone is muted
   * otherwise. Optional, additive.
   */
  pushToTalk?: PushToTalk;
  /**
   * OPTIONAL (E5 stoic). Scene playback on the projector: the call controls (and the options menu) are hidden;
   * the identification, the time, the circles and the last caption stay. Default false.
   */
  scene?: boolean;
};

export type PushToTalk = { talking: boolean; start: () => void; end: () => void };

/**
 * Set to true by the UI track in the same change that draws the "Mantener para hablar" button from
 * CallViewProps.pushToTalk. While false, the controllers never mute the microphone for push-to-talk (a muted
 * microphone with no button would leave the person unable to speak), even if the noisy-room mode is on.
 * E5 stoic: the "Respira" CallView draws it (src/components/voice/CallView.tsx › HoldToTalk).
 */
export const PUSH_TO_TALK_BUTTON_READY = true;

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
