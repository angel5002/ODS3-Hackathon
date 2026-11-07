// v5.1 waiting-list order (E5, hito 4) against the linked database, AFTER applying
// supabase/migrations/20261107020000_e5_v51_priority.sql. RESETS the shared demo database before and after:
//   ALLOW_DB_WRITE=1 node scripts/dev/priority-v51.mjs
//   - v5.1: category first, then deadline fraction R = min(days / deadline, 1), no bonuses
//   - seed cast: Ana P2 69 % → 0.69, Julio P2 44 % → 0.44, Luis P3 17 % → 0.17
//   - every row: idx = R computed from days and deadline only (insurance, sex, no-shows cannot enter)
//   - v4 objects untouched: staff_requests() still gives 0.77 / 0.48 / 0.28 (production is unaffected)
//   - propose_candidates_v51() orders the same candidates as v4 by the new index
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
const byName = (rows, prefix) => rows.find((r) => r.name.startsWith(prefix));
const two = (x) => Number(x).toFixed(2);

async function allRows(view, columns) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(view).select(columns).order("id").range(from, from + 999);
    if (error) throw new Error(`${view}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

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

  // ---- v5.1: order = open first, then category, then deadline fraction (then earliest first attempt)
  const key = (r) => [r.ord, r.cat, -Number(r.idx), r.first_attempt_at, r.id];
  const cmp = (x, y) => {
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    return 0;
  };
  const bad = v51.findIndex((r, i) => i > 0 && cmp(key(v51[i - 1]), key(r)) > 0);
  assert(bad === -1, `lista v5.1 ordenada por categoría y luego por fracción del plazo${bad >= 0 ? ` (rompe en ${v51[bad].code})` : ""}`);
  const open = v51.filter((r) => r.ord === 0);
  const cats = open.map((r) => r.cat);
  assert(cats.every((c, i) => i === 0 || cats[i - 1] <= c), "ninguna solicitud de categoría menor queda delante de una mayor");

  // ---- v5.1: idx depends only on days and deadline (no bonuses, no insurance / sex / no-shows)
  const rows = await allRows("v_requests_v51", "id,code,eff_category,days_waited,eff_deadline,idx,first_visit,preferential");
  const wrong = rows.filter((r) => Number(r.idx) !== priorityV51(r.days_waited, r.eff_deadline));
  assert(rows.length > 0 && wrong.length === 0, `idx = min(días/plazo, 1) en las ${rows.length} filas${wrong.length ? ` (${wrong.slice(0, 3).map((r) => r.code).join(", ")}…)` : ""}`);
  const withBonus = rows.filter((r) => r.first_visit || r.preferential).length;
  assert(withBonus > 0, `${withBonus} filas con primera consulta o atención preferente: ninguna suma bono`);
  const { data: one, error: colsErr } = await db.from("v_requests_v51").select("*").limit(1).single();
  if (colsErr) throw new Error(colsErr.message);
  const leaked = Object.keys(one).filter((k) => /sex|insur|seguro|no_show|inasist|grammar/i.test(k));
  assert(leaked.length === 0, `v_requests_v51 no expone sexo, seguro ni historial de inasistencias${leaked.length ? ` (${leaked.join(", ")})` : ""}`);
  const p = await rpc("priority_v51", { p_days_waited: 62, p_deadline_days: 90 });
  const cap = await rpc("priority_v51", { p_days_waited: 400, p_deadline_days: 90 });
  assert(Number(p) === 0.6889 && Number(cap) === 1, `priority_v51(62, 90) = ${p}; tope en 1 (${cap})`);

  // ---- propose_candidates_v51 vs v4 on the slot Carmen frees (Cardiología, near zone)
  await rpc("send_reminders");
  const { data: carmen } = await db.from("patients").select("id").eq("token", "carmen").single();
  const { data: appt } = await db.from("appointments").select("id").eq("patient_id", carmen.id).eq("is_base", true).single();
  await rpc("patient_reply", { p_appt: appt.id, p_reply: "libera", p_channel: "mensaje" });
  const { data: slot } = await db.from("slots").select("id").eq("source_appointment_id", appt.id).single();
  const prop4 = await rpc("propose_candidates", { p_slot: slot.id });
  const prop51 = await rpc("propose_candidates_v51", { p_slot: slot.id });
  const ids = (p) => p.candidates.map((c) => c.request_id).sort((x, y) => x - y).join(",");
  assert(prop51.available === prop4.available && prop51.zone === prop4.zone, `mismo filtro de elegibles (${prop51.available}, zona ${prop51.zone})`);
  if (prop4.k === prop4.available && prop51.k === prop51.available) {
    assert(ids(prop51) === ids(prop4), `mismos ${prop51.k} candidatos (todos los elegibles); solo cambia el índice`);
  }
  const c51 = prop51.candidates;
  const sorted = c51.every((c, i) => i === 0 || c51[i - 1].priority_wait > c.priority_wait ||
    (c51[i - 1].priority_wait === c.priority_wait && (c51[i - 1].category < c.category ||
      (c51[i - 1].category === c.category && Number(c51[i - 1].index) >= Number(c.index)))));
  assert(sorted, `candidatos v5.1 en orden: ${c51.map((c) => `${c.short_name} ${c.category} ${two(c.index)}`).join(", ")}`);
  const ai = c51.findIndex((c) => c.request_id === a.id);
  const ji = c51.findIndex((c) => c.request_id === j.id);
  assert(ai >= 0 && ji > ai, "Ana (0.69) va delante de Julio (0.44) también con el índice v5.1");
  console.log("LISTO: prioridad v5.1");
} finally {
  await rpc("reset_demo");
}
