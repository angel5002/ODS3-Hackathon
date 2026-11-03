// Actions from the phone simulator. The token in the URL identifies the
// (fictitious) patient; every action is checked against that patient.
import { fail, ok } from "@/lib/api";
import { messaging, voice } from "@/lib/channels";
import { serverDb } from "@/lib/supabase/server";
import type { Reply } from "@/lib/types";

const REPLIES: Reply[] = ["confirma", "libera", "persona"];
const CALL_STATUS = ["en_curso", "rechazada", "no_contesta", "finalizada"] as const;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const db = serverDb();
  const { data: patient } = await db.from("patients").select("id").eq("token", String(body.token ?? "")).maybeSingle();
  if (!patient) return fail("unknown patient", 404);
  try {
    switch (body.action) {
      case "reply": {
        if (!REPLIES.includes(body.reply)) return fail("invalid reply");
        const appt = await owned(db, "appointments", Number(body.appointmentId), patient.id);
        return ok({ status: await messaging.receiveReply(appt, body.reply) });
      }
      case "offer": {
        const offer = await owned(db, "offers", Number(body.offerId), patient.id);
        return ok({ appointmentId: await messaging.receiveOfferAnswer(offer, Boolean(body.accept)) });
      }
      case "call": {
        if (!CALL_STATUS.includes(body.status)) return fail("invalid call status");
        const call = await owned(db, "calls", Number(body.callId), patient.id);
        await voice.updateCall(call, body.status, body.result, body.transcript);
        return ok();
      }
      default:
        return fail("unknown action");
    }
  } catch (e) {
    return fail(e);
  }
}

async function owned(db: ReturnType<typeof serverDb>, table: string, id: number, patientId: string) {
  const { data } = await db.from(table).select("id").eq("id", id).eq("patient_id", patientId).maybeSingle();
  if (!data) throw new Error("not owned");
  return id;
}
