// Production parity check of the phone voice (E5): creates ONE test call for a demo character in the shared
// database, asks the DEPLOYED /api/voice/session for it (as the simulated phone would) and closes the call.
// Prints whether a signed URL came back or why not; never prints the URL, keys or tokens.
// Writes to the shared database: requires ALLOW_DB_WRITE=1.
// Usage: ALLOW_DB_WRITE=1 node scripts/dev/prod-voice-check.mjs [baseUrl] [phoneToken]
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { requireDbWrite } from "./db-write-guard.mjs";

requireDbWrite("prod-voice-check");
config({ path: ".env.local", quiet: true });
const BASE = process.argv[2] ?? "https://ods3-hackathon.vercel.app";
const TOKEN = process.argv[3] ?? "rosa";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: patient } = await db.from("patients").select("id").eq("token", TOKEN).single();
const { data: callId, error } = await db.rpc("start_test_call", { p_session: null, p_patient: patient.id });
if (error) throw new Error(error.message);
console.log("llamada de prueba", callId, "para el teléfono", TOKEN);
try {
  // the phone first marks the call as answered, then asks for the session (same order as CallScreen)
  const st = await fetch(`${BASE}/api/voice/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: TOKEN, callId, status: "en_curso" }) });
  console.log("POST /api/voice/status en_curso ->", st.status);
  const t = Date.now();
  const r = await fetch(`${BASE}/api/voice/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: TOKEN, callId }) });
  const d = await r.json().catch(() => ({}));
  console.log("POST /api/voice/session ->", r.status, `${Date.now() - t} ms`);
  if (d.session) {
    const vars = d.session.dynamicVariables ?? {};
    console.log("  URL firmada: sí (wss:", String(d.session.signedUrl).startsWith("wss://"), ") agente:", d.session.agent);
    console.log("  variables dinámicas vacías:", Object.keys(vars).filter((k) => !vars[k]).join(", ") || "ninguna");
  } else {
    console.log("  URL firmada: NO. Motivo:", d.reason ?? d.error ?? "(sin motivo)");
  }
} finally {
  await db.rpc("update_call", { p_call: callId, p_status: "finalizada", p_result: "Prueba de paridad con producción" });
  console.log("llamada", callId, "finalizada");
}
