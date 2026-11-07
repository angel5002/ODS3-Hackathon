"use client";

// Scene 2 · Preconsulta en la clínica (pitch v7 §4). Left: Tito's phone with the chat (a bubble every 2.4 s).
// Right: the doctor's summary filling in sync. The summary is NOT scripted: Tito's answers of the scene go through
// the real pre-visit machine (src/lib/preconsulta/machine.ts), so the playback shows exactly what the live feature
// does, including the medicine confirmed one by one.
import { useMemo } from "react";
import { Volume2 } from "lucide-react";
import { ESCENA_2_APPOINTMENT } from "@/lib/demo/scenes";
import { arrivalWindow } from "@/lib/preconsulta/arrival";
import { buildSummary, initialState, step, type PcState } from "@/lib/preconsulta/machine";
import { DoctorSummary } from "@/components/preconsulta/DoctorSummary";
import type { SceneController } from "./useSceneController";

const WINDOW = arrivalWindow({ appointment: ESCENA_2_APPOINTMENT });
// a fixed date so the playback is identical every time
const FIXED_NOW = "2023-10-16T15:00:00.000Z";

/** The summary after the answers shown so far (the machine, not a script). */
export function scene2Summary(c: Pick<SceneController, "shown">) {
  let s: PcState = initialState("Tito", "m");
  for (const l of c.shown) if (l.who === "persona" && l.cue?.chat) s = step(s, l.text, { window: WINDOW }).state;
  return buildSummary(s, { sessionId: "escena2", channel: "chat", respondent: "paciente", window: WINDOW, now: FIXED_NOW });
}

export type Scene2ViewProps = { controller: SceneController; className?: string };

export function Scene2View({ controller: c, className = "" }: Scene2ViewProps) {
  const bubbles = c.shown.filter((l) => l.cue?.chat);
  const summary = useMemo(() => scene2Summary(c), [c.shown.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const tapped = bubbles.some((b) => b.cue?.tap);

  return (
    <div className={`flex h-full w-full flex-col items-stretch justify-center gap-6 p-4 lg:flex-row lg:items-center lg:gap-10 ${className}`} data-scene="escena2" data-step={c.line.id} data-index={c.index} data-speaking={c.agentSpeaking ? "1" : "0"}>
      <div
        className="relative mx-auto flex aspect-[9/18] h-[min(78vh,760px)] max-h-full shrink-0 flex-col overflow-hidden rounded-[28px] border-[10px] border-night bg-paper shadow-xl"
        aria-label="Celular de Tito"
      >
        <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
          <p className="text-[15px] font-semibold text-ink">Preconsulta · Clínica</p>
          {c.voice && c.agentSpeaking && (
            <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand">
              <Volume2 className="size-4" aria-hidden /> Leyendo
            </span>
          )}
        </div>
        <p className="px-4 pt-2 text-[12px] leading-snug text-muted">Asistente automatizado de la clínica · no es una consulta médica ni atiende emergencias</p>
        <ol className="flex min-h-0 flex-1 flex-col justify-end gap-2 overflow-hidden px-3 py-3" aria-live="polite">
          {bubbles.map((b) => {
            const ia = b.who === "ia";
            const confirm = ia && /¿Es correcto\?/.test(b.text);
            return (
              <li key={b.id} className={`bubble-in flex ${ia ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[85%] rounded-md px-3 py-2 text-[16px] leading-snug ${
                    ia ? "border border-line bg-surface text-ink" : "bg-brand text-white"
                  } ${b.cue?.tap ? "font-semibold" : ""}`}
                >
                  {confirm ? b.text.replace(" Responda SÍ o NO.", "") : b.text}
                  {confirm && (
                    <div className="mt-2 flex gap-2" aria-hidden>
                      <span className={`rounded-md border px-3 py-1 text-[14px] font-semibold ${tapped ? "border-brand bg-brand text-white" : "border-line-strong text-ink"}`}>Sí</span>
                      <span className="rounded-md border border-line-strong px-3 py-1 text-[14px] font-semibold text-ink">No</span>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <DoctorSummary summary={summary} compact className="mx-auto w-full max-w-[560px]" />
    </div>
  );
}
