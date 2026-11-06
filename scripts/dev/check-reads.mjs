// Read-only check of the v4 read models.
import { config } from "dotenv"; config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
for (const fn of ["staff_requests", "staff_slots", "staff_validations", "callcenter_tasks", "live_overview", "board_v4"]) {
  const t = Date.now(); const { data, error } = await db.rpc(fn);
  console.log(fn, error?.message ?? "ok", Date.now() - t, "ms", JSON.stringify(data)?.slice(0, 300));
}
