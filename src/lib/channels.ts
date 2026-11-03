// Channels behind common interfaces (RNF-12). Today both are simulated: messages
// only reach the phone simulator and calls ring inside the browser. A pilot swaps
// these classes for WhatsApp Business or real telephony without touching the rest.
import { rpc } from "./supabase/server";
import type { Call, Reply, Status } from "./types";

export interface MessagingChannel {
  sendReminders(): Promise<number>;
  sendSlotOffer(slotId: number, waitlistId: number, actor: string): Promise<number>;
  receiveReply(appointmentId: number, reply: Reply): Promise<Status>;
  receiveOfferAnswer(offerId: number, accept: boolean): Promise<number | null>;
}

export interface VoiceChannel {
  startCall(appointmentId: number, actor: string): Promise<number>;
  updateCall(callId: number, status: Call["status"], result?: string, transcript?: Call["transcript"]): Promise<void>;
  /** The agent acts only through these functions, scoped to the appointment of the call (RF-23). */
  agentAction(appointmentId: number, reply: Reply, detail: string): Promise<Status>;
}

export class SimulatedMessagingChannel implements MessagingChannel {
  sendReminders() {
    return rpc<number>("send_reminders");
  }
  sendSlotOffer(slotId: number, waitlistId: number, actor: string) {
    return rpc<number>("make_offer", { p_slot: slotId, p_waitlist: waitlistId, p_actor: actor });
  }
  receiveReply(appointmentId: number, reply: Reply) {
    return rpc<Status>("patient_reply", { p_appt: appointmentId, p_reply: reply, p_channel: "mensaje" });
  }
  receiveOfferAnswer(offerId: number, accept: boolean) {
    return rpc<number | null>("answer_offer", { p_offer: offerId, p_accept: accept });
  }
}

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

export const messaging: MessagingChannel = new SimulatedMessagingChannel();
export const voice: VoiceChannel = new BrowserVoiceChannel();
