// Issues a signed URL for the ElevenLabs agent of ONE call, only to the phone or chat session that owns
// that call (RF-15). Without credentials or agents it answers { session: null } and the call screen
// continues with the fixed script.
import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { readCookie } from "@/lib/chat/session";
import { rpc, serverDb } from "@/lib/supabase/server";
import { ownsCall } from "@/lib/voice/auth";
import { AGENT_FOR_PURPOSE, signedUrl, toolToken } from "@/lib/voice/server";
import { callContext, loadCall } from "@/lib/voice/tools";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  let callId = Number(body.callId);
  const diag = typeof body.diag === "string" && /^[a-z0-9]{4,16}$/.test(body.diag) ? body.diag : "-";
  const log = (msg: string) => console.info(`[voz ${diag}] servidor session ${msg}`);

  // registration by voice from /pedir-cita: the chat session starts its own call
  if (body.mode === "registro") {
    const session = readCookie(req);
    if (!session) return fail("session", 401);
    const { data: s } = await serverDb().from("chat_sessions").select("id,consent_at").eq("id", session).maybeSingle();
    if (!s) return fail("session", 401);
    const { data: c, error } = await serverDb()
      .from("calls")
      .insert({ chat_session_id: session, purpose: "registro", agent: "asistia-registro", status: "en_curso", answered_at: new Date().toISOString() })
      .select("id")
      .single();
    if (error || !c) {
      log(`registro insert_error -> 500`);
      return fail(error?.message ?? "call", 500);
    }
    callId = c.id;
    log(`registro nueva llamada call=${callId}`);
    await rpc("hint", { p_kind: "call" });
  }

  const call = await loadCall(callId);
  if (!call || !(await ownsCall(req, call, body.token))) {
    log(`call=${callId} sin_dueño -> 404`);
    return fail("unknown call", 404);
  }
  if (!["sonando", "en_curso"].includes(call.status)) {
    log(`call=${callId} estado=${call.status} -> 409`);
    return fail("call ended", 409);
  }

  try {
    const key = AGENT_FOR_PURPOSE[call.purpose];
    const url = await signedUrl(key, diag);
    if (!url) {
      log(`call=${callId} sin_agentes -> 200 session=null`);
      return NextResponse.json({ session: null, callId, reason: "Los agentes de voz no están configurados" });
    }
    log(`call=${callId} purpose=${call.purpose} estado=${call.status} -> 200 url_firmada`);
    const ctx = await callContext(call);
    return NextResponse.json({
      callId,
      session: { signedUrl: url, agent: key, dynamicVariables: { ...ctx, token: toolToken(call.id) } },
    });
  } catch (e) {
    log(`call=${callId} error=${(e as Error).message} -> 200 session=null`);
    return NextResponse.json({ session: null, callId, reason: (e as Error).message });
  }
}
