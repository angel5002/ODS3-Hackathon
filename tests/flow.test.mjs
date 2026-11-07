// Integration test of the v4 core rules against the linked Supabase project (replaces the E1 flow test,
// whose rules v4 changed on purpose: the browser no longer reads tables, reminders go only to people who use
// messaging, and not answering never changes an appointment).
// The database is shared with the deployed demo and this test RESETS it before and after:
//   ALLOW_DB_WRITE=1 npm run test:flow
// Without ALLOW_DB_WRITE=1 every test is skipped (never run by accident).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const allowed = process.env.ALLOW_DB_WRITE === "1";
const skip = allowed ? false : "escribe y reinicia la base compartida: exige ALLOW_DB_WRITE=1";

config({ path: ".env.local", quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const srv = allowed ? createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) : null;
const anon = allowed ? createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }) : null;

const rpc = async (fn, args) => {
  const { data, error } = await srv.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
};
const count = async (table, filter = (q) => q) => {
  const { count: n, error } = await filter(srv.from(table).select("*", { count: "exact", head: true }));
  if (error) throw new Error(`${table}: ${error.message}`);
  return n;
};
const requestByName = async (prefix) => (await rpc("staff_requests")).find((r) => r.name.startsWith(prefix));

let initial = null;
before(async () => {
  if (!allowed) return;
  await rpc("reset_demo");
  initial = { requests: await count("requests"), base: await count("appointments", (q) => q.eq("is_base", true)) };
});
after(async () => {
  if (allowed) await rpc("reset_demo");
});

test("the browser key reads no personal data and cannot call write functions", { skip }, async () => {
  for (const table of ["appointments", "patients", "requests", "calls", "chat_sessions", "appointment_outcomes"]) {
    const r = await anon.from(table).select("*", { count: "exact", head: true });
    assert.ok(r.error, `${table} must not be readable with the browser key`);
  }
  const s = await anon.from("demo_state").select("id").limit(1);
  assert.ifError(s.error);
  const f = await anon.rpc("send_reminders");
  assert.ok(f.error, "write functions must not be callable from the browser");
});

test("72 h reminders go only to people who use messaging (RF-04)", { skip }, async () => {
  const expected = await count("appointments", (q) => q.eq("is_base", true).eq("status", "pendiente").eq("uses_messaging", true));
  const sent = await rpc("send_reminders");
  assert.equal(sent, expected);
  assert.ok(sent < initial.base, "people without messaging get a call instead, not a message");
});

test("a released slot goes to the highest priority, not the first to answer (RF-07)", { skip }, async () => {
  const { data: carmen } = await srv.from("patients").select("id").eq("token", "carmen").single();
  const { data: appt } = await srv.from("appointments").select("id").eq("patient_id", carmen.id).eq("is_base", true).single();
  await rpc("patient_reply", { p_appt: appt.id, p_reply: "libera", p_channel: "mensaje" });
  const { data: slot } = await srv.from("slots").select("id").eq("source_appointment_id", appt.id).single();
  const ana = await requestByName("Ana Gutiérrez");
  const julio = await requestByName("Julio Gonzales");
  const offer = await rpc("approve_offer", { p_slot: slot.id, p_actor: "Prueba" });
  await rpc("respond_offer", { p_offer: offer, p_request: julio.id, p_response: "acepta", p_channel: "prueba" });
  await rpc("respond_offer", { p_offer: offer, p_request: ana.id, p_response: "acepta", p_channel: "prueba" });
  const assignment = await rpc("close_offer", { p_offer: offer, p_actor: "Prueba" });
  const { data: a } = await srv.from("assignments").select("request_id").eq("id", assignment).single();
  assert.equal(a.request_id, ana.id, "Ana (0.77) wins although Julio (0.48) answered first");
});

test("not answering never changes or releases an appointment", { skip }, async () => {
  await rpc("advance_clock", { p_minutes: 600 });
  await rpc("demo_tick");
  const bad = await count("events", (q) => q.eq("to_status", "liberada").eq("actor", "Sistema").ilike("detail", "%respuesta%"));
  assert.equal(bad, 0);
});

test("reset restores the initial state in under 10 s (RNF reinicio)", { skip }, async () => {
  const t = Date.now();
  await rpc("reset_demo");
  const ms = Date.now() - t;
  assert.ok(ms < 10000, `reset took ${ms} ms`);
  assert.equal(await count("requests"), initial.requests);
  assert.equal(await count("appointments", (q) => q.eq("is_base", true).neq("status", "pendiente")), 0);
  assert.equal(await count("calls"), 0);
});
