// The doctor's side of the pre-visit (staff only: src/proxy.ts matches /api/staff/*).
//   GET                 → the recent pre-visits (no answers, just state)
//   GET ?id=<uuid>      → summary for the doctor, corrections and the conversation (audit)
//   POST {action:"create", alias, time?, gender?}  → a new pre-visit link for a (fictitious) patient
//   POST {action:"edit", id, field, value}         → a correction by the doctor (recorded)
import { NextResponse } from "next/server";
import { createPreconsulta, staffDetail, staffEdit, staffList } from "@/lib/preconsulta/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  try {
    if (!id) return NextResponse.json({ sessions: await staffList() });
    const d = await staffDetail(id);
    if (!d) return NextResponse.json({ error: "No se encontró la preconsulta." }, { status: 404 });
    return NextResponse.json(d, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudo cargar la preconsulta." }, { status: 503 });
  }
}

export async function POST(req: Request) {
  let body: { action?: unknown; alias?: unknown; time?: unknown; gender?: unknown; id?: unknown; field?: unknown; value?: unknown; actor?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  try {
    if (body.action === "create") {
      return NextResponse.json(await createPreconsulta({ alias: body.alias, time: body.time, gender: body.gender, source: "personal" }));
    }
    if (body.action === "edit") {
      await staffEdit(String(body.id ?? ""), body.field, body.value, "Médico");
      return NextResponse.json(await staffDetail(String(body.id)));
    }
    return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/invalid field|value required/.test(msg)) return NextResponse.json({ error: "Escriba la corrección." }, { status: 400 });
    if (/not found/.test(msg)) return NextResponse.json({ error: "No se encontró la preconsulta." }, { status: 404 });
    console.error(msg);
    return NextResponse.json({ error: "No se pudo guardar. Intente de nuevo." }, { status: 503 });
  }
}
