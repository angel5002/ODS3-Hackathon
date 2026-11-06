// Read-only check of the v4 seed (indices, regulator queue, slot proposals).
import { config } from "dotenv"; config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: r, error } = await db.from("v_requests").select("code,eff_category,days_waited,idx,reason,state,short_notice_ok").eq("specialty", "Cardiología").order("idx", { ascending: false });
console.log(error?.message ?? ""); for (const x of r ?? []) console.log(" ", x.code, x.eff_category, x.days_waited, x.idx, x.state, x.short_notice_ok, "|", x.reason);
const { count } = await db.from("requests").select("*", { count: "exact", head: true }); console.log("requests", count);
const { data: reg } = await db.rpc("regulator_list"); console.log("regulator rows", reg?.length, "keys", Object.keys(reg?.[0] ?? {}).join(","));
const { data: slots } = await db.from("slots").select("*"); console.log("slots", slots?.length);
for (const s of slots ?? []) { const { data: p, error: e } = await db.rpc("propose_candidates", { p_slot: s.id }); console.log(" ", s.specialty, s.date, e?.message ?? "", p?.zone, "k", p?.k, "p", p?.fill_probability, "avail", p?.available); }
const { data: demo } = await db.from("patients").select("id,full_name,age,token,demo_role,demo_order").not("demo_role", "is", null).order("demo_order");
console.log(JSON.stringify(demo));
const { data: st } = await db.from("demo_state").select("clock_base_min,demo_date,day_label").single(); console.log(JSON.stringify(st));
