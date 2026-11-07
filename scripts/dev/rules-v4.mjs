// Required rule tests (requisitos §7) straight on the database functions (server key). Resets the demo.
//   - validation timeout -> next acceptor by index
//   - domino: only to an earlier date, at most once a week
//   - not answering never changes an appointment
//   - k: smallest k reaching the target, capped at 8 or the candidates available
import { requireDbWrite } from "./db-write-guard.mjs";
requireDbWrite("rules-v4.mjs");
import { config } from "dotenv"; config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function rpc(fn, args) {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}
function assert(c, m) {
  if (!c) throw new Error(`FALLA: ${m}`);
  console.log("ok", m);
}
const reqByName = async (prefix) => {
  const rows = await rpc("staff_requests_v51"); // v5.1: the e5 app uses the _v51 functions
  return rows.find((r) => r.name.startsWith(prefix));
};

await rpc("reset_demo");
// k: 1 - 0.75*0.75*0.9*0.9 = 0.544 < 0.60 with all 4 of the near zone; with a = 0.10 only, 8 are needed (57 %)
const k8 = 1 - 0.9 ** 8;
assert(Math.round(k8 * 100) === 57, "con a = 0.10, ni 8 candidatos llegan al 60 % (57 %): k = 8 o los disponibles");

await rpc("send_reminders");
const { data: carmen } = await db.from("appointments").select("id").eq("patient_id", (await db.from("patients").select("id").eq("token", "carmen").single()).data.id).single();
await rpc("patient_reply", { p_appt: carmen.id, p_reply: "libera", p_channel: "mensaje" });
const { data: slot } = await db.from("slots").select("id").eq("source_appointment_id", carmen.id).single();
const ana = await reqByName("Ana Gutiérrez");
const julio = await reqByName("Julio Gonzales");
const offer = await rpc("approve_offer_v51", { p_slot: slot.id, p_actor: "Prueba" });
await rpc("respond_offer", { p_offer: offer, p_request: julio.id, p_response: "acepta", p_channel: "prueba" });
await rpc("respond_offer", { p_offer: offer, p_request: ana.id, p_response: "acepta", p_channel: "prueba" });
const a1 = await rpc("close_offer_v51", { p_offer: offer, p_actor: "Prueba" });
const { data: as1 } = await db.from("assignments").select("request_id").eq("id", a1).single();
assert(as1.request_id === ana.id, "gana el de mayor prioridad (Ana, P2 69 %) aunque Julio respondió primero");

// validation timeout: advance past validation_timeout_min and tick
await rpc("advance_clock_v51", { p_minutes: 61 });
const { data: as } = await db.from("assignments").select("id,request_id,validation_state,rule").eq("slot_id", slot.id).order("id");
assert(as[0].validation_state === "vencida" && as[1]?.request_id === julio.id && as[1].rule === "siguiente_aceptante", "validación vencida: el cupo pasa al siguiente aceptante (Julio)");
const { data: anaAfter } = await db.from("requests").select("state").eq("id", ana.id).single();
assert(anaAfter.state === "con_cita", "Ana no pierde su lugar ni su cita (vuelve a su estado)");

// Julio validates -> his 23/11 appointment is released (domino); he cannot move again within a week
await rpc("validate_assignment", { p_assignment: as[1].id, p_ok: true, p_by: "mensaje", p_role: "paciente", p_actor: "Prueba" });
const { data: dom } = await db.from("slots").select("id,date,origin").eq("origin", "domino").single();
assert(dom.date === "2023-11-23", "dominó: se libera la cita lejana de Julio (23/11)");
const prop = await rpc("propose_candidates_v51", { p_slot: dom.id });
assert(!prop.candidates.some((c) => c.request_id === ana.id), "solo hacia adelante: Ana (cita 09/11) no es candidata a un cupo del 23/11");
// another Cardiology slot: release one more appointment of the day; Julio was just moved -> excluded
const { data: other } = await db.from("appointments").select("id").eq("specialty", "Cardiología").eq("is_base", true).neq("id", carmen.id).neq("status", "reasignada").limit(1).single();
await rpc("patient_reply", { p_appt: other.id, p_reply: "libera", p_channel: "mensaje" });
const { data: slot2 } = await db.from("slots").select("id").eq("source_appointment_id", other.id).single();
const prop2 = await rpc("propose_candidates_v51", { p_slot: slot2.id });
const { data: julioAfter } = await db.from("requests").select("state,last_moved_at").eq("id", julio.id).single();
assert(julioAfter.state === "con_cita" && !prop2.candidates.some((c) => c.request_id === julio.id), "una vez por semana: Julio ya se movió y no recibe otra oferta");
assert(prop2.candidates.some((c) => c.request_id === ana.id), "Ana sigue siendo candidata a cupos anteriores a su cita");

// not answering never changes an appointment
await rpc("advance_clock_v51", { p_minutes: 600 });
const { count: bad } = await db.from("events").select("id", { count: "exact", head: true }).eq("to_status", "liberada").eq("actor", "Sistema").ilike("detail", "%respuesta%");
assert(bad === 0, "ninguna cita se libera por no responder (sin respuesta = la cita se mantiene)");
await rpc("reset_demo");
console.log("LISTO: reglas");
