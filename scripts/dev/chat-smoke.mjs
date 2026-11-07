// Production smoke test of the live chat: new session, consent, status, then SALIR (deletes the session).
import { requireDbWrite } from "./db-write-guard.mjs";
requireDbWrite("chat-smoke.mjs");
const BASE = process.argv[2] ?? "https://ods3-hackathon.vercel.app";
let cookie = "";
async function call(path, body) {
  const t = Date.now();
  const res = await fetch(BASE + path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  const d = await res.json().catch(() => ({}));
  return { status: res.status, d, ms: Date.now() - t };
}
let r = await call("/api/chat/session", {});
console.log("sesión", r.status, r.ms, "ms", r.d.alias);
for (const text of ["ACEPTO", "2"]) {
  r = await call("/api/chat/messages", { text });
  const g = await call("/api/chat/messages");
  console.log(`«${text}»`, r.status, r.ms, "ms ->", g.d.messages.at(-1).body.split("\n")[0].slice(0, 80));
}
r = await call("/api/chat/messages", { text: "SALIR" });
console.log("SALIR", r.status, r.ms, "ms", r.d.replies?.[0]?.body);
console.log("después de SALIR:", (await call("/api/chat/messages")).status);
