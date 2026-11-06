// Read-only: appointments of the demo day without risk, and Rosa's rank.
import { config } from "dotenv"; config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, count } = await db.from("appointments").select("id,specialty,origin,is_base,status,risk", { count: "exact" }).is("risk", null).eq("date", "2023-10-19");
console.log("sin riesgo", count, JSON.stringify(data?.slice(0, 5)));
const { data: r } = await db.from("appointments").select("risk,risk_rank").eq("patient_id", "P0015").single();
console.log("Rosa", JSON.stringify(r));
const { data: st } = await db.from("demo_state").select("threshold_high,threshold_mid").single();
console.log(JSON.stringify(st));
