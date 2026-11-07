"use client";

// Development playground for the call screen: CallView with SIMULATED audio (smooth fake frequency data that
// alternates between the person and the agent) and a selector for every state. It never touches the
// database, the voice provider or the server.
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CallView } from "@/components/voice/CallView";
import { VoiceStartView } from "@/components/voice/VoiceStartView";
import type { AudioLevels, BusyInfo, CallPhase, CallViewProps, Caption, ScriptOption } from "@/lib/voice/contract";
import { DISCLAIMER } from "@/lib/labels";
import { PLAYGROUND_STATES, type PlaygroundState } from "./states";

type Voice = "agente" | "persona" | "silencio";

const BINS = 128;
const TAU = Math.PI * 2;

/** Smooth, speech-like spectrum: syllables (~4 Hz) inside phrases (~0.4 Hz), energy falling with frequency. */
function fillVoice(buf: Uint8Array, t: number, seed: number, gain: number) {
  const syll = Math.max(0, Math.sin(t * TAU * 4.1 + seed) * 0.6 + Math.sin(t * TAU * 2.6 + seed * 2.3) * 0.4 + 0.15);
  const phrase = 0.55 + 0.45 * Math.sin(t * TAU * 0.37 + seed);
  const env = Math.min(1, syll * phrase * gain * 1.6);
  for (let i = 0; i < BINS; i++) {
    const shape = Math.exp(-i / (12 + seed * 3)) * (0.78 + 0.22 * Math.sin(i * 1.7 + t * 9));
    const noise = 0.5 + 0.5 * Math.sin(i * 0.9 + t * 11.3 + seed) * Math.sin(i * 0.37 - t * 6.1);
    buf[i] = Math.max(0, Math.min(255, Math.round(255 * env * shape * (0.6 + 0.4 * noise) * 1.35)));
  }
}

const CONVERSATION: { who: Caption["who"]; text: string }[] = [
  {
    who: "agente",
    text: "Hola, le habla el asistente automatizado del Hospital de demostración. Le llamo para confirmar su cita de Cardiología del jueves 19 a las 9:00.",
  },
  { who: "persona", text: "Sí, ahí estaré." },
  { who: "agente", text: "Perfecto, queda confirmada. Lleve su documento de identidad y llegue 20 minutos antes." },
  { who: "persona", text: "¿Puedo ir con un acompañante?" },
  { who: "agente", text: "Sí, puede ir con una persona. ¿Le ayudo con algo más?" },
];

/** turns of the simulated conversation: who speaks, for how long, and the caption it adds */
const TURNS: { voice: Voice | "piensa"; ms: number; caption?: number }[] = [
  { voice: "agente", ms: 4200, caption: 0 },
  { voice: "persona", ms: 2400, caption: 1 },
  { voice: "piensa", ms: 1100 },
  { voice: "agente", ms: 3600, caption: 2 },
  { voice: "persona", ms: 2600, caption: 3 },
  { voice: "piensa", ms: 1000 },
  { voice: "agente", ms: 3200, caption: 4 },
  { voice: "persona", ms: 2200 },
];

const SCRIPT_OPTIONS: ScriptOption[] = [
  { id: "confirma", label: "Sí, asistiré", tone: "primary" },
  { id: "libera", label: "No podré asistir", tone: "neutral" },
  { id: "reprograma", label: "Quiero otra fecha", tone: "neutral" },
];

const GUION_FIRST: Caption[] = [
  { id: 1, who: "agente", text: "Le llamo para confirmar su cita de Cardiología del jueves 19 a las 9:00. ¿Podrá asistir?" },
];

const captionsUpTo = (n: number): Caption[] => CONVERSATION.slice(0, n).map((c, i) => ({ id: i + 1, ...c }));

export function CallPlayground({
  initial,
  frame: initialFrame,
  panel,
  captions: initialCaptions,
  muted: initialMuted,
}: {
  initial: PlaygroundState;
  frame: "pantalla" | "telefono" | "pedir";
  panel: boolean;
  captions: boolean;
  muted: boolean;
}) {
  const [state, setState] = useState<PlaygroundState>(initial);
  const [frame, setFrame] = useState<"pantalla" | "telefono" | "pedir">(initialFrame);
  const [captionsVisible, setCaptionsVisible] = useState(initialCaptions);
  const [muted, setMuted] = useState(initialMuted);
  const [seconds, setSeconds] = useState(initial === "finalizada" ? 94 : initial === "finalizando" ? 41 : initial.startsWith("activa") || initial === "guion" ? 37 : 0);
  const [turn, setTurn] = useState(0);
  const [scriptCaptions, setScriptCaptions] = useState<Caption[]>(() => (initial === "guion" ? GUION_FIRST : []));
  const [sheetOpen, setSheetOpen] = useState(false);
  const voice = useRef<Voice>("silencio");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const start = state === "inicio-voz";
  const phase: CallPhase = start
    ? "entrante"
    : state.startsWith("activa")
      ? "activa"
      : state.startsWith("ocupado")
        ? "ocupado"
        : (state as CallPhase);
  const auto = state === "activa-auto";
  const t = TURNS[turn % TURNS.length];
  const agentSpeaking = state === "activa-habla" || (auto && t.voice === "agente");
  const thinking = state === "activa-piensa" || (auto && t.voice === "piensa");

  // which simulated voice the getters produce (read inside the wave's animation frame)
  useEffect(() => {
    voice.current = phase === "activa" ? (agentSpeaking ? "agente" : thinking ? "silencio" : "persona") : "silencio";
  }, [phase, agentSpeaking, thinking]);

  // simulated conversation: advance turns on a timer (React state changes per turn, never per frame)
  useEffect(() => {
    if (!auto) return;
    const id = setTimeout(() => setTurn((n) => n + 1), t.ms);
    return () => clearTimeout(id);
  }, [auto, turn, t.ms]);

  useEffect(() => {
    if (phase !== "activa" && phase !== "guion") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const levels = useMemo<AudioLevels>(() => {
    const inBuf = new Uint8Array(BINS);
    const outBuf = new Uint8Array(BINS);
    return {
      input: () => {
        const now = performance.now() / 1000;
        // the microphone always hears a little room noise; the person's voice when it is their turn
        fillVoice(inBuf, now, 1.3, voice.current === "persona" ? 1 : 0.05);
        return inBuf;
      },
      output: () => {
        if (voice.current !== "agente") return outBuf.fill(0);
        fillVoice(outBuf, performance.now() / 1000, 0.4, 1);
        return outBuf;
      },
    };
  }, []);

  function later(ms: number, fn: () => void) {
    timers.current.push(setTimeout(fn, ms));
  }

  function go(next: PlaygroundState) {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setState(next);
    setTurn(0);
    setScriptCaptions(next === "guion" ? GUION_FIRST : []);
    // hanging up keeps the call's time on screen while it ends
    setSeconds((s) => (next === "finalizando" ? Math.max(s, 41) : next === "finalizada" ? Math.max(s, 94) : next.startsWith("activa") || next === "guion" ? 37 : 0));
  }

  const captions: Caption[] =
    phase === "guion"
      ? scriptCaptions
      : auto
        ? captionsUpTo(Math.max(...TURNS.slice(0, (turn % TURNS.length) + 1).map((x) => (x.caption ?? -1) + 1)))
        : phase === "activa" || phase === "finalizando" || phase === "finalizada"
          ? captionsUpTo(state === "activa-escucha" ? 3 : 4)
          : [];

  const busy: BusyInfo | null =
    state === "ocupado-dispositivo" ? { kind: "otro_dispositivo", position: null } : state === "ocupado-capacidad" ? { kind: "capacidad", position: 3 } : null;

  const props: CallViewProps = {
    phase,
    purposeLabel: "Confirmación de su cita",
    establishment: "Hospital de demostración",
    agentSpeaking,
    thinking,
    muted,
    seconds,
    captions,
    captionsVisible,
    busy,
    errorMessage: state === "sin_conexion" ? "La conexión a internet es inestable o el micrófono no está disponible." : null,
    levels,
    scriptOptions: SCRIPT_OPTIONS,
    onScriptOption: (id) => {
      const o = SCRIPT_OPTIONS.find((x) => x.id === id);
      if (!o) return;
      setScriptCaptions((c) => [...c, { id: c.length + 100, who: "persona", text: o.label }]);
      later(900, () =>
        setScriptCaptions((c) => [...c, { id: c.length + 100, who: "agente", text: "Gracias, queda registrado. ¿Le ayudo con algo más?" }]),
      );
    },
    actions: {
      answer: () => {
        go("conectando");
        later(1600, () => go("activa-auto"));
      },
      reject: () => go("finalizada"),
      hangUp: () => {
        go("finalizando");
        later(1200, () => go("finalizada"));
      },
      toggleMute: () => setMuted((m) => !m),
      toggleCaptions: () => setCaptionsVisible((v) => !v),
      retry: () => {
        go("conectando");
        later(1600, () => go("activa-auto"));
      },
      continueByChat: () => toast("Seguir por chat", { description: "Aquí se abriría el chat con la misma conversación." }),
      talkToPerson: () => toast("Hablar con una persona", { description: "Aquí se avisaría al personal del hospital." }),
      leave: () => toast("Cerrar", { description: "Aquí se cerraría esta pantalla sin tocar la llamada." }),
    },
  };

  const screen = start ? (
    <VoiceStartView
      ready
      onStart={() => {
        go("conectando");
        later(1600, () => go("activa-auto"));
      }}
    />
  ) : (
    <CallView {...props} />
  );

  const stage =
    frame === "telefono" ? (
      <div className="grid h-full place-items-center p-4">
        <div className="relative h-[min(800px,calc(100dvh-2rem))] w-full max-w-[400px] overflow-hidden rounded-[28px] border-[6px] border-ink shadow-xl">
          {screen}
        </div>
      </div>
    ) : frame === "pedir" ? (
      // same boxes as /pedir-cita (PedirCita): app bar, notice, sound bar and the voice view <main>
      <div className="flex h-full justify-center bg-[#cfd8d4] sm:py-6">
        <div className="relative flex h-full w-full max-w-[440px] flex-col overflow-hidden bg-paper sm:rounded-[28px] sm:shadow-xl">
          <header className="flex items-center gap-2 bg-brand px-3 pb-2.5 pt-[calc(0.6rem+env(safe-area-inset-top))] text-white">
            <span className="grid size-9 place-items-center" aria-hidden>
              ←
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate font-semibold">Llamada con el asistente</p>
              <p className="truncate text-xs text-white/75">Usted aparece como «Cóndor 267»</p>
            </div>
          </header>
          <p className="bg-[#fff8e1] px-3 py-1.5 text-[11px] leading-snug text-[#6b4e00]">{DISCLAIMER} Use un nombre ficticio.</p>
          <p className="bg-[#10302f] px-3 py-2.5 text-center text-sm font-semibold text-white">Activar sonido y llamadas</p>
          <main className="relative flex flex-1 flex-col p-4">{screen}</main>
        </div>
      </div>
    ) : (
      <div className="relative h-full w-full">{screen}</div>
    );

  const controls = (
    <div className="space-y-4 text-sm">
      <p className="font-semibold">Estado de la llamada</p>
      <div className="grid gap-1" role="radiogroup" aria-label="Estado de la llamada">
        {PLAYGROUND_STATES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={state === s.id}
            onClick={() => {
              go(s.id);
              setSheetOpen(false);
            }}
            className={`min-h-11 rounded-lg px-3 text-left ${state === s.id ? "bg-brand text-white" : "bg-surface text-ink hover:bg-brand-soft"}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={captionsVisible} onChange={(e) => setCaptionsVisible(e.target.checked)} className="size-5" />
        Subtítulos visibles
      </label>
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} className="size-5" />
        Micrófono silenciado
      </label>
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={frame === "telefono"} onChange={(e) => setFrame(e.target.checked ? "telefono" : "pantalla")} className="size-5" />
        Dentro del marco de teléfono
      </label>
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={frame === "pedir"} onChange={(e) => setFrame(e.target.checked ? "pedir" : "pantalla")} className="size-5" />
        Dentro de /pedir-cita
      </label>
      <p className="text-xs leading-snug text-muted">Audio simulado. Página solo para desarrollo. {DISCLAIMER}</p>
    </div>
  );

  if (!panel)
    return (
      <div data-voice-theme="claro" className="h-dvh">
        {stage}
      </div>
    );

  return (
    <div className="flex h-dvh bg-paper">
      <aside className="hidden w-72 shrink-0 overflow-y-auto border-r border-line p-4 lg:block">{controls}</aside>
      <div className="relative min-w-0 flex-1">
        {stage}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="absolute left-1/2 top-[calc(0.5rem+env(safe-area-inset-top,0px))] z-30 min-h-11 -translate-x-1/2 rounded-full bg-white/90 px-4 text-sm font-semibold text-ink shadow lg:hidden"
        >
          Estados
        </button>
      </div>
      {sheetOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40 lg:hidden" onClick={() => setSheetOpen(false)}>
          <div
            className="max-h-[85dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-paper p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
            onClick={(e) => e.stopPropagation()}
          >
            {controls}
          </div>
        </div>
      )}
    </div>
  );
}
