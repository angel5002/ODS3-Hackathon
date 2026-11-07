import { NextResponse } from "next/server";

/** Turns database errors into short messages staff and patients can understand. */
const FRIENDLY: [RegExp, string][] = [
  // pitch scene 1 (docs/escenas.md)
  [/tito not seeded/, "Primero prepare a Tito: «Escena 1: preparar a Tito»."],
  [/tito is not first|no free slot where Tito/, "Todavía no hay un cupo de Oncología Médica libre con Tito primero: Carmen debe avisar que no podrá ir."],
  [/escena1: no open offer/, "No hay una oferta abierta de Oncología Médica para cerrar."],
  [/slot is not free/, "Ese cupo ya no está libre."],
  [/already reassigned/, "Ese cupo ya fue reasignado."],
  [/open offer/, "Ya hay una oferta abierta para este cupo. Espere la respuesta o que venza el plazo."],
  [/offer is no longer open/, "Esta oferta ya no está disponible."],
  [/offer expired/, "El plazo para responder ya venció."],
  [/already has a slot/, "Esa persona ya tiene una cita asignada."],
  [/cannot call a released slot/, "No se puede llamar: el cupo ya está liberado."],
  [/specialty mismatch/, "La persona no está en la lista de espera de esa especialidad."],
  [/no candidates/, "No hay candidatos en la lista para este cupo y esta zona."],
  [/not a candidate/, "Esta oferta no es para usted."],
  [/invalid withdrawal reason/, "Elija un motivo de retiro. No responder no es un motivo válido."],
  [/withdrawal text required/, "Escriba el motivo del retiro."],
  [/request has an open offer/, "La solicitud tiene una oferta o asignación abierta. Ciérrela antes de retirarla."],
  [/request is closed/, "La solicitud ya está cerrada."],
  [/request is not pending/, "La solicitud ya fue regulada."],
  [/invalid category/, "Elija una categoría de P1 a P4."],
  [/revert reason required/, "Escriba el motivo para revertir."],
  [/revert downstream first/, "Primero revierta la asignación del cupo que se liberó en cadena."],
  [/nothing to review/, "Esa reprogramación ya fue revisada."],
  [/invalid reschedule option/, "Esa fecha ya no está disponible."],
  [/name required/, "Escriba el nombre (puede ser ficticio)."],
  [/specialty required/, "Elija la especialidad."],
  [/session/, "Su sesión de chat venció. Recargue la página."],
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

