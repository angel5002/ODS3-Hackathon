// "Reiniciar demo" 3 times in a row (requisitos §5): each under 10 s.
import { requireDbWrite } from "./db-write-guard.mjs";
requireDbWrite("reset3.mjs");
const BASE = process.argv[2] ?? "http://localhost:3000";
const PIN = process.argv[3] ?? process.env.LOCAL_TEST_PIN ?? "246810";
const res = await fetch(`${BASE}/api/access`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: PIN, role: "admision" }) });
const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
for (let i = 1; i <= 3; i++) {
  const t = Date.now();
  const r = await fetch(`${BASE}/api/staff`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ action: "reset" }) });
  const d = await r.json();
  console.log(`reinicio ${i}: ${r.status} ${Date.now() - t} ms (base ${d.ms} ms)`);
  if (!r.ok || Date.now() - t > 10000) process.exit(1);
}
