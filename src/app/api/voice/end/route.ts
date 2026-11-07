// End of a voice session: hang up, unmount, or the tab closing (navigator.sendBeacon on `pagehide`).
// With closeCall the call is closed too (unless another live session took it over), so a closed tab never
// leaves a call "en curso". The session id is the capability.
import { NextResponse } from "next/server";
import { UUID, endSession } from "@/lib/voice/sessions";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // sendBeacon sends text/plain or a Blob: read the raw text
  const raw = await req.text().catch(() => "");
  if (raw.length > 1000) return NextResponse.json({ error: "body" }, { status: 413 });
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "body" }, { status: 400 });
  }
  const id = String(body.voiceSessionId ?? "");
  if (!UUID.test(id)) return NextResponse.json({ error: "session" }, { status: 400 });
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 160) : "fin";
  const result = typeof body.result === "string" ? body.result.slice(0, 200) : undefined;
  try {
    return NextResponse.json(await endSession(id, reason, body.closeCall === true, result));
  } catch {
    return NextResponse.json({ ended: false });
  }
}
