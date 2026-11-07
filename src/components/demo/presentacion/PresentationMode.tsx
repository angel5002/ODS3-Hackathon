"use client";

// /demo PRESENTATION mode: the projected screen. One view per moment of the pitch script v7, in order
// (PRESENTATION_ORDER). Keys: ← → (and PageUp/PageDown from a clicker) move, 1–3 jump (the current number restarts
// the moment), F fullscreen, Space advances the scene on the two scene moments. E toggles the REHEARSAL mode (operator
// only, a tiny indicator in the footer): the scenes play back without logging steps nor reading live slot data, and R
// restarts the current scene from the beginning. Rehearsal never writes to the database. It covers the staff header and footer
// and keeps one footer line: the demo notice.
import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, SlidersHorizontal } from "lucide-react";
import { Wordmark } from "@/components/Brand";
import { DISCLAIMER } from "@/lib/labels";
import { PRESENTATION_ORDER, type PresentationMoment } from "@/lib/demo/contract";
import type { DemoOverview } from "@/lib/demo-overview";
import { useNow } from "@/lib/realtime";
import { useJuryOverview } from "./hooks";
import { JuryMoment, QrMoment, Scene1Moment, Scene2Moment, StagesMoment } from "./moments";
import type { SceneController } from "./slots";
import { PresentationTheme } from "./theme";

export const MOMENT_LABEL: Record<PresentationMoment, string> = {
  qr: "QR y cartillas",
  escena1: "Escena 1",
  jurado: "Jurado en vivo",
  escena2: "Escena 2",
  etapas: "Etapas",
};

export function isMoment(x: unknown): x is PresentationMoment {
  return typeof x === "string" && (PRESENTATION_ORDER as string[]).includes(x);
}

type Props = {
  moment: PresentationMoment;
  onMoment: (m: PresentationMoment) => void;
  onExit: () => void;
  overview: DemoOverview | null;
  chatQr: { url: string; svg: string } | null;
};

export function PresentationMode({ moment, onMoment, onExit, overview, chatQr }: Props) {
  const [runKey, setRunKey] = useState(0);
  const [ensayo, setEnsayo] = useState(false);
  const controllerRef = useRef<SceneController | null>(null);
  const now = useNow(15000);
  // the jury read runs from the first moment (the card counter) to the jury moment
  const { data: jury, source } = useJuryOverview(moment === "qr" || moment === "escena1" || moment === "jurado");

  const go = useCallback(
    (m: PresentationMoment) => {
      if (m === moment) setRunKey((k) => k + 1);
      else onMoment(m);
    },
    [moment, onMoment],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName))) return;
      const idx = PRESENTATION_ORDER.indexOf(moment);
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        if (idx < PRESENTATION_ORDER.length - 1) onMoment(PRESENTATION_ORDER[idx + 1]);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        if (idx > 0) onMoment(PRESENTATION_ORDER[idx - 1]);
      } else if (/^[1-9]$/.test(e.key)) {
        const m = PRESENTATION_ORDER[Number(e.key) - 1];
        if (m) go(m);
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
      } else if (e.key === "e" || e.key === "E") {
        setEnsayo((v) => !v);
        setRunKey((k) => k + 1);
      } else if ((e.key === "r" || e.key === "R") && ensayo) {
        setRunKey((k) => k + 1);
      } else if (e.key === " " && controllerRef.current) {
        e.preventDefault();
        controllerRef.current.next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moment, onMoment, go, ensayo]);

  // nothing scrolls behind the projected screen
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.overflow;
    el.style.overflow = "hidden";
    return () => {
      el.style.overflow = prev;
    };
  }, []);

  const idx = PRESENTATION_ORDER.indexOf(moment);
  return (
    <div className="pr-root fixed inset-0 z-40 flex flex-col overflow-hidden max-[900px]:overflow-y-auto" role="region" aria-label="Modo presentación">
      <PresentationTheme />
      <header className="flex shrink-0 items-center gap-[1em] px-[2.4em] pt-[0.9em] max-[900px]:flex-wrap max-[900px]:px-[1em]">
        <Wordmark className="text-[1em]" />
        <nav aria-label="Momentos de la presentación" className="ml-auto flex min-w-0 gap-[0.3em] max-[900px]:order-last max-[900px]:w-full max-[900px]:overflow-x-auto">
          {PRESENTATION_ORDER.map((m, n) => (
            <button
              key={m}
              type="button"
              onClick={() => go(m)}
              aria-current={m === moment ? "step" : undefined}
              className={`flex shrink-0 items-center gap-[0.4em] border-b-[0.15em] px-[0.5em] pb-[0.25em] pt-[0.2em] text-[0.75em] font-semibold transition-colors duration-200 ${
                m === moment ? "border-(--pr-ink) text-(--pr-ink)" : n < idx ? "border-(--pr-line) text-(--pr-muted)" : "border-transparent text-(--pr-muted)"
              }`}
            >
              <span className="tabular-nums">{n + 1}</span>
              <span>{MOMENT_LABEL[m]}</span>
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => {
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
            else document.documentElement.requestFullscreen().catch(() => {});
          }}
          title="Pantalla completa (F)"
          aria-label="Pantalla completa"
          className="grid size-[2em] shrink-0 place-items-center rounded-[0.4em] text-(--pr-muted) hover:bg-(--pr-soft) hover:text-(--pr-ink)"
        >
          <Maximize className="size-[0.9em]" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onExit}
          className="inline-flex min-h-[2em] shrink-0 items-center gap-[0.4em] rounded-[0.4em] border border-(--pr-line) px-[0.7em] text-[0.75em] font-semibold hover:bg-(--pr-soft)"
        >
          <SlidersHorizontal className="size-[1.1em]" aria-hidden /> Operar
        </button>
      </header>

      <main className="min-h-0 flex-1">
        {moment === "qr" && <QrMoment key={`qr-${runKey}`} qr={chatQr} jury={jury} source={source} />}
        {moment === "escena1" && <Scene1Moment key={`e1-${runKey}`} jury={jury} source={source} controllerRef={controllerRef} rehearsal={ensayo} />}
        {moment === "jurado" && <JuryMoment key={`j-${runKey}`} jury={jury} source={source} now={now} />}
        {moment === "escena2" && <Scene2Moment key={`e2-${runKey}`} controllerRef={controllerRef} rehearsal={ensayo} />}
        {moment === "etapas" && <StagesMoment key={`et-${runKey}`} overview={overview} />}
      </main>

      <footer className="flex shrink-0 items-baseline justify-between gap-[1em] px-[2.4em] pb-[0.7em] max-[900px]:px-[1em]">
        <p className="text-[0.7em] leading-snug text-(--pr-muted)">{DISCLAIMER}</p>
        {ensayo && (
          <p className="shrink-0 text-[0.55em] font-semibold text-(--pr-muted)" title="Modo ensayo: no registra nada. R reinicia la escena, E sale.">
            Ensayo · R
          </p>
        )}
      </footer>
    </div>
  );
}
