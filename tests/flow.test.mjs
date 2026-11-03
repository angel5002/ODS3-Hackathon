// Integration test of the core flow against the linked Supabase project (H6).
// Run: npm run test:flow   (resets the demo before and after)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const srv = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const rpc = async (fn, args) => {
  const { data, error } = await srv.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
};
const one = async (q) => {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
};

const hints = [];
let channel;
before(async () => {
  await rpc("reset_demo");
  channel = anon.channel("demo").on("broadcast", { event: "change" }, ({ payload }) => hints.push({ at: Date.now(), payload }));
  await new Promise((res) => channel.subscribe((s) => s === "SUBSCRIBED" && res()));
});
after(async () => {
  await rpc("reset_demo");
  await anon.removeChannel(channel);
  anon.realtime.disconnect();
});

async function waitHint(pred, since, ms = 2000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const h = hints.find((x) => x.at >= since && pred(x.payload));
    if (h) return h.at - since;
    await new Promise((r) => setTimeout(r, 20));
  }
  return null;
}

test("browser key can read but cannot write or see real outcomes", async () => {
  const r = await anon.from("appointments").select("id", { count: "exact", head: true });
  assert.ok(r.count > 1300);
  const o = await anon.from("appointment_outcomes").select("*").limit(1);
  assert.ok(o.error, "outcomes must be hidden");
  const f = await anon.rpc("send_reminders");
  assert.ok(f.error, "functions must not be callable from the browser");
});

test("reminders, release, offer, reject, next candidate, accept", async () => {
  const carmen = await one(srv.from("patients").select("id").eq("demo_role", "libera_cupo").single());
  const slot = await one(srv.from("appointments").select("*").eq("patient_id", carmen.id).single());

  let t = Date.now();
  const sent = await rpc("send_reminders");
  assert.ok(sent > 1300);
  const bulkLatency = await waitHint((p) => p.kind === "bulk", t);
  assert.ok(bulkLatency != null && bulkLatency < 2000, `bulk hint in ${bulkLatency} ms`);

  t = Date.now();
  assert.equal(await rpc("patient_reply", { p_appt: slot.id, p_reply: "libera", p_channel: "mensaje" }), "liberada");
  const lat = await waitHint((p) => p.appts.includes(slot.id), t);
  assert.ok(lat != null && lat < 2000, `release visible in ${lat} ms`);

  const list = await one(srv.from("waitlist").select("*").eq("specialty", slot.specialty).order("wait_days", { ascending: false }).order("id"));
  const [first, second] = list;
  // RF-29: nothing is reassigned until a person makes an offer
  assert.equal((await one(srv.from("appointments").select("status").eq("id", slot.id).single())).status, "liberada");

  const offer1 = await rpc("make_offer", { p_slot: slot.id, p_waitlist: first.id, p_actor: "Prueba" });
  await assert.rejects(rpc("make_offer", { p_slot: slot.id, p_waitlist: second.id, p_actor: "Prueba" }), /open offer/);
  assert.equal(await rpc("answer_offer", { p_offer: offer1, p_accept: false }), null); // RF-31: "No puedo"

  const offer2 = await rpc("make_offer", { p_slot: slot.id, p_waitlist: second.id, p_actor: "Prueba" });
  t = Date.now();
  const newId = await rpc("answer_offer", { p_offer: offer2, p_accept: true });
  const accLat = await waitHint((p) => p.kind === "offer" && p.appts.includes(slot.id), t);
  assert.ok(accLat != null && accLat < 2000, `acceptance visible in ${accLat} ms`);

  const s = await one(srv.from("appointments").select("status,reassigned_to_id").eq("id", slot.id).single());
  assert.equal(s.status, "reasignada");
  assert.equal(s.reassigned_to_id, newId);
  const n = await one(srv.from("appointments").select("status,origin,patient_id").eq("id", newId).single());
  assert.deepEqual(n, { status: "confirmada", origin: "lista_espera", patient_id: second.patient_id });
  await assert.rejects(rpc("make_offer", { p_slot: slot.id, p_waitlist: list[2].id, p_actor: "Prueba" }), /not free/);
  console.log(`latencias: recordatorios ${bulkLatency} ms, liberación ${lat} ms, aceptación ${accLat} ms`);
});

test("expired offers are closed by the demo clock (RF-31)", async () => {
  const freed = await one(srv.from("appointments").select("id,specialty").eq("status", "liberada").eq("is_base", true).limit(1));
  if (!freed.length) {
    const any = await one(srv.from("appointments").select("id").eq("status", "recordatorio_enviado").not("sim_reply", "is", null).limit(1));
    await rpc("staff_set_status", { p_appt: any[0].id, p_to: "liberada", p_actor: "Prueba" });
  }
  const slot = (await one(srv.from("appointments").select("id,specialty").eq("status", "liberada").eq("is_base", true).limit(1)))[0];
  const cand = (await one(srv.from("waitlist").select("id").eq("specialty", slot.specialty).eq("status", "en_espera").limit(1)))[0];
  const offer = await rpc("make_offer", { p_slot: slot.id, p_waitlist: cand.id, p_actor: "Prueba" });
  const state = await one(srv.from("demo_state").select("offer_deadline_min").single());
  await rpc("advance_clock", { p_minutes: state.offer_deadline_min + 2 });
  const o = await one(srv.from("offers").select("status").eq("id", offer).single());
  assert.equal(o.status, "vencida");
  await assert.rejects(rpc("answer_offer", { p_offer: offer, p_accept: true }), /no longer open/);
});

test("no reply within the deadline becomes 'sin respuesta'; a call can confirm it", async () => {
  const rosa = await one(srv.from("patients").select("id").eq("demo_role", "alto_riesgo").single());
  const { reply_deadline_min } = await one(srv.from("demo_state").select("reply_deadline_min").single());
  const t = Date.now();
  await rpc("advance_clock", { p_minutes: reply_deadline_min + 1 });
  console.log(`cierre del plazo (respuestas simuladas + sin respuesta): ${Date.now() - t} ms`);
  const appt = await one(srv.from("appointments").select("id,status").eq("patient_id", rosa.id).single());
  assert.equal(appt.status, "sin_respuesta");
  const call = await rpc("start_call", { p_appt: appt.id, p_actor: "Prueba" });
  await rpc("update_call", { p_call: call, p_status: "en_curso" });
  assert.equal(await rpc("patient_reply", { p_appt: appt.id, p_reply: "confirma", p_channel: "voz", p_actor: "Asistente automático" }), "confirmada");
  await rpc("update_call", { p_call: call, p_status: "finalizada", p_result: "Confirmó la cita" });
  assert.equal((await one(srv.from("appointments").select("status").eq("id", appt.id).single())).status, "confirmada");
});

test("reset restores the initial state in a few seconds (RF-40)", async () => {
  const t = Date.now();
  await rpc("reset_demo");
  const ms = Date.now() - t;
  assert.ok(ms < 5000, `reset took ${ms} ms`);
  const { count } = await srv.from("appointments").select("id", { count: "exact", head: true }).neq("status", "pendiente");
  assert.equal(count, 0);
  const extra = await srv.from("appointments").select("id", { count: "exact", head: true }).eq("is_base", false);
  assert.equal(extra.count, 0);
  console.log(`reinicio: ${ms} ms`);
});
