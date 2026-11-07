"use client";

// Presentational start screen of the voice registration in /pedir-cita (E5 stoic). The same skeleton as the
// "Respira" call screen, so starting the call only changes what the wave follows: the identification line, the
// breathing wave, one title, one supporting line and one action. No demo notice here (the
// page footer carries it). It receives only these props: no SDK, no server calls. The controller
// (PedirCita › VoiceRegister) mounts it while the voice state is "idle" and passes `ready` (the anonymous chat
// session exists) and `onStart`. Rendered as `absolute inset-0` inside a relative container.
import { DEFAULT_VOICE_THEME, type VoiceTheme } from "@/lib/voice/theme";
import { callIdentification } from "./CallView";
import { Respira } from "./Respira";

export type VoiceStartViewProps = {
  /** the session can start; false shows "Preparando…" on a disabled button */
  ready: boolean;
  onStart: () => void;
  /** visual variant, default "claro" */
  theme?: VoiceTheme;
  /** shown in the identification line; default "Hospital Mirasur" */
  establishment?: string;
  className?: string;
};

export function VoiceStartView({ ready, onStart, theme = DEFAULT_VOICE_THEME, establishment = "Hospital Mirasur", className = "" }: VoiceStartViewProps) {
  return (
    <section
      aria-label="Hablar con el asistente"
      data-voice-theme={theme}
      className={`absolute inset-0 z-20 flex flex-col overflow-hidden bg-vc-bg text-vc-text [container-type:size] ${className}`}
    >
      <p className="w-full shrink-0 px-5 pb-2 pt-[calc(0.875rem+env(safe-area-inset-top,0px))] text-[13px] leading-snug text-vc-text-2 @[400px]:text-[14px]">
        {callIdentification(establishment)}
      </p>

      <div className="relative min-h-0 w-full flex-1">
        {/* the same wave as the call, breathing: starting the call only changes what it follows */}
        <div className="absolute inset-0">
          <Respira mode="listen" levels={null} />
        </div>
      </div>

      <div className="vc-enter mx-auto w-full max-w-[440px] shrink-0 px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-2 text-center">
        <h2 className="text-balance font-display text-[30px] leading-tight">Hablar con el asistente</h2>
        <p className="mx-auto mt-2 max-w-[32ch] text-pretty text-[16px] leading-snug text-vc-text-2">
          Use un nombre ficticio. Nunca le pediremos pagos ni su DNI completo.
        </p>
        <button
          type="button"
          onClick={onStart}
          disabled={!ready}
          className="vc-pill press mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-vc-primary px-5 text-[17px] font-semibold text-vc-on-primary active:bg-vc-primary-press disabled:opacity-60"
        >
          {ready ? "Empezar la llamada" : "Preparando…"}
        </button>
      </div>
    </section>
  );
}
