// Scene 1 data check: runs seed_escena1() (writes Tito's request: needs ALLOW_DB_WRITE=1) and verifies, read-only,
// that Tito is FIRST in the Oncología Médica waiting list under the v5.1 order and, if a free Oncología Médica
// slot exists (jury card "Carmen"), first in its candidate proposal. Never approves an offer, never resets.
// Run: ALLOW_DB_WRITE=1 node --env-file=<.env.local> scripts/dev/escena1-check.mjs
import { createClient } from "@supabase/supabase-js";
import { requireDbWrite } from "./db-write-guard.mjs";

requireDbWrite("escena1-check");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SPEC = "Oncología Médica";

const seed = await db.rpc("seed_escena1", { p_specialty: SPEC });
if (seed.error) throw new Error(seed.error.message);
console.log("seed_escena1:", JSON.stringify(seed.data));

const { data: list, error } = await db.rpc("staff_requests_v51");
if (error) throw new Error(error.message);
const onco = list.filter((r) => r.specialty === SPEC && ["priorizada_sin_cupo", "en_espera_prioritaria", "con_cita"].includes(r.state));
const tito = onco.find((r) => r.name === "Tito Quispe Rojas");
console.log(`Tito: ${tito?.code} · ${tito?.category} · ${tito?.state} · ${tito?.days_waited} días · índice ${tito?.idx} · clave ${tito?.sort_key}`);
const { data: ev } = await db.from("request_events").select("type,actor,payload").eq("request_id", seed.data.request_id).eq("type", "regulacion");
console.log("regulación por:", (ev ?? []).map((e) => `${e.actor} (${e.payload?.category})`).join(", "));
const best = [...onco].sort((a, b) => (b.state === "en_espera_prioritaria") - (a.state === "en_espera_prioritaria") || b.sort_key - a.sort_key)[0];
console.log(best?.name === "Tito Quispe Rojas" ? "OK: Tito es el primero de la lista de Oncología Médica" : `FALLA: el primero es ${best?.code}`);

const { data: slots } = await db.from("slots").select("id,date,time,state,remote").eq("specialty", SPEC).eq("state", "libre").order("date");
for (const s of slots ?? []) {
  const { data: p } = await db.rpc("propose_candidates_v51", { p_slot: s.id });
  const first = p?.candidates?.[0];
  console.log(`cupo ${s.id} ${s.date} ${s.time} (zona ${p?.zone}): primero ${first?.code} ${first?.name === "Tito Quispe Rojas" ? "= Tito OK" : ""} · k=${p?.k}`);
}
if (!slots?.length) console.log("No hay cupos libres de Oncología Médica todavía (los crea la tarjeta de Carmen al cancelar).");
