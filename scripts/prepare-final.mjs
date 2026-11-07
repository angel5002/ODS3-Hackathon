// "Preparar demo para la final" from the terminal (the same sequence as the /demo button, src/lib/demo/prepare-final.ts).
// RESETS the shared demo: tell the team first, never while someone is testing.
// Usage: ALLOW_DB_WRITE=1 node --env-file=.env.local scripts/prepare-final.mjs --yes
// Prints only step names and counts; never keys.
import { createClient } from "@supabase/supabase-js";
import { prepareFinal } from "../src/lib/demo/prepare-final.ts";

if (process.env.ALLOW_DB_WRITE !== "1" || !process.argv.includes("--yes")) {
  console.log("prepare-final: reinicia la demo compartida. Requiere ALLOW_DB_WRITE=1 y --yes.");
  process.exit(3);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const report = await prepareFinal(db);
for (const s of report.steps) console.log(`${s.ok ? "ok   " : "FALLA"} ${s.step}: ${s.detail}`);
console.log(`RESULTADO: ${report.ok ? "lista para la final" : "con fallas"} (${(report.ms / 1000).toFixed(1)} s)`);
process.exit(report.ok ? 0 : 1);
