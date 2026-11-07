// Server side of the jury cards (track E). The card token in the QR is the capability: it only opens that
// card's fictitious character (like /t/<token> for the simulated phones).
import { NextResponse } from "next/server";
import { rpc, serverDb } from "@/lib/supabase/server";
import { maxConcurrent } from "@/lib/voice/sessions";
import { isJuryToken } from "./tokens";
import type { JurySnapshot } from "./overview";

export type JuryKind = "cancela" | "confirma" | "pide_cita" | "acepta_oferta";
export type PublicCard = {
  token: string;
  character: string;
  story: string;
  tryLine: string;
  channel: "voz" | "chat" | "voz_o_chat";
  kind: JuryKind;
  specialty: string;
};

export async function loadCard(token: unknown): Promise<PublicCard | null> {
  if (!isJuryToken(token)) return null;
  const { data } = await serverDb()
    .from("jury_cards")
    .select("token,character,story,try_line,channel,kind,specialty")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  return {
    token: data.token,
    character: data.character,
    story: data.story,
    tryLine: data.try_line,
    channel: data.channel,
    kind: data.kind,
    specialty: data.specialty,
  };
}

/** Is there a free voice line right now? (The voice track reserves lines for "j-" tokens; this is only a hint
 *  so the card page offers the call or goes straight to messages, never an error.) */
export async function voiceAvailable(): Promise<boolean> {
  if (!process.env.ELEVENLABS_API_KEY) return false;
  try {
    const o = await rpc<{ active: number; queued: number }>("voice_overview");
    return (o?.active ?? 0) < maxConcurrent() && (o?.queued ?? 0) === 0;
  } catch {
    return false;
  }
}

export async function juryOpen(token: string, sessionId: string | null = null) {
  return rpc<{ token: string; kind: JuryKind; patient: string | null }>("jury_open", { p_token: token, p_session: sessionId });
}

export async function jurySnapshot(includeTest: boolean) {
  return rpc<JurySnapshot>("jury_snapshot", { p_include_test: includeTest });
}

/** Database errors of the jury functions, in words the operator understands. */
const JURY_ERRORS: [RegExp, string][] = [
  [/jury card not found/, "Esa cartilla no existe."],
  [/not a jury request/, "Esa solicitud no es de una cartilla del jurado."],
  [/jury slot not released/, "Todavía no se liberó el cupo de esta cartilla."],
  [/jury card has no request/, "Esta cartilla no tiene una solicitud que ofrecer."],
  [/jury request missing/, "Todavía no hay una solicitud abierta de esta cartilla."],
  [/jury request not regulated/, "Primero categorice la solicitud."],
  [/jury request is not a candidate/, "Con esa categoría hay otras personas antes en la lista: el cupo iría a ellas. Revise la categoría."],
  [/jury no open offer/, "No hay una oferta abierta para esta cartilla."],
  [/open offer/, "Ya hay una oferta abierta. Espere la respuesta o ciérrela."],
  [/no candidates/, "No hay candidatos en la lista para este cupo y esta zona."],
  [/slot is not free/, "Ese cupo ya no está libre."],
  [/request is closed/, "La solicitud ya está cerrada."],
  [/invalid category/, "Elija una categoría de P1 a P4."],
  [/revert downstream first/, "Primero revierta el cupo liberado por efecto dominó."],
  [/only test cards/, "Solo se pueden borrar cartillas de prueba."],
];

export function juryFail(e: unknown, status = 400) {
  const msg = e instanceof Error ? e.message : String(e);
  const hit = JURY_ERRORS.find(([re]) => re.test(msg));
  if (!hit) console.error(`[jurado] ${msg}`);
  return NextResponse.json({ error: hit?.[1] ?? "No se pudo completar la acción. Intente de nuevo." }, { status });
}
