// Scene playback steps (pitch v7 scenes 1 and 2) → voice_events, logged as a SCENE and never as a call:
// source 'cliente', kind 'escena.<id>.<step>', no session and no call. Staff only (src/proxy.ts matches
// /api/staff/*, role admisión). The voice dashboards drop kinds starting with "escena" (view=voice in
// /api/staff/data), so a rehearsal never counts as a call.
import { rpc } from "@/lib/supabase/server";
import { SCENES } from "@/lib/demo/scenes";

export const dynamic = "force-dynamic";

// a small per-instance limit: a held-down key cannot flood the table
const recent: number[] = [];

export async function POST(req: Request) {
  const raw = await req.text().catch(() => "");
  if (raw.length > 500) return new Response(null, { status: 413 });
  let body: { scene?: unknown; step?: unknown; line?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  const scene = String(body.scene ?? "");
  const step = Number(body.step);
  if (!(scene in SCENES) || !Number.isInteger(step)) return new Response(null, { status: 400 });
  const lines = SCENES[scene as keyof typeof SCENES].lines;
  if (step < 0 || step >= lines.length) return new Response(null, { status: 400 });
  const now = Date.now();
  while (recent.length && recent[0] < now - 60_000) recent.shift();
  if (recent.length >= 120) return new Response(null, { status: 429 });
  recent.push(now);
  try {
    await rpc("voice_log", {
      p_session: null,
      p_call: null,
      p_source: "cliente",
      p_kind: `escena.${scene}.${step}`,
      p_detail: { linea: lines[step].id, quien: lines[step].who, escena: true },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
  return new Response(null, { status: 204 });
}
