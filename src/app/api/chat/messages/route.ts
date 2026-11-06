// Chat messages (RF-13). GET: the session's own conversation and its ringing call. POST: one message
// from the person, validated (session, rate limit, length) and passed to the router.
// A missing, foreign or tampered cookie gets 401: a session can never read or write another one.
import { NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase/server";
import { CHAT_COOKIE, loadSession, readCookie } from "@/lib/chat/session";
import { LIMITS, handleMessage } from "@/lib/chat/router";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Su sesión de chat venció. Recargue la página." }, { status: 401 });
}

export async function GET(req: Request) {
  const id = readCookie(req);
  const s = id ? await loadSession(id) : null;
  if (!s) return unauthorized();
  const db = serverDb();
  const { data: conv } = await db.from("conversations").select("id").eq("session_id", s.id).single();
  const [{ data: messages }, { data: calls }, { data: linked }] = await Promise.all([
    db.from("chat_messages").select("id,direction,kind,body,buttons,ref,answered_with,created_at").eq("conversation_id", conv?.id ?? -1).order("id").limit(300),
    db
      .from("calls")
      .select("*")
      .or(`chat_session_id.eq.${s.id}${s.linked_patient_id ? `,patient_id.eq.${s.linked_patient_id}` : ""}`)
      .in("status", ["sonando", "en_curso"])
      .neq("purpose", "registro")
      .order("id", { ascending: false })
      .limit(1),
    s.linked_patient_id ? db.from("patients").select("first_name").eq("id", s.linked_patient_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  await db.from("chat_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", s.id);
  return NextResponse.json({
    alias: s.alias,
    topic: s.topic,
    consent: Boolean(s.consent_at),
    linkedName: linked?.first_name ?? null,
    messages: messages ?? [],
    call: calls?.[0] ?? null,
  });
}

export async function POST(req: Request) {
  const id = readCookie(req);
  const s = id ? await loadSession(id) : null;
  if (!s) return unauthorized();
  const body = await req.json().catch(() => ({}));
  if (body.soundReady != null) {
    await serverDb().from("chat_sessions").update({ sound_ready: Boolean(body.soundReady) }).eq("id", s.id);
    return NextResponse.json({ ok: true });
  }
  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Escriba un mensaje." }, { status: 400 });
  if (text.length > LIMITS.maxChars) return NextResponse.json({ error: `Máximo ${LIMITS.maxChars} caracteres por mensaje.` }, { status: 400 });

  const db = serverDb();
  const { data: conv } = await db.from("conversations").select("id").eq("session_id", s.id).single();
  if (!conv) return unauthorized();
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await db
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conv.id)
    .eq("direction", "entrante")
    .gt("created_at", since);
  if ((count ?? 0) >= LIMITS.perTenMinutes) {
    return NextResponse.json({ error: "Demasiados mensajes en poco tiempo. Espere unos minutos." }, { status: 429 });
  }

  const t0 = Date.now();
  try {
    const r = await handleMessage(s, conv.id, text);
    await db.rpc("chat_hint", { p_session: s.id });
    const res = NextResponse.json({ ok: true, ms: Date.now() - t0, deleted: Boolean(r.deleted), replies: r.deleted ? r.replies : undefined, meta: r.meta });
    if (r.deleted) res.cookies.delete(CHAT_COOKIE);
    return res;
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "No pudimos procesar su mensaje. Intente de nuevo o escriba PERSONA." }, { status: 500 });
  }
}
