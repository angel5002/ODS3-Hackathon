"use client";

// Presentational start screen of the voice registration in /pedir-cita (E5 v2). Same tokens and language as
// the call screen: the resting wave, one title, two short lines, one button and the safety line. It receives
// only these props: no SDK, no server calls. The controller (PedirCita › VoiceRegister) mounts it while the
// voice state is "idle" and passes `ready` (the anonymous chat session exists) and `onStart`.
// It fills its parent (flex-1, full height); give the parent a height or a flex column.
import type { CSSProperties } from "react";
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
  /** shown in the identification line; default "Hospital de demostración" */
  establishment?: string;
  className?: string;
};

export function VoiceStartView({ ready, onStart, theme = DEFAULT_VOICE_THEME, establishment = "Hospital de demostración", className = "" }: VoiceStartViewProps) {
  const i = (n: number) => ({ "--i": n }) as CSSProperties;
  return (
    <section
      aria-label="Hablar con el asistente"
      data-voice-theme={theme}
      className={`@container relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-vc-bg text-vc-text ${className}`}
      style={{ backgroundImage: "linear-gradient(to bottom, var(--vc-bg-2), var(--vc-bg) 62%)" }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[6%] h-[55%]">
        <div className="vc-wash absolute inset-0" style={{ "--vc-wash-color": "var(--vc-agent)", opacity: 0.55 } as CSSProperties} />
      </div>

      <header className="relative mx-auto flex w-full max-w-[600px] shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] text-[13px] leading-tight">
        <span className="rounded-full border border-vc-edge px-2.5 py-1 font-semibold text-vc-text-2">Demostración</span>
        <span className="text-vc-text-2">{callIdentification(establishment)}</span>
      </header>

      <div className="vc-enter relative mx-auto flex w-full max-w-[600px] flex-1 flex-col items-center justify-center px-6 py-4 text-center">
        <div style={i(0)} className="h-36 w-[calc(100%+3rem)] max-w-none @lg:h-48">
          <VoiceWave levels={null} active={false} speaker={null} theme={theme} />
        </div>
        <h2 style={i(1)} className="mt-4 text-balance font-display text-[28px] font-bold leading-tight tracking-[-0.015em] @lg:text-[32px]">
          Hablar con el asistente
        </h2>
        <p style={i(2)} className="mt-2 max-w-[32ch] text-pretty text-[16px] leading-snug text-vc-text-2">
          Le hará las mismas preguntas que el chat, una a la vez. Use un nombre ficticio. No se graba la llamada.
        </p>
        <div style={i(3)} className="mt-7 w-full max-w-[320px]">
          <button
            type="button"
            onClick={onStart}
            disabled={!ready}
            className="vc-pill flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-vc-primary px-5 text-[17px] font-semibold text-vc-on-primary active:bg-vc-primary-press disabled:opacity-60"
          >
            <Mic className="size-5" aria-hidden />
            {ready ? "Empezar la llamada" : "Preparando…"}
          </button>
          <p className="mt-2 text-[13px] text-vc-text-3">Se pedirá permiso para usar el micrófono.</p>
        </div>
      </div>

      <p className="relative shrink-0 text-balance px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-2 text-center text-[12px] leading-snug text-vc-text-3 @md:text-[13px]">
        <ShieldCheck className="mr-1 inline size-4 align-[-3px] text-vc-icon" aria-hidden />
        {CALL_SAFETY_LINE}
      </p>
    </section>
  );
}
