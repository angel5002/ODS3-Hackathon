// Voice checks (RF-15) against a running server: signed URL only for the owner of the call, and the
// tool endpoint rejects a missing secret, another call's token and a finished call.
// Usage: node scripts/dev/voice-v4.mjs [baseUrl] [pin]
import { createHmac } from "node:crypto";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const BASE = process.argv[2] ?? "http://localhost:3000";
const PIN = process.argv[3] ?? process.env.LOCAL_TEST_PIN ?? "246810";
const SECRET = process.env.ELEVENLABS_TOOL_SECRET;
let cookie = "";
async function call(path, body, headers = {}) {
  const t = Date.now();
  const res = await fetch(BASE + path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", cookie, ...headers }, body: body ? JSON.stringify(body) : undefined });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, data: await res.json().catch(() => ({})), ms: Date.now() - t };
}
function assert(c, m) {
  if (!c) throw new Error(`FALLA: ${m}`);
  console.log("ok", m);
}
const token = (id) => createHmac("sha256", SECRET).update(`call:${id}`).digest("base64url").slice(0, 32);

await call("/api/access", { pin: PIN, role: "admision" });
const { data: rosa } = await call("/api/patient?token=rosa");
const { data: c } = await call("/api/staff", { action: "test_call", patientId: rosa.patient.id });
const callId = c.callId;
cookie = "";
const other = await call("/api/voice/session", { token: "carmen", callId });
assert(other.status === 404, "URL firmada: otro teléfono no la obtiene (404)");
const s = await call("/api/voice/session", { token: "rosa", callId });
assert(s.status === 200 && s.data.session?.signedUrl?.startsWith("wss://"), `URL firmada emitida en ${s.ms} ms para el teléfono de Rosa`);
assert(!JSON.stringify(s.data).includes(process.env.ELEVENLABS_API_KEY), "la clave de API no llega al navegador");

const tool = (body, headers) => call("/api/voice/tools/transfer_to_human", body, headers);
assert((await tool({ call_id: String(callId), token: token(callId) })).status === 401, "herramienta sin secreto: 401");
assert((await tool({ call_id: String(callId), token: token(callId + 1) }, { "x-asistia-secret": SECRET })).status === 403, "herramienta con el token de otra llamada: 403");
const wrong = await call("/api/voice/tools/register_request", { call_id: String(callId), token: token(callId) }, { "x-asistia-secret": SECRET });
assert(wrong.status === 403, "herramienta que no es de la tarea del agente: 403");
const okTool = await tool({ call_id: String(callId), token: token(callId), reason: "prueba automática" }, { "x-asistia-secret": SECRET });
assert(okTool.status === 200 && okTool.data.say, `herramienta válida responde en ${okTool.ms} ms: «${okTool.data.say}»`);
await call("/api/voice/status", { token: "rosa", callId, status: "finalizada", result: "prueba" });
const ended = await tool({ call_id: String(callId), token: token(callId) }, { "x-asistia-secret": SECRET });
assert(ended.status === 409, "herramienta con la llamada terminada: rechazada (409)");
const hook = await call("/api/voice/post-call", { type: "post_call_transcription", data: {} }, { "elevenlabs-signature": "t=1,v0=abc" });
assert(hook.status === 401, "webhook posterior sin firma válida: 401");
console.log("LISTO: voz");
