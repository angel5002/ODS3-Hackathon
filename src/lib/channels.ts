// Channels behind common interfaces (RNF-12, v4 RF-13/RF-15).
//
// MessagingChannel
//   SimulatedChannel  -> the phones of /t/[token] and the 1,473 appointments of the demo day
//   WebChatChannel    -> the live web chat of /pedir-cita (anonymous signed session + Realtime)
//   (pilot) messaging from the establishment's own number would implement the same interface. Not integrated.
//
// VoiceChannel
//   BrowserVoiceChannel -> the "call" rings inside the browser of the simulated phone or the chat;
//                          the agent is ElevenLabs (src/lib/voice/elevenlabs.tsx) with Gemini/script fallbacks.
//   (pilot) PhoneVoiceChannel would connect the same agents to the hospital's line. No telephony here.
//
// Postgres delivers each outgoing message to every channel a person has (public.deliver), so the panel,
// the simulated phones and the live channels always see the same thing.
import { rpc } from "./supabase/server";
import type { Call, Reply, Status } from "./types";

export interface MessagingChannel {
  sendReminders(): Promise<number>;
  sendSlotOffer(slotId: number, waitlistId: number, actor: string): Promise<number>;
  receiveReply(appointmentId: number, reply: Reply, channel?: "mensaje" | "chat"): Promise<Status>;
  receiveOfferAnswer(offerId: number, accept: boolean): Promise<number | null>;
  receiveSlotOfferAnswer(slotOfferId: number, requestId: number, accept: boolean, channel: string): Promise<string>;
}

export interface VoiceChannel {
  startCall(appointmentId: number, actor: string): Promise<number>;
  updateCall(callId: number, status: Call["status"], result?: string, transcript?: Call["transcript"]): Promise<void>;
  /** The agent acts only through these functions, scoped to the appointment of the call (RF-23). */
  agentAction(appointmentId: number, reply: Reply, detail: string): Promise<Status>;
}

class SimulatedChannel implements MessagingChannel {
  sendReminders() {
    return rpc<number>("send_reminders");
  }
  sendSlotOffer(slotId: number, waitlistId: number, actor: string) {
    return rpc<number>("make_offer", { p_slot: slotId, p_waitlist: waitlistId, p_actor: actor });
  }
  receiveReply(appointmentId: number, reply: Reply, channel: "mensaje" | "chat" = "mensaje") {
    return rpc<Status>("patient_reply", { p_appt: appointmentId, p_reply: reply, p_channel: channel });
  }
  receiveOfferAnswer(offerId: number, accept: boolean) {
    return rpc<number | null>("answer_offer", { p_offer: offerId, p_accept: accept });
  }
  receiveSlotOfferAnswer(slotOfferId: number, requestId: number, accept: boolean, channel: string) {
    return rpc<string>("respond_offer", {
      p_offer: slotOfferId,
      p_request: requestId,
      p_response: accept ? "acepta" : "declina",
      p_channel: channel,
    });
  }
}

/** The live web chat shares the same database functions; only the delivery (chat_messages + Realtime) differs. */
export class WebChatChannel extends SimulatedChannel {}

export class BrowserVoiceChannel implements VoiceChannel {
  startCall(appointmentId: number, actor: string) {
    return rpc<number>("start_call", { p_appt: appointmentId, p_actor: actor });
  }
  async updateCall(callId: number, status: Call["status"], result?: string, transcript?: Call["transcript"]) {
    await rpc("update_call", {
      p_call: callId,
      p_status: status,
      p_result: result ?? null,
      p_transcript: transcript ?? null,
    });
  }
  agentAction(appointmentId: number, reply: Reply, detail: string) {
    return rpc<Status>("patient_reply", {
      p_appt: appointmentId,
      p_reply: reply,
      p_channel: "voz",
      p_actor: "Asistente automático",
      p_detail: detail,
    });
  }
}

export const messaging: MessagingChannel = new SimulatedChannel();
export const webChat: MessagingChannel = new WebChatChannel();
export const voice: VoiceChannel = new BrowserVoiceChannel();
