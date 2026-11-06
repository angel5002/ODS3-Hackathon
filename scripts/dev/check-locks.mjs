// Read-only: how long the demo clock tick takes and how many calls/appointments are in flight.
import { config } from "dotenv"; config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const c1 = await db.from("calls").select("status", { count: "exact", head: true }).eq("status", "sonando");
const c2 = await db.from("calls").select("status", { count: "exact", head: true });
const a = await db.from("appointments").select("id", { count: "exact", head: true }).eq("status", "en_llamada");
console.log("calls ringing", c1.count, "total", c2.count, "appts en_llamada", a.count);
