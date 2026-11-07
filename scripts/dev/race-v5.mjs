// Race tests on the database functions (E5, hito 2). RESETS the shared demo database before and after:
//   ALLOW_DB_WRITE=1 node scripts/dev/race-v5.mjs
//   - two simultaneous acceptances of the same slot offer, then two simultaneous closes: exactly ONE assignment
//   - the same person accepting twice at the same time: exactly ONE response
//   - two devices claiming the voice session of the same call at the same time: exactly ONE gets it
//   - capacity: with p_max = 1 a second call waits in the queue with position 1
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { requireDbWrite } from "./db-write-guard.mjs";

requireDbWrite("race-v5.mjs");
config({ path: ".env.local", quiet: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const rpc = async (fn, args) => {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
};
const settle = (ps) => Promise.allSettled(ps);
function assert(c, m) {
  if (!c) throw new Error(`FALLA: ${m}`);
  console.log("ok", m);
}

await rpc("reset_demo");
try {
  // ---- slot offer: simultaneous acceptances and closes
  await rpc("send_reminders");
  const { data: carmen } = await db.from("patients").select("id").eq("token", "carmen").single();
  const { data: appt } = await db.from("appointments").select("id").eq("patient_id", carmen.id).eq("is_base", true).single();
  await rpc("patient_reply", { p_appt: appt.id, p_reply: "libera", p_channel: "mensaje" });
  const { data: slot } = await db.from("slots").select("id").eq("source_appointment_id", appt.id).single();
  const offer = await rpc("approve_offer", { p_slot: slot.id, p_actor: "Prueba de carrera" });
  const { data: so } = await db.from("slot_offers").select("candidate_ids").eq("id", offer).single();
  const [a, b] = so.candidate_ids;
  const acc = await settle([
    rpc("respond_offer", { p_offer: offer, p_request: a, p_response: "acepta", p_channel: "prueba" }),
    rpc("respond_offer", { p_offer: offer, p_request: b, p_response: "acepta", p_channel: "prueba" }),
    rpc("respond_offer", { p_offer: offer, p_request: a, p_response: "acepta", p_channel: "prueba" }),
  ]);
  const { count: responses } = await db.from("offer_responses").select("*", { count: "exact", head: true }).eq("offer_id", offer).eq("response", "acepta");
  assert(responses === 2, `aceptaciones simultáneas: ${responses} respuestas (2 personas, la repetida no duplica; ${acc.filter((x) => x.status === "rejected").length} rechazadas)`);
  const closes = await settle([rpc("close_offer", { p_offer: offer, p_actor: "Prueba A" }), rpc("close_offer", { p_offer: offer, p_actor: "Prueba B" })]);
  const { count: assignments } = await db.from("assignments").select("*", { count: "exact", head: true }).eq("slot_id", slot.id);
  assert(assignments === 1, `dos cierres simultáneos: exactamente 1 asignación (cierres: ${closes.map((c) => c.status).join(", ")})`);

  // ---- voice: two devices claim the same call at the same time
  const { data: rosa } = await db.from("patients").select("id").eq("token", "rosa").single();
  const call = await rpc("start_test_call", { p_session: null, p_patient: rosa.id });
  const claims = await Promise.all([rpc("voice_claim", { p_call: call, p_owner_kind: "telefono", p_max: 10 }), rpc("voice_claim", { p_call: call, p_owner_kind: "telefono", p_max: 10 })]);
  const won = claims.filter((c) => c.ok);
  assert(won.length === 1 && claims.some((c) => c.reason === "en_otro_dispositivo"), `dos reclamos simultáneos de la llamada ${call}: uno gana, el otro recibe "en_otro_dispositivo"`);
  // conditional transitions: the session cannot go back to "conectando" once active
  await rpc("voice_update", { p_session: won[0].session_id, p_state: "activa" });
  const back = await rpc("voice_update", { p_session: won[0].session_id, p_state: "conectando" });
  assert(back.state === "activa" && back.accepted === false, "transición condicional: activa no vuelve a conectando");

  // ---- capacity: with max 1, a second call waits in the queue
  const { data: julio } = await db.from("patients").select("id").eq("token", "julio").single();
  const call2 = await rpc("start_test_call", { p_session: null, p_patient: julio.id });
  const q = await rpc("voice_claim", { p_call: call2, p_owner_kind: "telefono", p_max: 1 });
  assert(!q.ok && q.reason === "ocupado" && q.position === 1, `capacidad 1: la segunda llamada espera en la fila (posición ${q.position})`);
  // the first one ends (as with a pagehide beacon) → its call closes, and the queued one gets the line
  await rpc("voice_end", { p_session: won[0].session_id, p_reason: "pestaña cerrada", p_close_call: true, p_result: "Prueba" });
  const { data: c1 } = await db.from("calls").select("status").eq("id", call).single();
  assert(c1.status === "finalizada", "al cerrar la pestaña la llamada queda finalizada (no en_curso)");
  const q2 = await rpc("voice_claim", { p_call: call2, p_owner_kind: "telefono", p_max: 1, p_queue: q.queue_id });
  assert(q2.ok, "al liberarse la línea, la llamada en la fila la obtiene");
  await rpc("voice_end", { p_session: q2.session_id, p_reason: "fin de la prueba", p_close_call: true });
  const { count: live } = await db.from("voice_sessions").select("*", { count: "exact", head: true }).in("state", ["solicitando", "conectando", "activa", "en_cola"]);
  assert(live === 0, "no quedan sesiones de voz activas");
  console.log("LISTO: carreras");
} finally {
  await rpc("reset_demo");
}
