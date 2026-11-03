"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Phone, PhoneOff, UserRound, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { post } from "@/lib/post";
import type { Call, Patient } from "@/lib/types";
import type { Option, Turn, VoiceAgent } from "@/lib/voice/agent";
import { ScriptedVoiceAgent, stopSpeaking } from "@/lib/voice/scripted";

export function CallScreen({ call, token, patient, onDone }: { call: Call; token: string; patient: Patient; onDone: () => void }) {
  const [phase, setPhase] = useState<"ringing" | "talking" | "ended">(call.status === "en_curso" ? "talking" : "ringing");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [sound, setSound] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const agent = useRef<VoiceAgent | null>(null);
  const logRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (phase !== "talking") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length]);

  useEffect(() => () => stopSpeaking(), []);

  async function setStatus(status: Call["status"], result?: string, transcript?: Turn[]) {
    await post("/api/patient", { token, action: "call", callId: call.id, status, result, transcript });
  }

  async function answer() {
    setPhase("talking");
    try {
      await setStatus("en_curso");
      const a = new ScriptedVoiceAgent(
        { token, callId: call.id },
        {
          onTurn: (t) => setTurns((x) => [...x, t]),
          onOptions: setOptions,
          onEnd: async (result) => {
            await setStatus("finalizada", result, a.transcript).catch(() => {});
            setTimeout(() => {
              setPhase("ended");
              onDone();
            }, 3500);
          },
        },
        sound,
      );
      agent.current = a;
      await a.start();
    } catch (e) {
      toast.error((e as Error).message);
      setPhase("ended");
      onDone();
    }
  }

  async function reject() {
    setPhase("ended");
    await setStatus("rechazada", "Rechazó la llamada").catch(() => {});
    onDone();
  }

  async function hangUp() {
    stopSpeaking();
    if (agent.current) await agent.current.hangUp();
    else {
      await setStatus("finalizada", "Colgó").catch(() => {});
      onDone();
    }
  }

  if (phase === "ended") return null;
  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-[#10302f] text-white" role="dialog" aria-label="Llamada del hospital">
      <div className="flex flex-col items-center px-6 pb-4 pt-[calc(2.5rem+env(safe-area-inset-top))] text-center">
        <div className={`relative grid size-20 place-items-center rounded-full bg-white/10 text-[#7ee0c9] ${phase === "ringing" ? "ring-pulse" : ""}`}>
          <Bot className="size-9" aria-hidden />
        </div>
        <p className="mt-4 text-xl font-semibold">Hospital María Auxiliadora</p>
        <p className="text-sm text-white/70">Asistente automático de citas</p>
        <p className="mt-1 text-sm tabular-nums text-white/70">{phase === "ringing" ? "Llamada entrante…" : mmss}</p>
      </div>

      {phase === "talking" && (
        <ol ref={logRef} className="mx-3 flex-1 space-y-2 overflow-y-auto overscroll-contain rounded-2xl bg-black/20 p-3" aria-live="polite">
          {turns.map((t, i) => (
            <li key={i} className={`bubble-in flex gap-2 ${t.who === "paciente" ? "justify-end" : ""}`}>
              {t.who === "agente" && <Bot className="mt-1 size-4 shrink-0 text-[#7ee0c9]" aria-label="Asistente" />}
              <p className={`max-w-[85%] rounded-2xl px-3 py-2 text-[15px] leading-snug ${t.who === "agente" ? "bg-white/10" : "bg-[#7ee0c9] text-[#0b2b2a]"}`}>
                {t.text}
              </p>
              {t.who === "paciente" && <UserRound className="mt-1 size-4 shrink-0 text-white/60" aria-label={patient.first_name} />}
            </li>
          ))}
          {!turns.length && <li className="text-center text-sm text-white/60">Conectando…</li>}
        </ol>
      )}
      {phase === "ringing" && <div className="flex-1" />}

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
