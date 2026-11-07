"use client";

// Live voice with an ElevenLabs agent in the browser (RF-15). The server issues a signed URL for the
// agent of this call's task (the API key never reaches the browser) plus the call's dynamic variables;
// the agent acts only through our server tools, validated by a secret header + the call id and token.
import { useEffect, useRef } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import type { Turn } from "@/lib/voice/agent";
import { voiceDiag } from "@/lib/voice/diag";

export type VoiceSession = { signedUrl: string; dynamicVariables: Record<string, string>; agent: string };

type Props = {
  /** diagnostics id of this voice session (E5, hito 1) */
  sid: string;
  session: VoiceSession;
  onTurn: (t: Turn) => void;
  onSpeaking: (speaking: boolean) => void;
  onConnected: (ms: number) => void;
  onEnd: (reason: string) => void;
  onFail: (error: string) => void;
  hangUpRef: React.MutableRefObject<(() => void) | null>;
};

export function ElevenLabsCall(props: Props) {
  return (
    <ConversationProvider>
      <Live {...props} />
    </ConversationProvider>
  );
}

function Live({ sid, session, onTurn, onSpeaking, onConnected, onEnd, onFail, hangUpRef }: Props) {
  const started = useRef(false);
  const t0 = useRef(0);
  const firstAgentTurn = useRef(true);
  const failed = useRef(false);
  const callId = session.dynamicVariables.call_id;
  const conv = useConversation({
    onConnect: () => {
      t0.current = performance.now();
      voiceDiag(sid, "sdk.connect", { callId });
    },
    onStatusChange: ({ status }) => voiceDiag(sid, "sdk.status", { callId, status }),
    onMessage: ({ message, role }) => {
      if (role === "agent" && firstAgentTurn.current) {
        firstAgentTurn.current = false;
        const ms = Math.round(performance.now() - t0.current);
        voiceDiag(sid, "sdk.first_agent_turn", { callId, ms });
        onConnected(ms);
      }
      onTurn({ who: role === "agent" ? "agente" : "paciente", text: message });
    },
    onModeChange: ({ mode }) => onSpeaking(mode === "speaking"),
    onError: (message) => {
      voiceDiag(sid, "sdk.error", { callId, message: String(message), alreadyFailed: failed.current });
      if (failed.current) return;
      failed.current = true;
      onFail(String(message));
    },
    onDisconnect: (d) => {
      const ctx = (d as { context?: { code?: number; reason?: string } }).context;
      voiceDiag(sid, "sdk.disconnect", { callId, reason: d.reason, code: ctx?.code ?? null, closeReason: ctx?.reason ?? null, alreadyFailed: failed.current });
      if (failed.current) return;
      if (d.reason === "error") {
        failed.current = true;
        onFail("La conexión de voz se cortó");
        return;
      }
      onEnd(d.reason === "agent" ? "El asistente terminó la llamada" : "La persona colgó");
    },
  });

  useEffect(() => {
    hangUpRef.current = () => {
      voiceDiag(sid, "ui.hangup_end_session", { callId });
      conv.endSession();
    };
  });

  useEffect(() => {
    voiceDiag(sid, "effect.run", { callId, alreadyStarted: started.current });
    if (started.current) return;
    started.current = true;
    try {
      voiceDiag(sid, "sdk.start_session", { callId, agent: session.agent });
      conv.startSession({ signedUrl: session.signedUrl, connectionType: "websocket", dynamicVariables: session.dynamicVariables });
    } catch (e) {
      voiceDiag(sid, "sdk.start_session_throw", { callId, message: (e as Error).message });
      failed.current = true;
      onFail((e as Error).message);
    }
    return () => {
      voiceDiag(sid, "effect.cleanup_end_session", { callId });
      try {
        conv.endSession();
      } catch {
        // already closed
      }
    };
    // start once per mounted call
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
