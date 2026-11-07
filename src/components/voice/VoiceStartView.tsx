"use client";

// Presentational start screen of the voice registration in /pedir-cita (E5 estilo). Same tokens and language as
// the call screen: the identification, the resting wave, one title, two short lines, one button and the safety
// line. No demo notice here (the page footer carries it). Flat: no wash, no gradient. It receives
// only these props: no SDK, no server calls. The controller (PedirCita › VoiceRegister) mounts it while the
// voice state is "idle" and passes `ready` (the anonymous chat session exists) and `onStart`.
// Like CallView it is rendered as `absolute inset-0` inside a relative container (the <main> of the voice view,
// whatever its padding), so it always takes the full available height.
import { Mic, ShieldCheck } from "lucide-react";
import { DEFAULT_VOICE_THEME, type VoiceTheme } from "@/lib/voice/theme";
import { CALL_SAFETY_LINE, callIdentification } from "./CallView";
import { VoiceWave } from "./VoiceWave";

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
      className={`@container absolute inset-0 z-20 flex flex-col overflow-hidden bg-vc-bg text-vc-text ${className}`}
    >
      <header className="relative w-full shrink-0 border-b border-vc-line">
        <p className="mx-auto w-full max-w-[600px] px-4 pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top,0px))] text-center text-[14px] leading-snug text-vc-text-2">
          {callIdentification(establishment)}
        </p>
      </header>

      <div className="vc-enter relative mx-auto flex w-full max-w-[600px] flex-1 flex-col items-center justify-center px-6 py-4 text-center">
        <div className="h-32 w-[calc(100%+3rem)] max-w-none @lg:h-44">
          <VoiceWave levels={null} active={false} speaker={null} theme={theme} />
        </div>
        <h2 className="mt-4 text-balance text-[26px] font-bold leading-tight @lg:text-[30px]">Hablar con el asistente</h2>
        <p className="mt-2 max-w-[32ch] text-pretty text-[17px] leading-snug text-vc-text-2">
          Le hará las mismas preguntas que el chat, una a la vez. Use un nombre ficticio. No se graba la llamada.
        </p>
        <div className="mt-7 w-full max-w-[320px]">
          <button
            type="button"
            onClick={onStart}
            disabled={!ready}
            className="vc-pill flex min-h-14 w-full items-center justify-center gap-2 rounded-md bg-vc-primary px-5 text-[17px] font-semibold text-vc-on-primary active:bg-vc-primary-press disabled:opacity-60"
          >
            <Mic className="size-5" aria-hidden />
            {ready ? "Empezar la llamada" : "Preparando…"}
          </button>
          <p className="mt-2 text-[14px] text-vc-text-3">Se pedirá permiso para usar el micrófono.</p>
        </div>
      </div>

      <p className="relative shrink-0 text-balance px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-2 text-center text-[13px] leading-snug text-vc-text-3 @md:text-[14px]">
        <ShieldCheck className="mr-1 inline size-4 align-[-3px] text-vc-icon" aria-hidden />
        {CALL_SAFETY_LINE}
      </p>
    </section>
  );
}
