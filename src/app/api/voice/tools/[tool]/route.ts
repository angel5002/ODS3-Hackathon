// Server tools of the ElevenLabs agents (RF-15). Rejected unless:
//   1. the secret header matches ELEVENLABS_TOOL_SECRET,
//   2. call_id + token (dynamic variables of the conversation) match this call,
//   3. the call is still ringing or in progress, and
//   4. the tool belongs to the agent of that call's task.
// The answer is one short sentence the agent can say aloud.
import { NextResponse } from "next/server";
import { sameSecret, toolToken } from "@/lib/voice/server";
import { loadCall, runTool } from "@/lib/voice/tools";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  const secret = req.headers.get("x-asistia-secret");
  if (!sameSecret(secret, process.env.ELEVENLABS_TOOL_SECRET)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const callId = Number(body.call_id);
  if (!Number.isFinite(callId) || !sameSecret(String(body.token ?? ""), toolToken(callId))) {
    return NextResponse.json({ error: "invalid call" }, { status: 403 });
  }
  const call = await loadCall(callId);
  if (!call) return NextResponse.json({ error: "invalid call" }, { status: 403 });
  if (!["sonando", "en_curso"].includes(call.status)) {
    return NextResponse.json({ error: "call ended", say: "La llamada ya terminó." }, { status: 409 });
  }
  try {
    const { call_id: _c, token: _t, ...args } = body;
    void _c;
    void _t;
    const r = await runTool(call, tool, args);
    return NextResponse.json({ say: r.say, ...(r.data ? { data: r.data } : {}) });
  } catch (e) {
    const m = (e as Error).message;
    if (/not allowed|unknown tool/.test(m)) return NextResponse.json({ error: "tool not allowed" }, { status: 403 });
    return NextResponse.json({ say: "No pude registrarlo. Una persona del equipo le contactará.", error: "failed" }, { status: 200 });
  }
}
