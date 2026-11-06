// Required test (requisitos §7): no full phone number in the stored records (pattern +51\d{9}, also 9-digit mobiles).
import { config } from "dotenv"; config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PATTERNS = [/\+51\s?\d{9}/, /\b9\d{8}\b/];
const sources = [
  ["patients", "full_name,phone"],
  ["messages", "body"],
  ["chat_messages", "body"],
  ["events", "detail"],
  ["requests", "reason_text"],
  ["calls", "result,summary,actions"],
  ["staff_tasks", "note"],
];
let hits = 0;
for (const [t, cols] of sources) {
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(t).select(cols).range(from, from + 999);
    if (error) throw new Error(`${t}: ${error.message}`);
    for (const row of data) {
      const text = JSON.stringify(row);
      if (PATTERNS.some((p) => p.test(text))) {
        hits++;
        console.log("número encontrado en", t, text.slice(0, 120));
      }
    }
    if (data.length < 1000) break;
  }
}
console.log(hits ? `FALLA: ${hits} registros con números` : "ok: ningún número de teléfono completo en los registros");
process.exit(hits ? 1 : 0);
