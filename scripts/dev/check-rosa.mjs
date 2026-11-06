// Read-only: Rosa's appointment, calls and events.
import { config } from "dotenv"; config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: a } = await db.from("appointments").select("id,status").eq("patient_id", "P0015");
console.log(JSON.stringify(a));
const { data: c } = await db.from("calls").select("id,status,provider,result,actions").eq("patient_id", "P0015");
console.log(JSON.stringify(c));
const { data: e } = await db.from("events").select("to_status,channel,actor,detail").eq("patient_id", "P0015").order("id");
console.log(JSON.stringify(e));
