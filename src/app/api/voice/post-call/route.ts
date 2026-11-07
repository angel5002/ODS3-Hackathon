// ElevenLabs post-call webhook (RF-15): validated with its HMAC signature; stores the summary and the
// duration in `calls` (never the full transcript). Idempotent: a retried delivery updates the same row.
import { NextResponse } from "next/server";
import { rpc, serverDb } from "@/lib/supabase/server";
import { verifyWebhook } from "@/lib/voice/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("elevenlabs-signature"), process.env.ELEVENLABS_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  if (event.type !== "post_call_transcription" || !event.data) return NextResponse.json({ received: true });
  const d = event.data as {
    conversation_id?: string;
    analysis?: { transcript_summary?: string; call_successful?: string };
    metadata?: { call_duration_secs?: number };
    conversation_initiation_client_data?: { dynamic_variables?: Record<string, unknown> };
  };
  const callId = Number(d.conversation_initiation_client_data?.dynamic_variables?.call_id);
  if (!Number.isFinite(callId)) return NextResponse.json({ received: true });
  await serverDb()
    .from("calls")
    .update({
      external_id: d.conversation_id ?? null,
      summary: (d.analysis?.transcript_summary ?? "").slice(0, 600) || null,
      duration_s: d.metadata?.call_duration_secs ?? null,
      provider: "elevenlabs",
    })
    .eq("id", callId);
  await rpc("hint", { p_kind: "call" });
  return NextResponse.json({ received: true });
}
