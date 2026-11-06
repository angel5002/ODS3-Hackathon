// Simulated phones (/t/[token]). The token in the URL identifies the fictitious patient; every read and
// action is scoped to that patient on the server (the browser no longer reads the tables).
import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api";
import { messaging, voice } from "@/lib/channels";
import { rpc, serverDb } from "@/lib/supabase/server";
import type { Reply } from "@/lib/types";

export const dynamic = "force-dynamic";

const REPLIES: Reply[] = ["confirma", "libera", "persona", "reprograma"];
const CALL_STATUS = ["en_curso", "rechazada", "no_contesta", "finalizada", "fallo"] as const;

async function patientByToken(token: unknown) {
  const { data } = await serverDb()
    .from("patients")
    .select("id,full_name,first_name,short_name,age,caregiver_name,caregiver_relation,token,demo_role,demo_label")
    .eq("token", String(token ?? ""))
    .maybeSingle();
  return data;
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const patient = await patientByToken(token);
  if (!patient) return fail("unknown patient", 404);
  const db = serverDb();
  const [a, m, o, c] = await Promise.all([
    db.from("appointments").select("id,specialty,date,time,remote,status").eq("patient_id", patient.id).order("id"),
    db.from("messages").select("*").eq("patient_id", patient.id).order("id"),
    db.from("offers").select("*").eq("patient_id", patient.id).order("id"),
    db.from("calls").select("*").eq("patient_id", patient.id).order("id", { ascending: false }).limit(1),
  ]);
  const messages = m.data ?? [];
  const offerIds = [...new Set(messages.map((x) => x.slot_offer_id).filter(Boolean))];
  const assignIds = [...new Set(messages.map((x) => x.assignment_id).filter(Boolean))];
  const [so, as] = await Promise.all([
    offerIds.length ? db.from("slot_offers").select("id,state,closes_min").in("id", offerIds) : Promise.resolve({ data: [] }),
    assignIds.length ? db.from("assignments").select("id,validation_state,reverted").in("id", assignIds) : Promise.resolve({ data: [] }),
  ]);
  // presence for the operator's "En vivo" list (no personal data)
  await db.from("patients").update({ last_seen_at: new Date().toISOString() }).eq("id", patient.id);
  return NextResponse.json({
    patient,
    appts: a.data ?? [],
    messages,
    offers: o.data ?? [],
    slotOffers: so.data ?? [],
    assignments: as.data ?? [],
    call: c.data?.[0] ?? null,
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const patient = await patientByToken(body.token);
  if (!patient) return fail("unknown patient", 404);
  const db = serverDb();
  try {
    switch (body.action) {
      case "reply": {
        if (!REPLIES.includes(body.reply)) return fail("invalid reply");
        const appt = await owned("appointments", Number(body.appointmentId), patient.id);
        return ok({ status: await messaging.receiveReply(appt, body.reply) });
      }
      case "reschedule": {
        const appt = await owned("appointments", Number(body.appointmentId), patient.id);
        await rpc("choose_reschedule", { p_appt: appt, p_label: String(body.label ?? ""), p_channel: "mensaje" });
        return ok();
      }
      case "offer": {
        // E1 offers (kept as a fallback) and v4 simultaneous offers
        if (body.slotOfferId) {
          const requestId = Number(body.requestId);
          if ((await rpc<string | null>("request_patient", { p_request: requestId })) !== patient.id) return fail("not owned", 403);
          return ok({ response: await messaging.receiveSlotOfferAnswer(Number(body.slotOfferId), requestId, Boolean(body.accept), "mensaje") });
        }
        const offer = await owned("offers", Number(body.offerId), patient.id);
        return ok({ appointmentId: await messaging.receiveOfferAnswer(offer, Boolean(body.accept)) });
      }
      case "validate": {
        const { data: a } = await db.from("assignments").select("id,request_id").eq("id", Number(body.assignmentId)).maybeSingle();
        if (!a || (await rpc<string | null>("request_patient", { p_request: a.request_id })) !== patient.id) return fail("not owned", 403);
        return ok({
          state: await rpc("validate_assignment", {
            p_assignment: a.id,
            p_ok: Boolean(body.ok),
            p_by: "mensaje",
            p_role: body.role === "cuidador" ? "cuidador" : "paciente",
            p_actor: patient.full_name,
          }),
        });
      }
      case "call": {
        if (!CALL_STATUS.includes(body.status)) return fail("invalid call status");
        const call = await owned("calls", Number(body.callId), patient.id);
        await voice.updateCall(call, body.status, body.result, body.transcript);
        return ok();
      }
      case "presence":
        await db.from("patients").update({ last_seen_at: new Date().toISOString(), sound_ready: Boolean(body.soundReady) }).eq("id", patient.id);
        await rpc("hint", { p_kind: "live" });
        return ok();
      default:
        return fail("unknown action");
    }
  } catch (e) {
    return fail(e);
  }
}

async function owned(table: string, id: number, patientId: string) {
  const { data } = await serverDb().from(table).select("id").eq("id", id).eq("patient_id", patientId).maybeSingle();
  if (!data) throw new Error("not owned");
  return id;
}
