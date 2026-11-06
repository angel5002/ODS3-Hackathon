// Times a few chat round trips on a fresh session (diagnostics).
const BASE = process.argv[2] ?? "http://localhost:3000";
let cookie = "";
async function call(path, body) {
  const t = Date.now();
  const res = await fetch(BASE + path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  await res.json().catch(() => ({}));
  console.log(path, body?.text ?? "", res.status, Date.now() - t, "ms");
}
await call("/api/chat/session", {});
for (const text of ["ACEPTO", "2", "2", "3", "menu"]) await call("/api/chat/messages", { text });
