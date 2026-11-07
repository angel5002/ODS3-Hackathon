// v5.1 waiting-list order and assignment rules (E5, hito 4) against the linked database, AFTER applying
// supabase/migrations/20261107020000_e5_v51_priority.sql. RESETS the shared demo database before, between cases
// and after, and sets params.regla_asignacion temporarily (restored at the end):
//   ALLOW_DB_WRITE=1 node scripts/dev/priority-v51.mjs      (npm run test:priority)
//   - order: category first (P1 > P2 > P3 > P4), then deadline fraction R = min(days / deadline, 1), no bonuses
//   - seed cast: Ana P2 69 % → 0.69, Julio P2 44 % → 0.44, Luis P3 17 % → 0.17
//   - every row: idx = R from days and deadline only (insurance, sex, no-shows cannot enter)
//   - v4 objects untouched: staff_requests() still gives 0.77 / 0.48 / 0.28 (production is unaffected)
//   - a P3 at 90 % that accepts first loses to a P2 at 50 % with 'ventana_prioridad', wins with 'primero_acepta';
//     the next acceptor after a validation timeout follows the same rule
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { requireDbWrite } from "./db-write-guard.mjs";
import { priorityV51 } from "../../src/lib/priority.ts";

requireDbWrite("priority-v51.mjs");
config({ path: ".env.local", quiet: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const rpc = async (fn, args) => {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
};
function assert(c, m) {
  if (!c) throw new Error(`FALLA: ${m}`);
  console.log("ok", m);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const byName = (rows, prefix) => rows.find((r) => r.name.startsWith(prefix));
const two = (x) => Number(x).toFixed(2);
const RULE = "regla_asignacion";

async function allRows(view, columns) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(view).select(columns).order("id").range(from, from + 999);
    if (error) throw new Error(`${view}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
async function setRule(value) {
  const { error } = await db.from("settings_v51").update({ value, updated_at: new Date().toISOString() }).eq("key", RULE);
  if (error) throw new Error(error.message);
}
const shiftDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

// Carmen frees her slot of Thursday (Cardiología, near zone): Ana, Julio, Marta and Pedro are the candidates.
async function freeCarmenSlot() {
  await rpc("send_reminders");
  const { data: carmen } = await db.from("patients").select("id").eq("token", "carmen").single();
  const { data: appt } = await db.from("appointments").select("id").eq("patient_id", carmen.id).eq("is_base", true).single();
  await rpc("patient_reply", { p_appt: appt.id, p_reply: "libera", p_channel: "mensaje" });
  const { data: slot } = await db.from("slots").select("id").eq("source_appointment_id", appt.id).single();
  return slot.id;
}

// The same contested case for both rules: Ana turned into a P3 at 90 % accepts FIRST, Marta (P2, 28 %) second,
// Julio (P2, 50 %) third. Then Julio's / Ana's validation expires and the slot passes to the next acceptor.
async function contestedCase(ruleValue) {
  await rpc("reset_demo");
  await setRule(ruleValue);
  const rows = await rpc("staff_requests_v51");
  const [ana, julio, marta] = ["Ana Gutiérrez", "Julio Gonzales", "Marta Ccori"].map((n) => byName(rows, n));
  const slotId = await freeCarmenSlot();
  const offer = await rpc("approve_offer_v51", { p_slot: slotId, p_actor: "Prueba v5.1" });
  const { data: so } = await db.from("slot_offers").select("candidate_ids").eq("id", offer).single();
  assert([ana.id, julio.id, marta.id].every((id) => so.candidate_ids.includes(id)), `oferta ${offer} a Ana, Julio y Marta (k = ${so.candidate_ids.length})`);
  const rule = await rpc("offer_rule_v51", { p_offer: offer });
  assert(rule === ruleValue, `la oferta guarda la regla vigente al aprobarla: ${rule}`);

  // demo "today" (16/10/2023): Ana P3 at 162/180 = 90 %, Julio P2 at 45/90 = 50 %
  const { data: ds } = await db.from("demo_state").select("demo_date").eq("id", 1).single();
  let { error } = await db.from("requests").update({ category: "P3", deadline_days: 180, first_attempt_at: shiftDays(ds.demo_date, 162) }).eq("id", ana.id);
  if (error) throw new Error(error.message);
  ({ error } = await db.from("requests").update({ first_attempt_at: shiftDays(ds.demo_date, 45) }).eq("id", julio.id));
  if (error) throw new Error(error.message);
  const { data: v51 } = await db.from("v_requests_v51").select("id,eff_category,idx,sort_key").in("id", [ana.id, julio.id, marta.id]);
  const { data: v4 } = await db.from("v_requests").select("id,idx").in("id", [ana.id, julio.id]);
  const a51 = v51.find((r) => r.id === ana.id);
  const j51 = v51.find((r) => r.id === julio.id);
  assert(a51.eff_category === "P3" && two(a51.idx) === "0.90" && j51.eff_category === "P2" && two(j51.idx) === "0.50", "Ana P3 al 90 %, Julio P2 al 50 %");
  assert(Number(j51.sort_key) > Number(a51.sort_key), `clave de orden: P2 50 % (${j51.sort_key}) > P3 90 % (${a51.sort_key})`);
  const a4 = v4.find((r) => r.id === ana.id);
  const j4 = v4.find((r) => r.id === julio.id);
  assert(Number(a4.idx) > Number(j4.idx), `con el índice v4 (sin categoría delante) Ana ${two(a4.idx)} le ganaría a Julio ${two(j4.idx)}: es lo que v5.1 corrige`);

  for (const who of [ana, marta, julio]) {
    await rpc("respond_offer", { p_offer: offer, p_request: who.id, p_response: "acepta", p_channel: "prueba" });
    await sleep(30);
  }
  const assignment = await rpc("close_offer_v51", { p_offer: offer, p_actor: "Prueba v5.1" });
  const { data: as } = await db.from("assignments").select("request_id,rule").eq("id", assignment).single();
  const { data: feed } = await db.from("events").select("detail").eq("kind", "asignacion").order("id", { ascending: false }).limit(1);

  // validation of the winner expires → the next acceptor, with the same rule
  await rpc("advance_clock_v51", { p_minutes: 61 });
  const { data: all } = await db.from("assignments").select("id,request_id,validation_state,rule").eq("slot_id", slotId).order("id");
  return { ana, julio, marta, assignment: as, detail: feed?.[0]?.detail ?? "", all };
}

const { data: ruleRow } = await db.from("settings_v51").select("value").eq("key", RULE).maybeSingle();
assert(ruleRow?.value === "ventana_prioridad", `settings_v51.${RULE} = '${ruleRow?.value}' (texto; por defecto 'ventana_prioridad')`);
const { data: oldRow } = await db.from("params").select("key").eq("key", RULE).maybeSingle();
assert(oldRow == null, "ya no existe la fila numérica params.regla_asignacion");
await rpc("reset_demo");
try {
  // ---- v4 still in place (what main / production reads)
  const v4 = await rpc("staff_requests");
  const [a4, j4, l4] = ["Ana Gutiérrez", "Julio Gonzales", "Luis Ramos"].map((n) => byName(v4, n));
  assert(two(a4.idx) === "0.77" && a4.reason === "P2 · 69 % de su plazo · primera consulta · adulta mayor", `v4 sin cambios: Ana ${two(a4.idx)}`);
  assert(two(j4.idx) === "0.48" && j4.reason === "P2 · 44 % de su plazo · primera consulta", `v4 sin cambios: Julio ${two(j4.idx)}`);
  assert(two(l4.idx) === "0.28" && l4.reason === "P3 · 17 % de su plazo · primera consulta", `v4 sin cambios: Luis ${two(l4.idx)}`);

  // ---- v5.1: the seed cast
  const v51 = await rpc("staff_requests_v51");
  assert(v51.length === v4.length, `misma demanda en ambas listas (${v51.length} solicitudes)`);
  const [a, j, l] = ["Ana Gutiérrez", "Julio Gonzales", "Luis Ramos"].map((n) => byName(v51, n));
  assert(a.cat === "P2" && a.days_waited === 62 && a.deadline === 90 && two(a.idx) === "0.69" && a.reason === "P2 · 69 % de su plazo", `Ana 0.69: ${a.reason}`);
  assert(j.cat === "P2" && j.days_waited === 40 && j.deadline === 90 && two(j.idx) === "0.44" && j.reason === "P2 · 44 % de su plazo", `Julio 0.44: ${j.reason}`);
  assert(l.cat === "P3" && l.days_waited === 30 && l.deadline === 180 && two(l.idx) === "0.17" && l.reason === "P3 · 17 % de su plazo", `Luis 0.17: ${l.reason}`);

  // ---- v5.1: lexicographic order = open first, then category, then deadline fraction (then earliest first attempt)
  const key = (r) => [r.ord, r.cat, -Number(r.idx), r.first_attempt_at, r.id];
  const cmp = (x, y) => {
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    return 0;
  };
  const bad = v51.findIndex((r, i) => i > 0 && cmp(key(v51[i - 1]), key(r)) > 0);
  assert(bad === -1, `lista ordenada por categoría y luego por fracción del plazo${bad >= 0 ? ` (rompe en ${v51[bad].code})` : ""}`);
  const open = v51.filter((r) => r.ord === 0);
  const firstP3 = open.findIndex((r) => r.cat === "P3");
  const lastP2 = open.map((r) => r.cat).lastIndexOf("P2");
  assert(firstP3 === -1 || lastP2 < firstP3, "ningún P3 queda delante de un P2, aunque lleve más plazo consumido");
  const sk = await Promise.all([
    rpc("priority_sort_key_v51", { p_category: "P3", p_days_waited: 162, p_deadline_days: 180 }),
    rpc("priority_sort_key_v51", { p_category: "P2", p_days_waited: 45, p_deadline_days: 90 }),
  ]);
  assert(Number(sk[1]) > Number(sk[0]), `priority_sort_key_v51: P2 al 50 % (${sk[1]}) por encima de P3 al 90 % (${sk[0]})`);
  const sk12 = await Promise.all([
    rpc("priority_sort_key_v51", { p_category: "P3", p_days_waited: 2160, p_deadline_days: 180 }), // fracción 12
    rpc("priority_sort_key_v51", { p_category: "P2", p_days_waited: 9, p_deadline_days: 90 }), // fracción 0.1
  ]);
  assert(Number(sk12[1]) > Number(sk12[0]), `P3 muy vencido (fracción 12 → clave ${sk12[0]}) queda debajo de P2 a 0.1 (clave ${sk12[1]})`);

  // ---- within a category the MOST overdue goes first (no tie at the 100 % display cap): two overdue P2
  {
    const today = await rpc("demo_today");
    const dayMinus = (n) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);
    const list0 = await rpc("staff_requests_v51");
    const [j, m] = ["Julio Gonzales", "Marta Ccori"].map((n) => byName(list0, n));
    // Julio: 108 days of a 90-day P2 deadline (fraction 1.2); Marta: 270 days (fraction 3.0)
    for (const [id, days] of [[j.id, 108], [m.id, 270]]) {
      const { error } = await db.from("requests").update({ first_attempt_at: dayMinus(days) }).eq("id", id);
      if (error) throw new Error(error.message);
    }
    const { data: two } = await db.from("v_requests_v51").select("id,idx,sort_key").in("id", [j.id, m.id]);
    const jj = two.find((x) => x.id === j.id), mm = two.find((x) => x.id === m.id);
    assert(Number(jj.idx) === 1 && Number(mm.idx) === 1, "los dos se muestran al 100 % de su plazo (tope de lo que se muestra)");
    assert(Number(mm.sort_key) > Number(jj.sort_key), `clave sin tope: P2 a 3.0 (${mm.sort_key}) por encima de P2 a 1.2 (${jj.sort_key})`);
    const list1 = (await rpc("staff_requests_v51")).filter((x) => x.ord === 0);
    const pj = list1.findIndex((x) => x.id === j.id), pm = list1.findIndex((x) => x.id === m.id);
    assert(pm >= 0 && pj >= 0 && pm < pj, `en la lista va primero el más vencido: Marta (3.0) en ${pm + 1}.º, Julio (1.2) en ${pj + 1}.º`);
    await rpc("reset_demo");
  }

  // ---- v5.1: idx depends only on days and deadline (no bonuses, no insurance / sex / no-shows)
  const rows = await allRows("v_requests_v51", "id,code,category,eff_category,days_waited,eff_deadline,idx,sort_key,first_visit,preferential");
  const rank = (c) => Number((c ?? "P3").slice(1));
  const wrong = rows.filter(
    (r) => Number(r.idx) !== priorityV51(r.days_waited, r.eff_deadline) ||
      Math.abs(Number(r.sort_key) - ((5 - rank(r.category)) * 1000 + Math.round(Math.min(r.days_waited / r.eff_deadline, 999.9999) * 1e4) / 1e4)) > 1e-6,
  );
  assert(rows.length > 0 && wrong.length === 0, `idx = min(días/plazo, 1) y clave = categoría + idx en las ${rows.length} filas${wrong.length ? ` (${wrong.slice(0, 3).map((r) => r.code).join(", ")}…)` : ""}`);
  const withBonus = rows.filter((r) => r.first_visit || r.preferential).length;
  assert(withBonus > 0, `${withBonus} filas con primera consulta o atención preferente: ninguna suma bono`);
  const { data: one, error: colsErr } = await db.from("v_requests_v51").select("*").limit(1).single();
  if (colsErr) throw new Error(colsErr.message);
  const leaked = Object.keys(one).filter((k) => /sex|insur|seguro|no_show|inasist|grammar/i.test(k));
  assert(leaked.length === 0, `v_requests_v51 no expone sexo, seguro ni historial de inasistencias${leaked.length ? ` (${leaked.join(", ")})` : ""}`);
  const p = await rpc("priority_v51", { p_days_waited: 62, p_deadline_days: 90 });
  const cap = await rpc("priority_v51", { p_days_waited: 400, p_deadline_days: 90 });
  assert(Number(p) === 0.6889 && Number(cap) === 1, `priority_v51(62, 90) = ${p}; tope en 1 (${cap})`);

  // ---- propose_candidates_v51 vs v4 on the slot Carmen frees
  const slotId = await freeCarmenSlot();
  const prop4 = await rpc("propose_candidates", { p_slot: slotId });
  const prop51 = await rpc("propose_candidates_v51", { p_slot: slotId });
  assert(prop51.available === prop4.available && prop51.zone === prop4.zone, `mismo filtro de elegibles (${prop51.available}, zona ${prop51.zone})`);
  const c51 = prop51.candidates;
  // the overdue block above re-seeds the demo (reset_demo): look Ana and Julio up again, their ids changed
  const fresh = await rpc("staff_requests_v51");
  const [aNow, jNow] = ["Ana Gutiérrez", "Julio Gonzales"].map((n) => byName(fresh, n));
  const ai = c51.findIndex((c) => c.request_id === aNow.id);
  const ji = c51.findIndex((c) => c.request_id === jNow.id);
  assert(ai >= 0 && ji > ai, `candidatos v5.1: ${c51.map((c) => `${c.short_name} ${c.category} ${two(c.index)}`).join(", ")}`);

  // ---- the two assignment variants on the same contested case
  const win = await contestedCase("ventana_prioridad");
  assert(win.assignment.request_id === win.julio.id && win.assignment.rule === "mayor_prioridad",
    `ventana_prioridad: gana Julio (P2 50 %) aunque Ana (P3 90 %) aceptó primero — ${win.detail}`);
  const nextW = win.all.find((x) => x.rule === "siguiente_aceptante");
  assert(win.all[0].validation_state === "vencida" && nextW?.request_id === win.marta.id,
    "ventana_prioridad: al vencer la validación pasa a Marta (P2), no a Ana (P3), aunque Ana aceptó antes");

  const first = await contestedCase("primero_acepta");
  assert(first.assignment.request_id === first.ana.id && first.assignment.rule === "primero_acepta",
    `primero_acepta: gana Ana, la primera que aceptó — ${first.detail}`);
  assert(/habría sido Julio G\./.test(first.detail), "el registro dice a quién habría ido con la otra regla");
  const nextF = first.all.find((x) => x.rule === "siguiente_aceptante");
  assert(first.all[0].validation_state === "vencida" && nextF?.request_id === first.marta.id,
    "primero_acepta: al vencer la validación pasa a Marta, la siguiente en responder (no a Julio)");
  assert(win.assignment.request_id !== first.assignment.request_id, "las dos reglas dan resultados distintos en el mismo caso");
  console.log("LISTO: prioridad y reglas v5.1");
} finally {
  if (ruleRow) await setRule(ruleRow.value);
  await rpc("reset_demo");
}
