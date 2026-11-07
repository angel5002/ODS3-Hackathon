"use client";

// Scene 1 · Tito en el hospital (pitch v7 §3). The phone shows Tito's appointment ticket ("en 5 semanas"), then
// rings and plays the AI lines INSIDE the call screen (CallView, the same component of the live calls), with the
// wave following the audio. The two bands of the slide appear with the narrator: "Sin AsistIA" (red) and
// "Con AsistIA" (green). The narrator's and Tito's lines are said live: the screen never shows them.
import { CalendarClock, Clock3, Hospital } from "lucide-react";
import type { Caption, CallViewProps } from "@/lib/voice/contract";
import { CallView } from "@/components/voice/CallView";
import { SCENE_ESTABLISHMENT } from "@/lib/demo/scenes";
import type { SceneController } from "./useSceneController";

const noop = () => {};

/** CallView props for the current line (phase from the cue, captions = the line texts said in the call). */
export function scene1CallProps(c: SceneController): CallViewProps | null {
  const phone = c.line.cue?.phone;
  if (!phone || phone === "ticket") return null;
  const captions: Caption[] = c.shown
    .filter((l) => l.cue?.phone === "activa" && (l.who === "ia" || l.who === "persona"))
    .map((l, i) => ({ id: i + 1, who: l.who === "ia" ? "agente" : "persona", text: l.text }));
  return {
    phase: phone,
    purposeLabel: "Cupo disponible",
    establishment: SCENE_ESTABLISHMENT,
    agentSpeaking: phone === "activa" && c.agentSpeaking,
    thinking: false,
    muted: false,
    seconds: c.callSeconds,
    captions,
    captionsVisible: true,
    busy: null,
    errorMessage: null,
    levels: c.levels,
    scriptOptions: [],
    actions: { hangUp: noop, toggleCaptions: noop, answer: phone === "entrante" ? () => void c.next() : undefined },
  };
}

function Ticket() {
  return (
    <div className="absolute inset-0 flex flex-col bg-paper px-5 py-6 text-ink">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-muted">
        <Hospital className="size-4" aria-hidden /> {SCENE_ESTABLISHMENT}
      </p>
      <div className="mt-auto mb-auto rounded-md border border-line-strong bg-surface p-5">
        <p className="text-[14px] font-semibold uppercase tracking-wide text-muted">Su cita</p>
        <p className="mt-1 text-[26px] font-bold leading-tight">Oncología</p>
        <p className="mt-3 flex items-center gap-2 text-[17px]">
          <CalendarClock className="size-5 text-muted" aria-hidden /> Lunes 20 de noviembre, 9:00
        </p>
        <p className="mt-3 inline-flex items-center gap-2 rounded-sm bg-risk-alto-soft px-2 py-1 text-[17px] font-bold text-risk-alto">
          <Clock3 className="size-5" aria-hidden /> Dentro de 5 semanas
        </p>
      </div>
    </div>
  );
}

function Band({ tone, title, text, show }: { tone: "sin" | "con"; title: string; text: string; show: boolean }) {
  const cls = tone === "sin" ? "border-risk-alto bg-risk-alto-soft text-risk-alto" : "border-st-ok bg-st-ok-soft text-st-ok";
  return (
    <div
      aria-hidden={!show}
      className={`rounded-md border-l-[6px] p-4 transition-opacity duration-300 motion-reduce:transition-none ${cls} ${show ? "opacity-100" : "opacity-0"}`}
    >
      <p className="text-[22px] font-bold leading-tight">{title}</p>
      <p className="mt-1 text-[18px] leading-snug text-ink">{text}</p>
    </div>
  );
}

export type Scene1ViewProps = { controller: SceneController; className?: string };

export function Scene1View({ controller: c, className = "" }: Scene1ViewProps) {
  const call = scene1CallProps(c);
  const band = c.line.cue?.band;
  return (
    <div className={`flex h-full w-full flex-col items-center justify-center gap-6 p-4 lg:flex-row lg:gap-12 ${className}`} data-scene="escena1" data-step={c.line.id} data-index={c.index} data-speaking={c.agentSpeaking ? "1" : "0"}>
      <div
        className="relative aspect-[9/18] h-[min(78vh,760px)] max-h-full shrink-0 overflow-hidden rounded-[28px] border-[10px] border-night bg-paper shadow-xl"
        aria-label="Celular de Tito"
      >
        {call ? <CallView {...call} /> : <Ticket />}
      </div>
      <div className="flex w-full max-w-[460px] flex-col gap-4">
        <Band tone="sin" show={band === "sin" || band === "con"} title="Sin AsistIA" text="Tito espera 5 semanas su consulta de oncología." />
        <Band
          tone="con"
          show={band === "con"}
          title="Con AsistIA"
          text="Un cupo liberado llega a Tito en un par de horas: el personal aprobó la oferta según su categoría clínica."
        />
      </div>
    </div>
  );
}
