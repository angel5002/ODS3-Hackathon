// Anonymous chat session (RF-13): created on first visit, signed httpOnly cookie, no phone or e-mail.
// DELETE = "Borrar mi conversación".
import { NextResponse } from "next/server";
import { rpc, serverDb } from "@/lib/supabase/server";
import { CHAT_COOKIE, COOKIE_OPTIONS, cookieValue, createSession, loadSession, readCookie } from "@/lib/chat/session";
import { CONSENT } from "@/lib/bot/machine";
import { isJuryToken } from "@/lib/jury/tokens";
import { juryOpen } from "@/lib/jury/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // E5 jury cards: /j/<token> asks for a session of THAT card; another session in the cookie (an earlier
  // visit to /pedir-cita, or another card) is not reused, so each card's requests stay under its token.
  const body = await req.json().catch(() => ({}));
  const jury = isJuryToken(body?.jury) ? body.jury : null;
  const existing = readCookie(req);
  const s = existing ? await loadSession(existing) : null;
  if (s && (!jury || (await sessionOfCard(s.id, jury)))) {
    return NextResponse.json({ alias: s.alias, topic: s.topic, consent: Boolean(s.consent_at) });
  }
  if (jury && !(await serverDb().from("jury_cards").select("token").eq("token", jury).maybeSingle()).data) {
    return NextResponse.json({ error: "Esta cartilla no existe." }, { status: 404 });
  }
  await rpc("purge_expired_sessions").catch(() => {});
  const created = await createSession();
  if (jury) await juryOpen(jury, created.id);
  const { data: conv } = await serverDb().from("conversations").select("id").eq("session_id", created.id).single();
  if (conv) {
    await serverDb()
      .from("chat_messages")
      .insert({ conversation_id: conv.id, direction: "saliente", kind: "bot", body: CONSENT, buttons: ["ACEPTO", "SALIR"] });
  }
  await rpc("hint", { p_kind: "live" });
  const res = NextResponse.json({ alias: created.alias, topic: created.topic, consent: false });
  res.cookies.set(CHAT_COOKIE, cookieValue(created.id), COOKIE_OPTIONS);
  return res;
}

async function sessionOfCard(sessionId: string, token: string) {
  const { data } = await serverDb().from("jury_visits").select("id").eq("token", token).eq("chat_session_id", sessionId).limit(1);
  return Boolean(data?.length);
}

export async function DELETE(req: Request) {
  const id = readCookie(req);
  if (id) await serverDb().from("chat_sessions").delete().eq("id", id);
  await rpc("hint", { p_kind: "live" });
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(CHAT_COOKIE);
  return res;
}
