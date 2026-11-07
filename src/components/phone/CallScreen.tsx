"use client";

// Incoming call screen for the simulated phone and the live chat (RF-15). Fallback chain:
//   1. ElevenLabs agent in the browser (signed URL)  2. fixed script with the browser's voice.
// (Gemini Live is listed as an option in CLAUDE.md, but no Gemini implementation exists in the repository;
//  see INFORME_E4.md.) If the live voice fails at any point, the same call continues with the script.
// E5 (hito 2): the live voice follows an explicit state machine (src/lib/voice/machine.ts): one session per
// call claimed on the server, idempotent start, "busy" when another device has the call or every line is
// taken, and a reopened screen offers to reconnect instead of staying in "Conectando…".
import { useEffect, useReducer, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Bot, Mic, Phone, PhoneOff, RotateCcw, UserRound, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { post } from "@/lib/post";
import type { Call } from "@/lib/types";
import type { Option, Turn, VoiceAgent } from "@/lib/voice/agent";
import { ScriptedVoiceAgent, stopSpeaking } from "@/lib/voice/scripted";
import { ring } from "@/lib/voice/audio";
import { bindDiag, newDiagId, voiceDiag } from "@/lib/voice/diag";
import { initialVoiceState, isBusy, voiceReducer, voiceStateText } from "@/lib/voice/machine";
import type { LiveVoiceControl, VoiceSession } from "@/components/voice/LiveVoice";

const LiveVoice = dynamic(() => import("@/components/voice/LiveVoice").then((m) => m.LiveVoice), { ssr: false });

const PURPOSE_LABEL: Record<string, string> = {
  confirmacion: "Confirmación de su cita",
  oferta: "Cupo disponible",
  validacion: "Validación de su cupo",
  registro: "Registro de solicitud",
  prueba: "Llamada de prueba",
};

const RETRY_MS = 10_000;

type SessionResponse = {
  callId: number;
  voiceSessionId?: string;
  session: VoiceSession | null;
  busy?: "otro_dispositivo" | "capacidad";
  queueId?: string | null;
  position?: number | null;
  reason?: string;
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
  // a screen that opens on a call already "en curso" (tab reopened) offers to reconnect
  const [phase, setPhase] = useState<"ringing" | "reconnect" | "connecting" | "talking" | "ended">(
    outgoing ? "connecting" : call.status === "en_curso" ? "reconnect" : "ringing",
  );
  const [turns, setTurns] = useState<Turn[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [sound, setSound] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [live, setLive] = useState<{ session: VoiceSession; voiceSessionId: string } | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [provider, setProvider] = useState<"elevenlabs" | "guion" | null>(null);
  const [vs, dispatch] = useReducer(voiceReducer, initialVoiceState);
  const agent = useRef<VoiceAgent | null>(null);
  const control = useRef<LiveVoiceControl | null>(null);
  const transcript = useRef<Turn[]>([]);
  const logRef = useRef<HTMLOListElement>(null);
  const ended = useRef(false);
  const requesting = useRef(false);
  const queueId = useRef<string | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sid] = useState(newDiagId);
  const answerClicks = useRef(0);

  useEffect(() => {
    voiceDiag(sid, "screen.mount", { callId: call.id, status: call.status, purpose: call.purpose ?? null, outgoing: !!outgoing });
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      voiceDiag(sid, "screen.unmount", { callId: call.id, ended: ended.current });
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
    if (requesting.current || live) return; // idempotent: a double tap does nothing
    setPhase("connecting");
    await setStatus("en_curso").catch(() => {});
    await connect();
  }

  async function connect() {
    // plan B (and tests without a microphone): ?voz=guion forces the fixed script
    if (new URLSearchParams(window.location.search).get("voz") === "guion") return fallback("Modo guion fijo (plan B)");
    if (requesting.current || isBusy(vs) || ended.current) return;
    requesting.current = true;
    dispatch({ type: "START" });
    voiceDiag(sid, "session.request", { callId: call.id, queued: !!queueId.current });
    try {
      const s = await post<SessionResponse>("/api/voice/session", { token: auth.token, callId: call.id, diag: sid, queueId: queueId.current });
      voiceDiag(sid, "session.response", { callId: call.id, ok: !!s.session, busy: s.busy ?? null, reason: s.reason ?? null });
      if (s.session && s.voiceSessionId) {
        bindDiag(sid, s.voiceSessionId, call.id);
        queueId.current = null;
        dispatch({ type: "SESSION_GRANTED", sessionId: s.voiceSessionId });
        setProvider("elevenlabs");
        setLive({ session: s.session, voiceSessionId: s.voiceSessionId });
        setPhase("talking");
        await setStatus("en_curso", undefined, undefined, { provider: "elevenlabs" }).catch(() => {});
        return;
      }
      if (s.busy) {
        dispatch({ type: "SESSION_BUSY", kind: s.busy, position: s.position ?? null, queueId: s.queueId ?? null });
        setPhase("connecting");
        if (s.busy === "capacidad") {
          queueId.current = s.queueId ?? null;
          retryTimer.current = setTimeout(() => {
            requesting.current = false;
            void connect();
          }, RETRY_MS);
        }
        return;
      }
      throw new Error(s.reason ?? "Voz en vivo no disponible");
    } catch (e) {
      dispatch({ type: "SESSION_FAILED", message: (e as Error).message });
      fallback((e as Error).message);
    } finally {
      requesting.current = false;
    }
  }

  async function fallback(reason: string) {
    voiceDiag(sid, "fallback", { callId: call.id, reason: reason.slice(0, 140), ended: ended.current, provider });
    if (ended.current) return;
    if (retryTimer.current) clearTimeout(retryTimer.current);
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

  async function finish(result: string, closeCall = true) {
    voiceDiag(sid, "finish", { callId: call.id, result, alreadyEnded: ended.current, closeCall });
    if (ended.current) return;
    ended.current = true;
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (closeCall) await setStatus("finalizada", result, transcript.current).catch(() => {});
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
    if (live && control.current) {
      control.current.hangUp();
      return finish("La persona colgó");
    }
    if (agent.current) return agent.current.hangUp();
    // waiting in the queue: leave it, the call ends
    dispatch({ type: "HANGUP" });
    finish("Colgó");
  }

  /** another device has this call: close this screen without touching the call */
  function leave() {
    voiceDiag(sid, "ui.cerrar_otro_dispositivo", { callId: call.id });
    ended.current = true;
    setPhase("ended");
    onDone();
  }

  if (phase === "ended") return null;
  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const busy = vs.name === "ocupado" ? vs : null;
  const statusText =
    phase === "ringing"
      ? "Llamada entrante…"
      : phase === "reconnect"
        ? "La llamada sigue abierta"
        : busy
          ? voiceStateText(busy)
          : phase === "connecting"
            ? "Conectando…"
            : provider === "elevenlabs"
              ? `${mmss} · ${voiceStateText(vs, speaking)}`
              : mmss;

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-[#10302f] text-white" role="dialog" aria-label="Llamada del asistente de citas">
      <div className="flex flex-col items-center px-6 pb-4 pt-[calc(2.5rem+env(safe-area-inset-top))] text-center">
        <div className={`relative grid size-20 place-items-center rounded-full bg-white/10 text-[#7ee0c9] ${phase === "ringing" || speaking ? "ring-pulse" : ""}`}>
          <Bot className="size-9" aria-hidden />
        </div>
        <p className="mt-4 text-xl font-semibold">Asistente de citas</p>
        <p className="text-sm text-white/70">{PURPOSE_LABEL[call.purpose ?? "confirmacion"]} · llamada automática de demostración</p>
        <p className="mt-1 text-sm tabular-nums text-white/70" aria-live="polite">
          {statusText}
        </p>
      </div>

      {busy && (
        <div className="mx-4 rounded-2xl bg-black/25 p-4 text-center text-sm" role="status">
          {busy.kind === "otro_dispositivo" ? (
            <p>Esta llamada ya se está atendiendo en otro teléfono o pestaña. Para evitar dos conversaciones a la vez, aquí no se abre otra.</p>
          ) : (
            <p>
              Todas las líneas del asistente están ocupadas. {busy.position ? `Su lugar en la fila: ${busy.position}. ` : ""}Volvemos a intentar cada 10
              segundos.
            </p>
          )}
        </div>
      )}

      {phase === "reconnect" && (
        <div className="mx-4 rounded-2xl bg-black/25 p-4 text-center text-sm">
          <p>La conexión de voz se interrumpió. Puede volver a conectar o colgar.</p>
        </div>
      )}

      {(phase === "talking" || (phase === "connecting" && !busy)) && (
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
      {(phase === "ringing" || phase === "reconnect" || busy) && <div className="flex-1" />}

      {live && (
        <LiveVoice
          sid={sid}
          callId={call.id}
          voiceSessionId={live.voiceSessionId}
          session={live.session}
          dispatch={dispatch}
          controlRef={control}
          onTurn={addTurn}
          onSpeaking={setSpeaking}
          onConnected={(ms) => post("/api/voice/status", { token: auth.token, callId: call.id, status: "en_curso", first_turn_ms: ms }).catch(() => {})}
          onEnd={(kind, reason) => {
            if (kind === "error") return fallback(`La voz en vivo falló (${reason}). Seguimos con el guion fijo.`);
            // ended elsewhere (other device, staff, server): the call is already closed there
            finish(reason, kind !== "remoto");
          }}
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
        ) : busy?.kind === "otro_dispositivo" ? (
          <RoundButton label="Cerrar" onClick={leave} className="bg-white/15">
            <PhoneOff className="size-7" />
          </RoundButton>
        ) : (
          <>
            {phase === "reconnect" && (
              <RoundButton label="Volver a conectar" onClick={answer} className="bg-[#17b26a]">
                <RotateCcw className="size-7" />
              </RoundButton>
            )}
            {busy?.kind === "capacidad" && (
              <RoundButton label="Seguir sin voz" onClick={() => fallback("Todas las líneas de voz están ocupadas")} className="bg-white/15">
                <Volume2 className="size-6" />
              </RoundButton>
            )}
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
