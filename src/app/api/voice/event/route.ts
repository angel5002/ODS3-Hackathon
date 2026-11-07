// Client voice events → voice_events (replaces /api/voice/diag). Only for a known voice session (its UUID is
// the capability), short event names and scalar values; Postgres rate-limits to 60 events per session per
// minute (voice_log). No personal data: states, codes and reasons only.
import { UUID, logEvent } from "@/lib/voice/sessions";

export const dynamic = "force-dynamic";
const EVENT = /^[a-z_.]{1,40}$/;

export async function POST(req: Request) {
  const raw = await req.text().catch(() => "");
  if (raw.length > 2000) return new Response(null, { status: 413 });
  let body: { voiceSessionId?: unknown; callId?: unknown; event?: unknown; data?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  const id = String(body.voiceSessionId ?? "");
  const event = String(body.event ?? "");
  if (!UUID.test(id) || !EVENT.test(event)) return new Response(null, { status: 400 });
  const detail: Record<string, string | number | boolean | null> = {};
  if (body.data && typeof body.data === "object") {
    for (const [k, v] of Object.entries(body.data as Record<string, unknown>).slice(0, 12)) {
      if (!/^[a-zA-Z_]{1,30}$/.test(k)) continue;
      if (typeof v === "number" || typeof v === "boolean" || v === null) detail[k] = v;
      else if (typeof v === "string") detail[k] = v.slice(0, 160);
    }
  }
  const callId = Number(body.callId);
  await logEvent(id, Number.isFinite(callId) ? callId : null, "cliente", event, detail);
  return new Response(null, { status: 204 });
}
