// A patient starts a pre-visit by themselves (demo QR or /preconsulta): a fictitious name, nothing else. The
// answer is the link with the token, which is the only key to that conversation. At most 20 per minute.
import { NextResponse } from "next/server";
import { createPreconsulta, recentPatientCreations } from "@/lib/preconsulta/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text().catch(() => "");
  if (raw.length > 500) return NextResponse.json({ error: "Solicitud demasiado grande." }, { status: 413 });
  let body: { alias?: unknown; time?: unknown } = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  try {
    if ((await recentPatientCreations()) >= 20) {
      return NextResponse.json({ error: "Hay muchas preconsultas a la vez. Intente en un minuto." }, { status: 429 });
    }
    const created = await createPreconsulta({ alias: body.alias, time: body.time, source: "paciente" });
    return NextResponse.json({ token: created.token, path: created.path });
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo iniciar la preconsulta. Intente de nuevo." }, { status: 503 });
  }
}
