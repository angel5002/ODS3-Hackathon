// "Formulario" of /pedir-cita: the same front-desk form as a fallback for the chat and the call.
// It needs the page's anonymous chat session, so the answer (offers, validation) reaches that same chat.
import { NextResponse } from "next/server";
import { rpc, serverDb } from "@/lib/supabase/server";
import { loadSession, readCookie } from "@/lib/chat/session";
import { scrubReason } from "@/lib/scrub";
import { SPECIALTIES } from "@/lib/labels";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const id = readCookie(req);
  const s = id ? await loadSession(id) : null;
  if (!s) return NextResponse.json({ error: "Su sesión venció. Recargue la página." }, { status: 401 });
  if (s.linked_request_id) {
    return NextResponse.json({ error: "Esta conversación ya registró una solicitud. Para otra, borre la conversación y empiece de nuevo." }, { status: 400 });
  }
  const b = await req.json().catch(() => ({}));
  const name = String(b.display_name ?? "").trim().slice(0, 80);
  const specialty = [...SPECIALTIES, "Por definir"].includes(b.specialty) ? b.specialty : null;
  if (!name || !specialty) return NextResponse.json({ error: "Escriba un nombre ficticio y elija la especialidad." }, { status: 400 });
  try {
    if (!s.consent_at) await serverDb().from("chat_sessions").update({ consent_at: new Date().toISOString(), bot: { step: "done", data: {} } }).eq("id", s.id);
    const r = await rpc<{ id: number; code: string }>("create_request", {
      p: {
        display_name: name,
        doc_type: b.doc_type,
        age: Math.max(0, Math.min(120, Number(b.age) || 0)),
        specialty,
        referral: Boolean(b.referral),
        reason_text: scrubReason(String(b.reason_text ?? ""), name),
        pregnant: Boolean(b.pregnant),
        disability: Boolean(b.disability),
        first_visit: b.first_visit !== false,
        preferred_channel: b.preferred_channel === "llamada" ? "llamada" : "chat",
        short_notice_ok: Boolean(b.short_notice_ok),
        insurance: typeof b.insurance === "boolean" ? b.insurance : null,
        district: String(b.district ?? "").slice(0, 60),
        source: "formulario",
        chat_session_id: s.id,
        actor: "Formulario de /pedir-cita",
      },
    });
    const { data: conv } = await serverDb().from("conversations").select("id").eq("session_id", s.id).single();
    if (conv) {
      await serverDb().from("chat_messages").insert({
        conversation_id: conv.id,
        direction: "saliente",
        kind: "bot",
        body: `Listo. Su número de solicitud es ${r.code}. No es una cita todavía: un profesional la revisará y le avisaremos por aquí cuando haya un cupo para usted. Si deja de responder, no pierde su lugar.`,
      });
      await rpc("chat_hint", { p_session: s.id });
    }
    return NextResponse.json({ code: r.code });
  } catch {
    return NextResponse.json({ error: "No se pudo registrar. Intente de nuevo." }, { status: 500 });
  }
}
