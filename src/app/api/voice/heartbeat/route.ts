// Heartbeat of a live voice session (every 10 s) and its state changes (conectando → activa, error).
// The session id (a random UUID only the owner device received) is the capability. Answers { alive: false }
// when the session or its call ended elsewhere: the device must hang up.
import { NextResponse } from "next/server";
import { UUID, updateSession } from "@/lib/voice/sessions";

export const dynamic = "force-dynamic";
const STATES = new Set(["activa", "error"]);

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = String(body.voiceSessionId ?? "");
  if (!UUID.test(id)) return NextResponse.json({ error: "session" }, { status: 400 });
  const state = typeof body.state === "string" && STATES.has(body.state) ? body.state : null;
  const conversation = typeof body.conversationId === "string" && /^[A-Za-z0-9_-]{6,80}$/.test(body.conversationId) ? body.conversationId : null;
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 160) : null;
  try {
    return NextResponse.json(await updateSession(id, state, { conversation, reason }));
  } catch {
    return NextResponse.json({ alive: false, state: "desconocida" });
  }
}
