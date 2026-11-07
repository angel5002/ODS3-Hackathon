// The patient's pre-visit, by its token (the capability in the link). GET = the conversation; POST = consent
// ({action:"consent", respondent}) or one answer ({action:"answer", text, version}). The browser never reads the
// tables: everything goes through here. A double submit carries the same version and is applied once.
import { NextResponse } from "next/server";
import { answer, askPersonNow, giveConsent, loadByToken, patientView } from "@/lib/preconsulta/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

const GONE = { error: "Este enlace de preconsulta no existe o ya venció." };

export async function GET(_req: Request, { params }: Ctx) {
  const { token } = await params;
  try {
    const row = await loadByToken(token);
    if (!row) return NextResponse.json(GONE, { status: 404 });
    return NextResponse.json(await patientView(row), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudo cargar la preconsulta." }, { status: 503 });
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  const raw = await req.text().catch(() => "");
  if (raw.length > 2000) return NextResponse.json({ error: "Mensaje demasiado largo." }, { status: 413 });
  let body: { action?: unknown; respondent?: unknown; text?: unknown; version?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  try {
    const row = await loadByToken(token);
    if (!row) return NextResponse.json(GONE, { status: 404 });
    if (body.action === "consent") {
      await giveConsent(row, body.respondent);
    } else if (body.action === "persona") {
      if (row.status !== "derivada_emergencia") return NextResponse.json({ error: "Escriba PERSONA en el chat." }, { status: 409 });
      await askPersonNow(row);
    } else if (body.action === "answer") {
      const text = String(body.text ?? "").trim();
      if (!text) return NextResponse.json({ error: "Escriba su respuesta." }, { status: 400 });
      if (!row.consent_at) return NextResponse.json({ error: "Primero acepte para empezar." }, { status: 409 });
      const r = await answer(row, text, Number(body.version));
      if (!r.ok && r.reason === "version") {
        // another tab or a double tap already advanced it: return the current conversation
        const fresh = await loadByToken(token);
        return NextResponse.json({ ...(fresh ? await patientView(fresh) : {}), stale: true }, { status: 409 });
      }
    } else {
      return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
    }
    const fresh = await loadByToken(token);
    return NextResponse.json(fresh ? await patientView(fresh) : GONE);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo guardar. Intente de nuevo." }, { status: 503 });
  }
}
