// Fixed-script fallback of the voice agents (RF-15 fallback). It calls exactly the same tools as the
// ElevenLabs agents (src/lib/voice/tools.ts). Auth: the phone token or the signed chat cookie.
import { fail, ok } from "@/lib/api";
import { ownsCall } from "@/lib/voice/auth";
import { serverDb } from "@/lib/supabase/server";
import { callContext, loadCall, runTool } from "@/lib/voice/tools";

const LEGACY: Record<string, string> = { request_reschedule: "propose_reschedule" };

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const call = await loadCall(Number(body.callId));
  if (!call || !(await ownsCall(req, call, body.token))) return fail("unknown call", 404);
  if (!["sonando", "en_curso"].includes(call.status)) return fail("call ended", 409);
  try {
    if (body.fn === "get_context") return ok({ context: await callContext(call), purpose: call.purpose });
    if (body.fn === "get_appointment" && call.appointment_id) {
      const { data } = await serverDb()
        .from("appointments")
        .select("specialty,date,time,remote,status,patient:patients(first_name,age,caregiver_name,caregiver_relation)")
        .eq("id", call.appointment_id)
        .single();
      const { data: state } = await serverDb().from("demo_state").select("day_label").eq("id", 1).single();
      return ok({ appointment: { ...data, day_label: state?.day_label } });
    }
    const r = await runTool(call, LEGACY[body.fn] ?? body.fn, body.args ?? {});
    return ok({ say: r.say, data: r.data ?? null, done: r.done ?? null });
  } catch (e) {
    return fail(e);
  }
}
