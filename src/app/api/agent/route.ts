// Functions of the voice agent (RF-23). Today the scripted agent (RF-19) calls them;
// in execution 2 the Gemini Live agent calls exactly the same functions.
// The agent only sees the appointment of the call in progress (RNF-08).
import { fail, ok } from "@/lib/api";
import { voice } from "@/lib/channels";
import { serverDb } from "@/lib/supabase/server";
import type { Reply } from "@/lib/types";

const ACTIONS: Record<string, { reply: Reply; detail: string }> = {
  confirm_appointment: { reply: "confirma", detail: "Confirmó en la llamada con el asistente automático" },
  release_slot: { reply: "libera", detail: "Avisó en la llamada que no podrá asistir; el cupo queda libre" },
  request_reschedule: { reply: "otra_fecha", detail: "Pidió otra fecha en la llamada (solicitud registrada); el cupo queda libre" },
  transfer_to_human: { reply: "persona", detail: "Pidió hablar con una persona durante la llamada" },
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const db = serverDb();
  const { data: call } = await db
    .from("calls")
    .select("id,appointment_id,status,patient:patients!inner(token)")
    .eq("id", Number(body.callId))
    .eq("patients.token", String(body.token ?? ""))
    .maybeSingle();
  if (!call) return fail("unknown call", 404);
  if (!["sonando", "en_curso"].includes(call.status)) return fail("call ended", 409);

  try {
    if (body.fn === "get_appointment") {
      const { data } = await db
        .from("appointments")
        .select("specialty,date,time,remote,status,patient:patients(first_name,age,caregiver_name,caregiver_relation)")
        .eq("id", call.appointment_id)
        .single();
      const { data: state } = await db.from("demo_state").select("day_label").eq("id", 1).single();
      return ok({ appointment: { ...data, day_label: state?.day_label } });
    }
    const action = ACTIONS[body.fn as string];
    if (!action) return fail("unknown function");
    const status = await voice.agentAction(call.appointment_id, action.reply, action.detail);
    return ok({ status });
  } catch (e) {
    return fail(e);
  }
}
