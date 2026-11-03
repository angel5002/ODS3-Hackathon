// Loads ml/out/*.json into Supabase (RF-07). Wipes the previous data first.
// Usage: npm run db:load   (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local)
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
const db = createClient(url, key, { auth: { persistSession: false } });

const read = (name) => JSON.parse(readFileSync(new URL(`../ml/out/${name}`, import.meta.url), "utf8"));
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

async function insert(table, rows, size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await db.from(table).insert(rows.slice(i, i + size));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  console.log(`${table}: ${rows.length}`);
}

const summary = read("summary.json");
const card = read("model_card.json");
const [y, m, d] = summary.demo_day.split("-").map(Number);
const dayLabel = `${summary.demo_day_weekday} ${d} de ${MONTHS[m - 1]}`;

const t0 = Date.now();
const { error: wipeError } = await db.rpc("wipe_all");
if (wipeError) throw new Error(`wipe_all: ${wipeError.message}`);

await insert("patients", read("patients.json"));
await insert("appointments", read("appointments.json"));
await insert("appointment_outcomes", read("outcomes.json"));
await insert("waitlist", read("waitlist.json"));
await insert("metrics", [
  { key: "summary", value: summary },
  { key: "model_card", value: card },
  { key: "historical", value: read("historical.json") },
]);
const { error: stateError } = await db.from("demo_state").upsert({
  id: 1,
  day_label: dayLabel,
  threshold_high: card.thresholds.alto,
  threshold_mid: card.thresholds.medio,
  call_list_pct: card.call_list_share,
});
if (stateError) throw new Error(`demo_state: ${stateError.message}`);
const { error: resetError } = await db.rpc("reset_demo");
if (resetError) throw new Error(`reset_demo: ${resetError.message}`);
console.log(`Listo en ${((Date.now() - t0) / 1000).toFixed(1)} s. Día de demo: ${dayLabel} de ${y}.`);
