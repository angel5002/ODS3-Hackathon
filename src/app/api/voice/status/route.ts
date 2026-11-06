// Call status from the call screen (answered, rejected, ended), for both the live voice and the script.
import { fail, ok } from "@/lib/api";
import { voice } from "@/lib/channels";
import { serverDb } from "@/lib/supabase/server";
import { ownsCall } from "@/lib/voice/auth";
import { loadCall } from "@/lib/voice/tools";

const STATUS = ["en_curso", "rechazada", "no_contesta", "finalizada", "fallo"] as const;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const call = await loadCall(Number(body.callId));
  if (!call || !(await ownsCall(req, call, body.token))) return fail("unknown call", 404);
  if (!STATUS.includes(body.status)) return fail("invalid call status");
  try {
    const patch: Record<string, unknown> = {};
    if (typeof body.provider === "string") patch.provider = body.provider.slice(0, 20);
    if (typeof body.first_turn_ms === "number") {
      patch.actions = [...(call.actions ?? []), { at: new Date().toISOString(), tool: "latencia", result: `Primera frase del agente en ${body.first_turn_ms} ms` }];
    }
    if (typeof body.fallback_reason === "string") {
      patch.actions = [...((patch.actions as unknown[]) ?? call.actions ?? []), { at: new Date().toISOString(), tool: "respaldo", result: body.fallback_reason.slice(0, 160) }];
    }
    if (Object.keys(patch).length) await serverDb().from("calls").update(patch).eq("id", call.id);
    // the transcript is kept only on screen; we store the result line, never the full conversation
    await voice.updateCall(call.id, body.status, typeof body.result === "string" ? body.result.slice(0, 200) : undefined);
    return ok();
  } catch (e) {
    return fail(e);
  }
}
