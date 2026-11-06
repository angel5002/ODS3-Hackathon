"use client";

// Voice agent contract. The call screen only talks to this interface:
//   ElevenLabs agents (src/components/phone/ElevenLabsCall.tsx) -> live voice in the browser
//   ScriptedVoiceAgent (src/lib/voice/scripted.ts)               -> fixed script, the last fallback
// Both act only through the same server tools (src/lib/voice/tools.ts).
import { post } from "../post";

export type Turn = { who: "agente" | "paciente"; text: string };
export type Option = { id: string; label: string; tone?: "primary" | "danger" | "neutral" };
export type ToolName =
  | "get_context"
  | "get_appointment"
  | "confirm_appointment"
  | "release_slot"
  | "get_available_slots"
  | "propose_reschedule"
  | "request_reschedule"
  | "get_offer"
  | "respond_offer"
  | "get_assignment"
  | "confirm_assignment"
  | "decline_assignment"
  | "transfer_to_human"
  | "flag_alarm";

export type CallContext = {
  call_id: string;
  patient_name: string;
  role: string;
  specialty: string;
  slot_text: string;
  deadline_text: string;
};

export type AgentCallbacks = {
  onTurn: (t: Turn) => void;
  onOptions: (o: Option[]) => void;
  /** The agent finished: result is a short summary for the log. */
  onEnd: (result: string) => void;
};

export interface VoiceAgent {
  start(): Promise<void>;
  /** Scripted agent: the patient taps an option. A live voice agent ignores this. */
  choose(optionId: string): Promise<void>;
  hangUp(): Promise<void>;
  readonly transcript: Turn[];
}

export type AgentContext = { token?: string; callId: number };

/** Every agent action goes through our API and is scoped to the call (RF-23). */
export async function callTool<T = Record<string, unknown>>(ctx: AgentContext, fn: ToolName, args: Record<string, unknown> = {}) {
  return post<T>("/api/agent", { token: ctx.token, callId: ctx.callId, fn, args });
}
