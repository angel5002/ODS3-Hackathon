"use client";

// Live voice of ONE voice session (E5, hito 2). Replaces ElevenLabsCall (kept as a backup):
//  - starts the ElevenLabs session once per voiceSessionId, surviving React StrictMode's mount → unmount →
//    mount (the unmount's endSession is deferred and cancelled by the immediate remount);
//  - transport (E5, voice quality): WebRTC with the session's conversation token, so the agent's audio is a
//    WebRTC track: the browser's echo cancellation knows what the phone plays (on a real phone, in WebSocket
//    mode, the agent transcribed its own voice as the person's), plus a jitter buffer for mobile networks and
//    playback off the main thread. If WebRTC cannot connect, it starts once more over WebSocket (signed URL);
//  - heartbeat every 10 s; the server answers { alive: false } when the call ended elsewhere → hang up;
//  - on `pagehide` (tab closed, navigation) ends the session AND the call with navigator.sendBeacon;
//  - stores the SDK conversation id (getId()) in voice_sessions for the post-call webhook;
//  - after transfer_to_human succeeds, closes the call as soon as the agent's sentence is over (src/lib/voice/transfer.ts);
//  - reports every SDK transition to the parent's state machine (dispatch) and to voice_events, plus a summary
//    every 30 s (mode changes, interruptions, playback underruns, long tasks) within the 60 events/min limit.
import { useEffect, useRef } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import type { Turn } from "@/lib/voice/agent";
import { stripAudioTags } from "@/lib/voice/captions";
import { voiceDiag } from "@/lib/voice/diag";
import type { VoiceEvent } from "@/lib/voice/machine";
import { isTransferDone, shouldCloseAfterTransfer } from "@/lib/voice/transfer";

export type VoiceSession = {
  /** WebSocket credential (always present: the fallback) */
  signedUrl: string;
  /** WebRTC credential, when the server issued one */
  conversationToken?: string;
  dynamicVariables: Record<string, string>;
  agent: string;
};
export type LiveVoiceControl = {
  hangUp: () => void;
  setMuted: (m: boolean) => void;
  /** a typed message to the agent (e.g. "Quiero hablar con una persona") */
  say: (text: string) => void;
  /** byte frequency data, read lazily: only the property that is read is computed */
  frequencies: () => { input: Uint8Array | null; output: Uint8Array | null };
  // ---- noisy-room mode ("mantener para hablar"), for the call screen's button (UI track):
  //   onPointerDown → talkStart(), onPointerUp / onPointerCancel / onPointerLeave → talkEnd().
  //   While push-to-talk is on, the microphone is muted except while the button is held.
  /** turn push-to-talk on or off (the `pushToTalk` prop sets the initial value) */
  setPushToTalk: (on: boolean) => void;
  /** is push-to-talk on? */
  isPushToTalk: () => boolean;
  /** the person holds "Mantener para hablar": open the microphone */
  talkStart: () => void;
  /** released: close the microphone after a short tail, so the last syllable is not cut */
  talkEnd: () => void;
};

/** the microphone stays open this long after the button is released */
export const PTT_TAIL_MS = 300;

const HEARTBEAT_MS = 10_000;
const SUMMARY_MS = 30_000;
/** a "listening" moment shorter than this between two "speaking" ones, with no words from the person: the
 *  playback buffer ran dry in the middle of a turn (WebSocket) — heard as a stutter */
const UNDERRUN_MS = 1200;
// clocks read inside SDK callbacks (never during render)
const monotonic = () => performance.now();
const wallClock = () => Date.now();

type Probe = { events: [number, string, Record<string, unknown>?][] };
/** measurement hook for tests/e2e/voice_long_call.py, only with ?metricas=1 (no personal data) */
function probe(): Probe | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { __asistiaVoz?: Probe };
  if (w.__asistiaVoz) return w.__asistiaVoz;
  if (!new URLSearchParams(window.location.search).has("metricas")) return null;
  w.__asistiaVoz = { events: [] };
  return w.__asistiaVoz;
}
const mark = (kind: string, data?: Record<string, unknown>) => probe()?.events.push([Math.round(performance.now()), kind, data]);

type Props = {
  sid: string;
  callId: number;
  voiceSessionId: string;
  session: VoiceSession;
  dispatch: (e: VoiceEvent) => void;
  onTurn: (t: Turn) => void;
  onSpeaking: (speaking: boolean) => void;
  onConnected: (firstTurnMs: number) => void;
  /** the session ended: by the person, the agent, an SDK error or from elsewhere */
  onEnd: (kind: "persona" | "agente" | "error" | "remoto", reason: string) => void;
  controlRef: React.MutableRefObject<LiveVoiceControl | null>;
  /** noisy-room mode: the microphone is open only while talkStart()…talkEnd() (optional, default false).
   *  Turn it on only when the screen shows the "Mantener para hablar" button, or the person cannot speak. */
  pushToTalk?: boolean;
};

export function sendVoiceEnd(voiceSessionId: string, reason: string, closeCall: boolean, result?: string) {
  const body = JSON.stringify({ voiceSessionId, reason, closeCall, result });
  try {
    if (navigator.sendBeacon?.("/api/voice/end", new Blob([body], { type: "application/json" }))) return;
  } catch {
    // fall through to fetch
  }
  void fetch("/api/voice/end", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
}

export function LiveVoice(props: Props) {
  return (
    <ConversationProvider>
      <Runner {...props} />
    </ConversationProvider>
  );
}

function Runner({ sid, callId, voiceSessionId, session, dispatch, onTurn, onSpeaking, onConnected, onEnd, controlRef, pushToTalk = false }: Props) {
  // noisy-room mode: push-to-talk state (refs: changes never re-render)
  const ptt = useRef(pushToTalk);
  const holding = useRef(false);
  const userMuted = useRef(false);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t0 = useRef(0);
  const firstTurn = useRef(true);
  const finished = useRef(false);
  const connected = useRef(false);
  const transport = useRef<"webrtc" | "websocket">(session.conversationToken ? "webrtc" : "websocket");
  const fellBack = useRef(false);
  const startedFor = useRef<string | null>(null);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // conversation statistics for the 30 s summary (and the transfer close)
  const stats = useRef({ modes: 0, interruptions: 0, underruns: 0, userTurns: 0, agentTurns: 0, longTasks: 0, longMs: 0 });
  const speakingNow = useRef(false);
  const lastSpeakEnd = useRef(0);
  const lastUserTurn = useRef(0);
  const transferAt = useRef<number | null>(null);
  const debugSeen = useRef(new Set<string>());
  const cb = useRef({ dispatch, onTurn, onSpeaking, onConnected, onEnd });
  useEffect(() => {
    cb.current = { dispatch, onTurn, onSpeaking, onConnected, onEnd };
  });

  const finish = (kind: "persona" | "agente" | "error" | "remoto", reason: string) => {
    if (finished.current) return;
    finished.current = true;
    cb.current.onEnd(kind, reason);
  };

  const sessionOptions = (t: "webrtc" | "websocket") =>
    t === "webrtc" && session.conversationToken
      ? { conversationToken: session.conversationToken, connectionType: "webrtc" as const, dynamicVariables: session.dynamicVariables }
      : { signedUrl: session.signedUrl, connectionType: "websocket" as const, dynamicVariables: session.dynamicVariables };

  const conv = useConversation({
    onConnect: () => {
      connected.current = true;
      t0.current = monotonic();
      voiceDiag(sid, "sdk.connect", { callId, transport: transport.current });
      mark("connect", { transport: transport.current });
      cb.current.dispatch({ type: "SDK_CONNECTED", sessionId: voiceSessionId, at: wallClock() });
      if (ptt.current) {
        voiceDiag(sid, "ptt.activo", { callId });
        applyMic();
      }
      let conversationId: string | null = null;
      try {
        conversationId = convRef.current?.getId() || null;
      } catch {
        conversationId = null;
      }
      void beat("activa", conversationId);
    },
    onStatusChange: ({ status }) => voiceDiag(sid, "sdk.status", { callId, status }),
    onMessage: ({ message, role }) => {
      const text = role === "agent" ? stripAudioTags(message) : message;
      if (role === "agent") stats.current.agentTurns += 1;
      else {
        stats.current.userTurns += 1;
        lastUserTurn.current = monotonic();
      }
      if (role === "agent" && firstTurn.current) {
        firstTurn.current = false;
        const ms = Math.round(monotonic() - t0.current);
        voiceDiag(sid, "sdk.first_agent_turn", { callId, ms });
        cb.current.onConnected(ms);
      }
      mark(role === "agent" ? "agent_turn" : "user_turn", { chars: text.length });
      if (text) cb.current.onTurn({ who: role === "agent" ? "agente" : "paciente", text });
    },
    onModeChange: ({ mode }) => {
      const speaking = mode === "speaking";
      if (speaking === speakingNow.current) return;
      const now = monotonic();
      stats.current.modes += 1;
      // back to speaking right after a short silence, with no words from the person: a playback underrun.
      // WebSocket only: there the mode is the SDK's playback buffer; in WebRTC it is LiveKit's active speaker,
      // which also drops in the pauses between sentences
      if (transport.current === "websocket" && speaking && lastSpeakEnd.current && now - lastSpeakEnd.current < UNDERRUN_MS && lastUserTurn.current < lastSpeakEnd.current) {
        stats.current.underruns += 1;
        mark("underrun", { ms: Math.round(now - lastSpeakEnd.current) });
      }
      if (!speaking) lastSpeakEnd.current = now;
      speakingNow.current = speaking;
      mark("mode", { mode });
      cb.current.onSpeaking(speaking);
    },
    onInterruption: () => {
      stats.current.interruptions += 1;
      mark("interruption");
      if (stats.current.interruptions <= 5) voiceDiag(sid, "sdk.interrupcion", { callId, n: stats.current.interruptions });
    },
    onAgentToolResponse: (r) => {
      mark("tool", { tool: r.tool_name, error: r.is_error });
      voiceDiag(sid, "sdk.herramienta", { callId, tool: String(r.tool_name).slice(0, 40), error: !!r.is_error });
      if (isTransferDone(r) && transferAt.current === null) transferAt.current = monotonic();
    },
    onDebug: (d: unknown) => {
      const type = typeof d === "object" && d && "type" in d ? String((d as { type: unknown }).type).slice(0, 40) : "debug";
      if (debugSeen.current.has(type) || debugSeen.current.size >= 6) return;
      debugSeen.current.add(type);
      voiceDiag(sid, "sdk.debug", { callId, type });
    },
    onError: (message) => {
      // WebRTC could not connect (e.g. a network that blocks it): start once more over WebSocket
      if (!connected.current && transport.current === "webrtc" && !fellBack.current && !finished.current) {
        fellBack.current = true;
        transport.current = "websocket";
        voiceDiag(sid, "sdk.webrtc_fallo", { callId, message: String(message).slice(0, 140) });
        mark("webrtc_failed");
        setTimeout(() => {
          if (!finished.current) convRef.current.startSession(sessionOptions("websocket"));
        }, 0);
        return;
      }
      voiceDiag(sid, "sdk.error", { callId, message: String(message).slice(0, 140) });
      cb.current.dispatch({ type: "SDK_ERROR", sessionId: voiceSessionId, message: String(message) });
      void beat("error", null, String(message));
      finish("error", String(message));
    },
    onDisconnect: (d) => {
      const ctx = (d as { context?: { code?: number; reason?: string } }).context;
      voiceDiag(sid, "sdk.disconnect", { callId, reason: d.reason, code: ctx?.code ?? null, transport: transport.current });
      mark("disconnect", { reason: d.reason });
      if (finished.current) return;
      if (transferAt.current !== null) {
        // closed after the transfer: a person of the team takes it from here
        cb.current.dispatch({ type: "SDK_DISCONNECTED", sessionId: voiceSessionId, reason: "Derivada a una persona del equipo de citas" });
        sendVoiceEnd(voiceSessionId, "derivada a una persona", false);
        finish("agente", "Pidió hablar con una persona: le contactará el equipo de citas");
        return;
      }
      if (d.reason === "error") {
        cb.current.dispatch({ type: "SDK_ERROR", sessionId: voiceSessionId, message: "La conexión de voz se cortó" });
        sendVoiceEnd(voiceSessionId, "error de conexión", false);
        finish("error", "La conexión de voz se cortó");
        return;
      }
      const reason = d.reason === "agent" ? "El asistente terminó la llamada" : "La persona colgó";
      cb.current.dispatch({ type: "SDK_DISCONNECTED", sessionId: voiceSessionId, reason });
      sendVoiceEnd(voiceSessionId, d.reason === "agent" ? "el asistente terminó" : "la persona colgó", false);
      finish(d.reason === "agent" ? "agente" : "persona", reason);
    },
  });
  const convRef = useRef(conv);
  useEffect(() => {
    convRef.current = conv;
  });

  /** the microphone as it should be now: push-to-talk → open only while held; otherwise the person's mute */
  function applyMic() {
    if (!connected.current || finished.current) return;
    try {
      convRef.current.setMuted(ptt.current ? !holding.current : userMuted.current);
    } catch {
      // not connected
    }
  }

  async function beat(state: "activa" | "error" | null, conversationId: string | null = null, reason?: string) {
    try {
      const r = await fetch("/api/voice/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceSessionId, state, conversationId, reason }),
      });
      const d = (await r.json().catch(() => ({}))) as { alive?: boolean; state?: string; call_status?: string };
      if (d.alive === false && !finished.current && state !== "error") {
        voiceDiag(sid, "latido.sesion_terminada", { callId, state: d.state ?? null, call: d.call_status ?? null });
        cb.current.dispatch({ type: "REMOTE_END", reason: "La llamada terminó" });
        finished.current = true;
        try {
          convRef.current.endSession();
        } catch {
          // already closed
        }
        cb.current.onEnd("remoto", "La llamada terminó en otro lugar");
      }
    } catch {
      // a missed heartbeat is fine: the server only expires the session after 30 s without one
    }
  }

  // controls for the parent (hang up, mute, audio levels for the visualization)
  useEffect(() => {
    controlRef.current = {
      hangUp: () => {
        voiceDiag(sid, "ui.colgar", { callId });
        cb.current.dispatch({ type: "HANGUP" });
        convRef.current.endSession();
      },
      setMuted: (m) => {
        userMuted.current = m;
        if (!ptt.current) convRef.current.setMuted(m);
      },
      setPushToTalk: (on) => {
        if (ptt.current === on) return;
        ptt.current = on;
        holding.current = false;
        voiceDiag(sid, on ? "ptt.activo" : "ptt.inactivo", { callId });
        applyMic();
      },
      isPushToTalk: () => ptt.current,
      talkStart: () => {
        if (releaseTimer.current) {
          clearTimeout(releaseTimer.current);
          releaseTimer.current = null;
        }
        holding.current = true;
        mark("ptt_start");
        applyMic();
      },
      talkEnd: () => {
        if (releaseTimer.current) clearTimeout(releaseTimer.current);
        releaseTimer.current = setTimeout(() => {
          releaseTimer.current = null;
          holding.current = false;
          mark("ptt_end");
          applyMic();
        }, PTT_TAIL_MS);
      },
      say: (text) => {
        try {
          convRef.current.sendUserMessage(text);
        } catch {
          // not connected yet
        }
      },
      frequencies: () => {
        // lazy: the wave reads only one of the two per frame, so only one analyser is read
        const c = convRef.current;
        return {
          get input() {
            try {
              return c.getInputByteFrequencyData();
            } catch {
              return null;
            }
          },
          get output() {
            try {
              return c.getOutputByteFrequencyData();
            } catch {
              return null;
            }
          },
        };
      },
    };
  });

  // the screen turned push-to-talk on or off
  useEffect(() => {
    if (ptt.current !== pushToTalk) {
      ptt.current = pushToTalk;
      holding.current = false;
      voiceDiag(sid, pushToTalk ? "ptt.activo" : "ptt.inactivo", { callId });
      applyMic();
    }
    return () => {
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushToTalk]);

  // start once per voice session; StrictMode-safe
  useEffect(() => {
    if (endTimer.current) {
      clearTimeout(endTimer.current);
      endTimer.current = null;
      voiceDiag(sid, "effect.remontaje", { callId });
    }
    if (startedFor.current !== voiceSessionId) {
      startedFor.current = voiceSessionId;
      voiceDiag(sid, "sdk.start_session", { callId, agent: session.agent, transport: transport.current });
      mark("start", { transport: transport.current });
      convRef.current.startSession(sessionOptions(transport.current));
    }
    return () => {
      // a real unmount ends the session; a StrictMode remount runs the effect again right away and cancels this
      endTimer.current = setTimeout(() => {
        voiceDiag(sid, "effect.desmontaje", { callId });
        // the parent removed the live voice on purpose (e.g. "Chat"): the SDK's own disconnect must not end the call
        const alreadyFinished = finished.current;
        finished.current = true;
        try {
          convRef.current.endSession();
        } catch {
          // already closed
        }
        if (!alreadyFinished) sendVoiceEnd(voiceSessionId, "pantalla cerrada", false);
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceSessionId]);

  // after a successful transfer_to_human: hang up once the agent's short sentence is over
  useEffect(() => {
    const id = setInterval(() => {
      const at = transferAt.current;
      if (at === null || finished.current) return;
      const now = monotonic();
      const quiet = speakingNow.current ? 0 : now - Math.max(lastSpeakEnd.current, at);
      if (shouldCloseAfterTransfer(now - at, speakingNow.current, quiet)) {
        clearInterval(id);
        voiceDiag(sid, "transferencia.cierre", { callId, ms: Math.round(now - at) });
        mark("transfer_close", { ms: Math.round(now - at) });
        try {
          convRef.current.endSession();
        } catch {
          // already closed: onDisconnect may not come, finish here
          cb.current.dispatch({ type: "SDK_DISCONNECTED", sessionId: voiceSessionId, reason: "Derivada a una persona del equipo de citas" });
          sendVoiceEnd(voiceSessionId, "derivada a una persona", false);
          finish("agente", "Pidió hablar con una persona: le contactará el equipo de citas");
        }
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceSessionId]);

  // heartbeat every 10 s (the server expires a session after 30 s without one)
  useEffect(() => {
    const id = setInterval(() => void beat(null, (() => {
      try {
        return convRef.current.getId() || null;
      } catch {
        return null;
      }
    })()), HEARTBEAT_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceSessionId]);

  // a summary every 30 s in voice_events: what explains a stutter (2 events per minute, under the 60/min limit)
  useEffect(() => {
    let obs: PerformanceObserver | null = null;
    try {
      obs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          stats.current.longTasks += 1;
          stats.current.longMs += e.duration;
        }
      });
      obs.observe({ type: "longtask" });
    } catch {
      obs = null; // not supported (Safari)
    }
    const id = setInterval(() => {
      if (!connected.current || finished.current) return;
      const s = stats.current;
      voiceDiag(sid, "voz.resumen", {
        callId,
        transport: transport.current,
        modos: s.modes,
        interrupciones: s.interruptions,
        cortes_audio: s.underruns,
        turnos_persona: s.userTurns,
        turnos_agente: s.agentTurns,
        tareas_largas: s.longTasks,
        tareas_largas_ms: Math.round(s.longMs),
      });
    }, SUMMARY_MS);
    return () => {
      clearInterval(id);
      obs?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceSessionId]);

  // tab closed or navigation in the middle of the call: end the session and the call
  useEffect(() => {
    const onHide = () => {
      if (finished.current) return;
      voiceDiag(sid, "page.pagehide", { callId });
      sendVoiceEnd(voiceSessionId, "pestaña cerrada", true, "La persona cerró la página durante la llamada");
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [sid, callId, voiceSessionId]);

  return null;
}
