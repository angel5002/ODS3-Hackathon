// Regulator (role "regulador" or "admision", see src/proxy.ts). Only the blind view leaves this route.
import { NextResponse } from "next/server";
import { rpc } from "@/lib/supabase/server";
import { blind } from "@/lib/blind";

export const dynamic = "force-dynamic";
const ACTOR = "Regulador";

// Errors never echo database messages (they could name a person): fixed texts only.
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function GET() {
  try {
    const rows = await rpc<Record<string, unknown>[]>("regulator_list");
    return NextResponse.json({ rows: blind(rows ?? []) });
  } catch {
    return err("No se pudo cargar la cola de regulación.", 500);
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = Number(body.requestId);
  if (!Number.isFinite(id)) return err("Solicitud no válida.");
  try {
    switch (body.action) {
      case "regulate":
        if (!["P1", "P2", "P3", "P4"].includes(body.category)) return err("Elija una categoría de P1 a P4.");
        await rpc("regulate", { p_request: id, p_category: body.category, p_actor: ACTOR });
        return NextResponse.json({ ok: true });
      case "info":
        await rpc("request_info", { p_request: id, p_question: String(body.question ?? "").slice(0, 300), p_actor: ACTOR });
        return NextResponse.json({ ok: true });
      case "emergency":
        await rpc("derive_emergency", { p_request: id, p_actor: ACTOR, p_source: "regulador" });
        return NextResponse.json({ ok: true });
      default:
        return err("Acción no válida.");
    }
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (/closed/.test(m)) return err("La solicitud ya está cerrada.");
    if (/not pending/.test(m)) return err("La solicitud ya fue regulada.");
    return err("No se pudo completar la acción. Intente de nuevo.");
  }
}
