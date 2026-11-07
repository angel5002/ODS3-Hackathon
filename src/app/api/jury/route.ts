// Jury cards (track E), public and scoped by the card token like /api/patient.
//   GET  ?token=j-…            the card's fictitious character and whether a voice line is free now
//   POST {token, action:"call"} the card's appointment rings on its simulated phone (the confirmation agent);
//                               if every voice line is busy it answers { voice: false } and the page keeps to messages.
import { NextResponse } from "next/server";
import { rpc, serverDb } from "@/lib/supabase/server";
import { juryFail, loadCard, voiceAvailable } from "@/lib/jury/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const card = await loadCard(new URL(req.url).searchParams.get("token"));
  if (!card) return NextResponse.json({ error: "Esta cartilla no existe. Vuelva a escanear el código." }, { status: 404 });
  return NextResponse.json({ card, voice: card.channel === "chat" ? false : await voiceAvailable() });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const card = await loadCard(body.token);
  if (!card) return NextResponse.json({ error: "Esta cartilla no existe. Vuelva a escanear el código." }, { status: 404 });
  try {
    switch (body.action) {
      case "call": {
        if (card.channel === "chat" || !["cancela", "confirma"].includes(card.kind)) return NextResponse.json({ ok: true, voice: false });
        const db = serverDb();
        const { data: p } = await db.from("patients").select("id").eq("token", card.token).maybeSingle();
        if (!p) return NextResponse.json({ ok: true, voice: false });
        const { data: a } = await db
          .from("appointments")
          .select("id,status")
          .eq("patient_id", p.id)
          .eq("is_base", false)
          .eq("origin", "futura")
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!a || ["liberada", "reasignada", "confirmada"].includes(a.status)) return NextResponse.json({ ok: true, voice: false, done: true });
        const { data: live } = await db.from("calls").select("id").eq("appointment_id", a.id).in("status", ["sonando", "en_curso"]).limit(1);
        if (live?.length) return NextResponse.json({ ok: true, voice: true, callId: live[0].id });
        if (!(await voiceAvailable())) return NextResponse.json({ ok: true, voice: false });
        const callId = await rpc<number>("start_call", { p_appt: a.id, p_actor: `Cartilla del jurado (${card.character})` });
        return NextResponse.json({ ok: true, voice: true, callId });
      }
      default:
        return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
    }
  } catch (e) {
    return juryFail(e);
  }
}
