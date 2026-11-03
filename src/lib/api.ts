import { NextResponse } from "next/server";

/** Turns database errors into short messages staff and patients can understand. */
const FRIENDLY: [RegExp, string][] = [
  [/slot is not free/, "Ese cupo ya no está libre."],
  [/already reassigned/, "Ese cupo ya fue reasignado."],
  [/open offer/, "Ya hay una oferta abierta para este cupo. Espere la respuesta o que venza el plazo."],
  [/offer is no longer open/, "Esta oferta ya no está disponible."],
  [/offer expired/, "El plazo para responder ya venció."],
  [/already has a slot/, "Esa persona ya tiene una cita asignada."],
  [/cannot call a released slot/, "No se puede llamar: el cupo ya está liberado."],
  [/specialty mismatch/, "La persona no está en la lista de espera de esa especialidad."],
];

export function fail(error: unknown, status = 400) {
  const msg = error instanceof Error ? error.message : String(error);
  const friendly = FRIENDLY.find(([re]) => re.test(msg))?.[1] ?? "No se pudo completar la acción. Intente de nuevo.";
  if (!FRIENDLY.some(([re]) => re.test(msg))) console.error(msg);
  return NextResponse.json({ error: friendly }, { status });
}

export function ok(data: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, ...data });
}

