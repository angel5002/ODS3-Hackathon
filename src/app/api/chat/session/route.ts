// Anonymous chat session (RF-13): created on first visit, signed httpOnly cookie, no phone or e-mail.
// DELETE = "Borrar mi conversación".
import { NextResponse } from "next/server";
import { rpc, serverDb } from "@/lib/supabase/server";
import { CHAT_COOKIE, COOKIE_OPTIONS, cookieValue, createSession, loadSession, readCookie } from "@/lib/chat/session";
import { CONSENT } from "@/lib/bot/machine";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const existing = readCookie(req);
  const s = existing ? await loadSession(existing) : null;
  if (s) return NextResponse.json({ alias: s.alias, topic: s.topic, consent: Boolean(s.consent_at) });
  await rpc("purge_expired_sessions").catch(() => {});
  const created = await createSession();
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

export async function DELETE(req: Request) {
  const id = readCookie(req);
  if (id) await serverDb().from("chat_sessions").delete().eq("id", id);
  await rpc("hint", { p_kind: "live" });
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(CHAT_COOKIE);
  return res;
}
