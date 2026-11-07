"use client";

// Incoming call screen for the simulated phone and the live chat (RF-15). Fallback chain:
//   1. ElevenLabs agent in the browser (signed URL)  2. fixed script with the browser's voice.
// (Gemini Live is listed as an option in CLAUDE.md, but no Gemini implementation exists in the repository;
//  see INFORME_E4.md.) If the live voice fails at any point, the same call continues with the script.
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Bot, Mic, Phone, PhoneOff, UserRound, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { post } from "@/lib/post";
import type { Call } from "@/lib/types";
import type { Option, Turn, VoiceAgent } from "@/lib/voice/agent";
import { ScriptedVoiceAgent, stopSpeaking } from "@/lib/voice/scripted";
import { ring } from "@/lib/voice/audio";
import type { VoiceSession } from "./ElevenLabsCall";
import { newDiagId, voiceDiag } from "@/lib/voice/diag";

const ElevenLabsCall = dynamic(() => import("./ElevenLabsCall").then((m) => m.ElevenLabsCall), { ssr: false });

const PURPOSE_LABEL: Record<string, string> = {
  confirmacion: "Confirmación de su cita",
  oferta: "Cupo disponible",
  validacion: "Validación de su cupo",
  registro: "Registro de solicitud",
  prueba: "Llamada de prueba",
};

export function CallScreen({
  call,
  auth,
  name,
  onDone,
  outgoing,
}: {
  call: Call;
  auth: { token?: string };
  name: string;
  onDone: () => void;
  /** registration started by the person: no ringing */
  outgoing?: boolean;
}) {
  const [phase, setPhase] = useState<"ringing" | "connecting" | "talking" | "ended">(call.status === "en_curso" || outgoing ? "connecting" : "ringing");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [sound, setSound] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [live, setLive] = useState<VoiceSession | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [provider, setProvider] = useState<"elevenlabs" | "guion" | null>(null);
  const agent = useRef<VoiceAgent | null>(null);
  const hangUpLive = useRef<(() => void) | null>(null);
  const transcript = useRef<Turn[]>([]);
  const logRef = useRef<HTMLOListElement>(null);
  const ended = useRef(false);
  const [sid] = useState(newDiagId);
  const answerClicks = useRef(0);

  // diagnostics (E5, hito 1): mount, unmount and tab close while this call screen is open
  useEffect(() => {
    const s = sid;
    voiceDiag(s, "screen.mount", { callId: call.id, status: call.status, purpose: call.purpose ?? null, outgoing: !!outgoing });
    const onHide = () => voiceDiag(s, "page.pagehide", { callId: call.id, ended: ended.current });
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      voiceDiag(s, "screen.unmount", { callId: call.id, ended: ended.current });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "ringing") return;
    ring();
    const id = setInterval(() => {
      ring();
      if ("vibrate" in navigator) navigator.vibrate?.([300, 150, 300]);
    }, 2000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "talking") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length]);

  useEffect(() => () => stopSpeaking(), []);

  const autoStarted = useRef(false);

  async function setStatus(status: Call["status"], result?: string, tr?: Turn[], extra: Record<string, unknown> = {}) {
    await post("/api/voice/status", { token: auth.token, callId: call.id, status, result, transcript: tr, ...extra });
  }

  function addTurn(t: Turn) {
    transcript.current = [...transcript.current, t];
    setTurns(transcript.current);
  }

  async function answer() {
    answerClicks.current += 1;
    voiceDiag(sid, "ui.answer", { callId: call.id, clicks: answerClicks.current });
    setPhase("connecting");
    await setStatus("en_curso").catch(() => {});
    await connect();
  }

  async function connect() {
    // plan B (and tests without a microphone): ?voz=guion forces the fixed script
    if (new URLSearchParams(window.location.search).get("voz") === "guion") return fallback("Modo guion fijo (plan B)");
    voiceDiag(sid, "session.request", { callId: call.id });
    try {
      const s = await post<{ session: VoiceSession | null; reason?: string }>("/api/voice/session", { token: auth.token, callId: call.id, diag: sid });
      voiceDiag(sid, "session.response", { callId: call.id, ok: !!s.session, reason: s.reason ?? null });
      if (s.session) {
        setProvider("elevenlabs");
        setLive(s.session);
        setPhase("talking");
        await setStatus("en_curso", undefined, undefined, { provider: "elevenlabs" }).catch(() => {});
        return;
      }
      throw new Error(s.reason ?? "Voz en vivo no disponible");
    } catch (e) {
      fallback((e as Error).message);
    }
  }

  async function fallback(reason: string) {
    voiceDiag(sid, "fallback", { callId: call.id, reason: reason.slice(0, 140), ended: ended.current, provider });
    if (ended.current) return;
    setLive(null);
    if (provider === "guion") return;
    setProvider("guion");
    setPhase("talking");
    toast("Llamada con el guion fijo", { description: reason });
    await setStatus("en_curso", undefined, undefined, { provider: "guion", fallback_reason: reason }).catch(() => {});
    try {
      const a = new ScriptedVoiceAgent(
        { token: auth.token, callId: call.id },
        {
          onTurn: addTurn,
          onOptions: setOptions,
          onEnd: (result) => finish(result),
        },
        sound,
      );
      agent.current = a;
      await a.start();
    } catch (e) {
      toast.error((e as Error).message);
      finish("No se pudo iniciar la llamada");
    }
  }

  async function finish(result: string) {
    voiceDiag(sid, "finish", { callId: call.id, result, alreadyEnded: ended.current });
    if (ended.current) return;
    ended.current = true;
    await setStatus("finalizada", result, transcript.current).catch(() => {});
    setTimeout(() => {
      setPhase("ended");
      onDone();
    }, 2500);
  }

  // auto-start for an outgoing registration call
  useEffect(() => {
    if (outgoing && !autoStarted.current) {
      autoStarted.current = true;
      void connect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outgoing]);

  async function reject() {
    voiceDiag(sid, "ui.reject", { callId: call.id });
    ended.current = true;
    setPhase("ended");
    await setStatus("rechazada", "Rechazó la llamada").catch(() => {});
    onDone();
  }

  async function hangUp() {
    voiceDiag(sid, "ui.hangup", { callId: call.id, live: !!live });
    stopSpeaking();
    if (live && hangUpLive.current) {
      hangUpLive.current();
      return finish("La persona colgó");
    }
    if (agent.current) await agent.current.hangUp();
    else finish("Colgó");
  }

  if (phase === "ended") return null;
  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-[#10302f] text-white" role="dialog" aria-label="Llamada del asistente de citas">
      <div className="flex flex-col items-center px-6 pb-4 pt-[calc(2.5rem+env(safe-area-inset-top))] text-center">
        <div className={`relative grid size-20 place-items-center rounded-full bg-white/10 text-[#7ee0c9] ${phase === "ringing" || speaking ? "ring-pulse" : ""}`}>
          <Bot className="size-9" aria-hidden />
        </div>
        <p className="mt-4 text-xl font-semibold">Asistente de citas</p>
        <p className="text-sm text-white/70">{PURPOSE_LABEL[call.purpose ?? "confirmacion"]} · llamada automática de demostración</p>
        <p className="mt-1 text-sm tabular-nums text-white/70" aria-live="polite">
          {phase === "ringing" ? "Llamada entrante…" : phase === "connecting" ? "Conectando…" : mmss}
          {provider === "elevenlabs" && phase === "talking" ? (speaking ? " · habla el asistente" : " · le escucha") : ""}
        </p>
      </div>

      {(phase === "talking" || phase === "connecting") && (
        <ol ref={logRef} className="mx-3 flex-1 space-y-2 overflow-y-auto overscroll-contain rounded-2xl bg-black/20 p-3" aria-live="polite">
          {turns.map((t, i) => (
            <li key={i} className={`bubble-in flex gap-2 ${t.who === "paciente" ? "justify-end" : ""}`}>
              {t.who === "agente" && <Bot className="mt-1 size-4 shrink-0 text-[#7ee0c9]" aria-label="Asistente" />}
              <p className={`max-w-[85%] rounded-2xl px-3 py-2 text-[15px] leading-snug ${t.who === "agente" ? "bg-white/10" : "bg-[#7ee0c9] text-[#0b2b2a]"}`}>
                {t.text}
              </p>
              {t.who === "paciente" && <UserRound className="mt-1 size-4 shrink-0 text-white/60" aria-label={name} />}
            </li>
          ))}
          {!turns.length && (
            <li className="flex items-center justify-center gap-2 text-center text-sm text-white/60">
              {provider === "elevenlabs" ? (
                <>
                  <Mic className="size-4" aria-hidden /> Hable con normalidad: el asistente le escucha.
                </>
              ) : (
                "Conectando…"
              )}
            </li>
          )}
        </ol>
      )}
      {phase === "ringing" && <div className="flex-1" />}

      {live && (
        <ElevenLabsCall
          sid={sid}
          session={live}
          hangUpRef={hangUpLive}
          onTurn={addTurn}
          onSpeaking={setSpeaking}
          onConnected={(ms) => post("/api/voice/status", { token: auth.token, callId: call.id, status: "en_curso", first_turn_ms: ms }).catch(() => {})}
          onEnd={(reason) => finish(reason)}
          onFail={(err) => fallback(`La voz en vivo falló (${err}). Seguimos con el guion fijo.`)}
        />
      )}

      {phase === "talking" && options.length > 0 && (
        <div className="grid gap-2 px-3 pt-3">
          <p className="text-center text-xs text-white/60">Responda tocando una opción</p>
          {options.map((o) => (
            <button
              key={o.id}
              onClick={() => agent.current?.choose(o.id)}
              className={`press min-h-12 select-none rounded-xl px-4 text-[15px] font-semibold ${
                o.tone === "primary" ? "bg-[#7ee0c9] text-[#0b2b2a]" : "bg-white/12 text-white active:bg-white/20"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-center gap-10 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5">
        {phase === "ringing" ? (
          <>
            <RoundButton label="Rechazar" onClick={reject} className="bg-[#d92d20]">
              <PhoneOff className="size-7" />
            </RoundButton>
            <RoundButton label="Contestar" onClick={answer} className="bg-[#17b26a]">
              <Phone className="size-7" />
            </RoundButton>
          </>
        ) : (
          <>
            {provider === "guion" && (
              <RoundButton
                label={sound ? "Silenciar voz" : "Activar voz"}
                onClick={() => {
                  if (sound) stopSpeaking();
                  setSound(!sound);
                }}
                className="bg-white/15"
              >
                {sound ? <Volume2 className="size-6" /> : <VolumeX className="size-6" />}
              </RoundButton>
            )}
            <RoundButton label="Colgar" onClick={hangUp} className="bg-[#d92d20]">
              <PhoneOff className="size-7" />
            </RoundButton>
          </>
        )}
      </div>
    </div>
  );
}

function RoundButton({ label, onClick, className, children }: { label: string; onClick: () => void; className: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button aria-label={label} onClick={onClick} className={`press grid size-16 select-none place-items-center rounded-full ${className}`}>
        {children}
      </button>
      <span className="text-xs text-white/80">{label}</span>
    </div>
  );
}
