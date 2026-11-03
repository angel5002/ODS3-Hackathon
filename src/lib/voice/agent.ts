"use client";

// Voice agent contract (RF-18 to RF-26). The phone simulator only talks to this
// interface. Execution 1 ships ScriptedVoiceAgent (fixed script, no AI, works
// as the offline fallback, RF-19). Execution 2 adds a Gemini Live implementation
// with the same callbacks and the same tool functions.
import { post } from "../post";

export type Turn = { who: "agente" | "paciente"; text: string };
export type Option = { id: string; label: string; tone?: "primary" | "danger" | "neutral" };
export type ToolName =
  | "get_appointment"
  | "confirm_appointment"
  | "release_slot"
  | "request_reschedule"
  | "transfer_to_human";

export type AppointmentInfo = {
  specialty: string;
  date: string;
  time: string;
  remote: boolean;
  status: string;
  day_label: string;
  patient: { first_name: string; age: number; caregiver_name: string | null; caregiver_relation: string | null };
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

export type AgentContext = { token: string; callId: number };

/** Every agent action goes through our API and is scoped to the call's appointment. */
export async function callTool<T = Record<string, unknown>>(ctx: AgentContext, fn: ToolName) {
  return post<T>("/api/agent", { token: ctx.token, callId: ctx.callId, fn });
}
