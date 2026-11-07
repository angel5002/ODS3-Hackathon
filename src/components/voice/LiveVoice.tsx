"use client";

// Live voice of ONE voice session (E5, hito 2). Replaces ElevenLabsCall (kept as a backup):
//  - starts the ElevenLabs session once per voiceSessionId, surviving React StrictMode's mount → unmount →
//    mount (the unmount's endSession is deferred and cancelled by the immediate remount);
//  - heartbeat every 10 s; the server answers { alive: false } when the call ended elsewhere → hang up;
//  - on `pagehide` (tab closed, navigation) ends the session AND the call with navigator.sendBeacon;
//  - stores the SDK conversation id (getId()) in voice_sessions for the post-call webhook;
//  - reports every SDK transition to the parent's state machine (dispatch) and to voice_events.
import { useEffect, useRef } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import type { Turn } from "@/lib/voice/agent";
import { voiceDiag } from "@/lib/voice/diag";
import type { VoiceEvent } from "@/lib/voice/machine";

export type VoiceSession = { signedUrl: string; dynamicVariables: Record<string, string>; agent: string };
export type LiveVoiceControl = {
  hangUp: () => void;
  setMuted: (m: boolean) => void;
  /** a typed message to the agent (e.g. "Quiero hablar con una persona") */
  say: (text: string) => void;
  frequencies: () => { input: Uint8Array | null; output: Uint8Array | null };
};

const HEARTBEAT_MS = 10_000;
// clocks read inside SDK callbacks (never during render)
const monotonic = () => performance.now();
const wallClock = () => Date.now();

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

function Runner({ sid, callId, voiceSessionId, session, dispatch, onTurn, onSpeaking, onConnected, onEnd, controlRef }: Props) {
  const t0 = useRef(0);
  const firstTurn = useRef(true);
  const finished = useRef(false);
  const startedFor = useRef<string | null>(null);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useRef({ dispatch, onTurn, onSpeaking, onConnected, onEnd });
  useEffect(() => {
    cb.current = { dispatch, onTurn, onSpeaking, onConnected, onEnd };
  });

  const finish = (kind: "persona" | "agente" | "error" | "remoto", reason: string) => {
    if (finished.current) return;
    finished.current = true;
    cb.current.onEnd(kind, reason);
  };

  const conv = useConversation({
    onConnect: () => {
      t0.current = monotonic();
      voiceDiag(sid, "sdk.connect", { callId });
      cb.current.dispatch({ type: "SDK_CONNECTED", sessionId: voiceSessionId, at: wallClock() });
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
      if (role === "agent" && firstTurn.current) {
        firstTurn.current = false;
        const ms = Math.round(monotonic() - t0.current);
        voiceDiag(sid, "sdk.first_agent_turn", { callId, ms });
        cb.current.onConnected(ms);
      }
      cb.current.onTurn({ who: role === "agent" ? "agente" : "paciente", text: message });
    },
    onModeChange: ({ mode }) => cb.current.onSpeaking(mode === "speaking"),
    onError: (message) => {
      voiceDiag(sid, "sdk.error", { callId, message: String(message).slice(0, 140) });
      cb.current.dispatch({ type: "SDK_ERROR", sessionId: voiceSessionId, message: String(message) });
      void beat("error", null, String(message));
      finish("error", String(message));
    },
    onDisconnect: (d) => {
      const ctx = (d as { context?: { code?: number; reason?: string } }).context;
      voiceDiag(sid, "sdk.disconnect", { callId, reason: d.reason, code: ctx?.code ?? null });
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
      setMuted: (m) => convRef.current.setMuted(m),
      say: (text) => {
        try {
          convRef.current.sendUserMessage(text);
        } catch {
          // not connected yet
        }
      },
      frequencies: () => {
        try {
          return { input: convRef.current.getInputByteFrequencyData(), output: convRef.current.getOutputByteFrequencyData() };
        } catch {
          return { input: null, output: null };
        }
      },
    };
  });

  // start once per voice session; StrictMode-safe
  useEffect(() => {
    if (endTimer.current) {
      clearTimeout(endTimer.current);
      endTimer.current = null;
      voiceDiag(sid, "effect.remontaje", { callId });
    }
    if (startedFor.current !== voiceSessionId) {
      startedFor.current = voiceSessionId;
      voiceDiag(sid, "sdk.start_session", { callId, agent: session.agent });
      convRef.current.startSession({ signedUrl: session.signedUrl, connectionType: "websocket", dynamicVariables: session.dynamicVariables });
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
