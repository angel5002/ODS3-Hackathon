"use client";

// Live voice with an ElevenLabs agent in the browser (RF-15). The server issues a signed URL for the
// agent of this call's task (the API key never reaches the browser) plus the call's dynamic variables;
// the agent acts only through our server tools, validated by a secret header + the call id and token.
import { useEffect, useRef } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import type { Turn } from "@/lib/voice/agent";

export type VoiceSession = { signedUrl: string; dynamicVariables: Record<string, string>; agent: string };

type Props = {
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

function Live({ session, onTurn, onSpeaking, onConnected, onEnd, onFail, hangUpRef }: Props) {
  const started = useRef(false);
  const t0 = useRef(0);
  const firstAgentTurn = useRef(true);
  const failed = useRef(false);
  const conv = useConversation({
    onConnect: () => {
      t0.current = performance.now();
    },
    onMessage: ({ message, role }) => {
      if (role === "agent" && firstAgentTurn.current) {
        firstAgentTurn.current = false;
        onConnected(Math.round(performance.now() - t0.current));
      }
      onTurn({ who: role === "agent" ? "agente" : "paciente", text: message });
    },
    onModeChange: ({ mode }) => onSpeaking(mode === "speaking"),
    onError: (message) => {
      if (failed.current) return;
      failed.current = true;
      onFail(String(message));
    },
    onDisconnect: (d) => {
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
    hangUpRef.current = () => conv.endSession();
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    try {
      conv.startSession({ signedUrl: session.signedUrl, connectionType: "websocket", dynamicVariables: session.dynamicVariables });
    } catch (e) {
      failed.current = true;
      onFail((e as Error).message);
    }
    return () => {
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
