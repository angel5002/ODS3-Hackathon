"use client";

// Call screen CONTROLLER for the simulated phone and the live chat (RF-15). The view is CallView
// (src/components/voice/CallView.tsx, props in src/lib/voice/contract.ts); this file only holds the logic:
//   - the voice state machine (src/lib/voice/machine.ts): one session per call claimed on the server,
//     idempotent start, busy when another device has the call or every line is taken;
//   - LiveVoice (ElevenLabs in the browser) with heartbeat and pagehide;
//   - the fixed script with the browser's voice, ONLY when the person chooses "Seguir por chat" (or the
//     ?voz=guion plan B). If the voice cannot connect the screen says so: "No pudimos conectar la voz".
// (Gemini Live is listed as an option in CLAUDE.md, but no Gemini implementation exists in the repository.)
import { useEffect, useReducer, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { post } from "@/lib/post";
import type { Call } from "@/lib/types";
import type { Option, Turn, VoiceAgent } from "@/lib/voice/agent";
import { ScriptedVoiceAgent, stopSpeaking } from "@/lib/voice/scripted";
import { ring } from "@/lib/voice/audio";
import { bindDiag, newDiagId, voiceDiag } from "@/lib/voice/diag";
import { initialVoiceState, isBusy, voiceReducer } from "@/lib/voice/machine";
import type { AudioLevels, CallPhase, Caption } from "@/lib/voice/contract";
import type { LiveVoiceControl, VoiceSession } from "@/components/voice/LiveVoice";
import { CallView } from "@/components/voice/CallView";

const LiveVoice = dynamic(() => import("@/components/voice/LiveVoice").then((m) => m.LiveVoice), { ssr: false });

export const ESTABLISHMENT = "Hospital de demostración";

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

/** Captions for CallView from the conversation turns. */
export function toCaptions(turns: Turn[]): Caption[] {
  return turns.map((t, i) => ({ id: i, who: t.who === "agente" ? "agente" : "persona", text: t.text }));
}

/** The person spoke last and the agent has not answered yet. */
export function isThinking(turns: Turn[], speaking: boolean) {
  return !speaking && turns.length > 0 && turns[turns.length - 1].who !== "agente";
}

export function CallScreen({
  call,
  auth,
  onDone,
  outgoing,
}: {
  call: Call;
  auth: { token?: string };
  /** kept for compatibility with the callers (the view no longer shows it) */
  name?: string;
  onDone: () => void;
  /** registration started by the person: no ringing */
  outgoing?: boolean;
}) {
  // a screen that opens on a call already "en curso" (tab reopened) offers to reconnect
  const [phase, setPhase] = useState<"ringing" | "reconnect" | "connecting" | "talking" | "closing" | "ended">(
    outgoing ? "connecting" : call.status === "en_curso" ? "reconnect" : "ringing",
  );
  const [turns, setTurns] = useState<Turn[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [live, setLive] = useState<{ session: VoiceSession; voiceSessionId: string } | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [captionsVisible, setCaptionsVisible] = useState(true);
  const [provider, setProvider] = useState<"elevenlabs" | "guion" | null>(null);
  const [vs, dispatch] = useReducer(voiceReducer, initialVoiceState);
  const [failure, setFailure] = useState<string | null>(null);
  const agent = useRef<VoiceAgent | null>(null);
  const control = useRef<LiveVoiceControl | null>(null);
  const transcript = useRef<Turn[]>([]);
  const ended = useRef(false);
  const requesting = useRef(false);
  const queueId = useRef<string | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sid] = useState(newDiagId);
  const answerClicks = useRef(0);

  // stable audio getters for the wave (read inside requestAnimationFrame, never in React state)
  const [levels] = useState<AudioLevels>(() => ({
    input: () => control.current?.frequencies().input ?? null,
    output: () => control.current?.frequencies().output ?? null,
  }));

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
    if (new URLSearchParams(window.location.search).get("voz") === "guion") return fallback("Modo guion fijo (plan B, ?voz=guion)");
    if (requesting.current || isBusy(vs) || ended.current) return;
    requesting.current = true;
    setFailure(null);
    setPhase("connecting");
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
        if (s.busy === "capacidad") {
          queueId.current = s.queueId ?? null;
          retryTimer.current = setTimeout(() => {
            requesting.current = false;
            void connect();
          }, RETRY_MS);
        }
        return;
      }
      throw new Error(s.reason ?? "La voz en vivo no está disponible ahora.");
    } catch (e) {
      // never fall back in silence: the screen says so and the person chooses (Reintentar / Seguir por chat)
      voiceDiag(sid, "voz.no_conecto", { callId: call.id, reason: (e as Error).message.slice(0, 140) });
      dispatch({ type: "SESSION_FAILED", message: (e as Error).message });
      setFailure((e as Error).message);
    } finally {
      requesting.current = false;
    }
  }

  /** Fixed script, only when the person chooses it ("Seguir por chat") or the ?voz=guion plan B. Logged with its reason. */
  async function fallback(reason: string) {
    voiceDiag(sid, "fallback", { callId: call.id, reason: reason.slice(0, 140), ended: ended.current, provider });
    if (ended.current) return;
    if (retryTimer.current) clearTimeout(retryTimer.current);
    setFailure(null);
    setLive(null);
    if (provider === "guion") return;
    setProvider("guion");
    setPhase("talking");
    await setStatus("en_curso", undefined, undefined, { provider: "guion", fallback_reason: reason }).catch(() => {});
    try {
      const a = new ScriptedVoiceAgent(
        { token: auth.token, callId: call.id },
        {
          onTurn: addTurn,
          onOptions: setOptions,
          onEnd: (result) => finish(result),
        },
        !muted,
      );
      agent.current = a;
      await a.start();
    } catch (e) {
      setFailure((e as Error).message);
    }
  }

  async function finish(result: string, closeCall = true) {
    voiceDiag(sid, "finish", { callId: call.id, result, alreadyEnded: ended.current, closeCall });
    if (ended.current) return;
    ended.current = true;
    if (retryTimer.current) clearTimeout(retryTimer.current);
    setPhase("closing");
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
    // waiting in the queue or after a failure: leave it, the call ends
    dispatch({ type: "HANGUP" });
    finish("Colgó");
  }

  /** another device has this call (or the call ended): close this screen without touching the call */
  function leave() {
    voiceDiag(sid, "ui.cerrar", { callId: call.id });
    ended.current = true;
    setPhase("ended");
    onDone();
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (live) control.current?.setMuted(next);
    if (provider === "guion" && next) stopSpeaking();
  }

  function talkToPerson() {
    voiceDiag(sid, "ui.hablar_con_persona", { callId: call.id, provider });
    if (provider === "guion" && agent.current) return agent.current.choose("human");
    if (live) control.current?.say("Quiero hablar con una persona, por favor.");
  }

  if (phase === "ended") return null;

  const busy = vs.name === "ocupado" ? { kind: vs.kind, position: vs.position } : null;
  const failed = failure !== null && provider !== "guion" && !live;
  const viewPhase: CallPhase = failed
    ? "sin_conexion"
    : phase === "closing"
      ? "finalizada"
      : phase === "ringing"
        ? "entrante"
        : phase === "reconnect"
          ? "reconectar"
          : busy
            ? "ocupado"
            : provider === "guion"
              ? "guion"
              : vs.name === "activa"
                ? "activa"
                : vs.name === "finalizando"
                  ? "finalizando"
                  : vs.name === "finalizada"
                    ? "finalizada"
                    : "conectando";

  return (
    <>
      <CallView
        phase={viewPhase}
        purposeLabel={PURPOSE_LABEL[call.purpose ?? "confirmacion"] ?? "Llamada del asistente"}
        establishment={ESTABLISHMENT}
        agentSpeaking={speaking}
        thinking={viewPhase === "activa" && isThinking(turns, speaking)}
        muted={muted}
        seconds={seconds}
        captions={toCaptions(turns)}
        captionsVisible={captionsVisible}
        busy={busy}
        errorMessage={failure}
        levels={live ? levels : null}
        scriptOptions={options.map((o) => ({ id: o.id, label: o.label, tone: o.tone === "primary" ? "primary" : "neutral" }))}
        onScriptOption={(id) => agent.current?.choose(id)}
        actions={{
          answer: phase === "ringing" || phase === "reconnect" ? answer : undefined,
          reject: phase === "ringing" ? reject : undefined,
          hangUp,
          toggleMute: live || provider === "guion" ? toggleMute : undefined,
          toggleCaptions: () => setCaptionsVisible((v) => !v),
          retry: failed ? () => void connect() : undefined,
          // "Chat": from any voice state the person can switch to the written options (fixed script); logged with its reason
          continueByChat:
            provider !== "guion" && (failed || busy?.kind === "capacidad" || viewPhase === "conectando" || viewPhase === "activa")
              ? () =>
                  fallback(
                    failed
                      ? `La persona eligió seguir por chat: ${failure}`
                      : viewPhase === "activa"
                        ? "La persona eligió seguir por chat durante la llamada"
                        : "Líneas de voz ocupadas o lentas: la persona eligió seguir por chat",
                  )
              : undefined,
          talkToPerson: live || provider === "guion" ? talkToPerson : undefined,
          leave: busy?.kind === "otro_dispositivo" || phase === "closing" ? leave : undefined,
        }}
      />
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
            if (kind === "error") {
              // the live voice dropped: say it and let the person choose
              setLive(null);
              setFailure(reason);
              return;
            }
            // ended elsewhere (other device, staff, server): the call is already closed there
            finish(reason, kind !== "remoto");
          }}
        />
      )}
    </>
  );
}
