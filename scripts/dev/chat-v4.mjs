// Live web chat walk (RF-13/RF-14) through the HTTP API: consent, full registration by the bot,
// session isolation (foreign or tampered cookie -> 401), offer and validation answered in the chat.
// Usage: node scripts/dev/chat-v4.mjs [baseUrl] [pin]
import { requireDbWrite } from "./db-write-guard.mjs";
requireDbWrite("chat-v4.mjs");
const BASE = process.argv[2] ?? "http://localhost:3000";
const PIN = process.argv[3] ?? process.env.LOCAL_TEST_PIN ?? "246810";
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
function assert(c, m) {
  if (!c) throw new Error(`FALLA: ${m}`);
  log("ok", m);
}

function client() {
  let cookie = "";
  return {
    get cookie() {
      return cookie;
    },
    set cookie(v) {
      cookie = v;
    },
    async call(path, body, method = body ? "POST" : "GET") {
      const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
      const set = res.headers.getSetCookie?.() ?? [];
      if (set.length) {
        const jar = new Map(cookie.split("; ").filter(Boolean).map((c) => [c.split("=")[0], c]));
        for (const c of set) jar.set(c.split("=")[0], c.split(";")[0]);
        cookie = [...jar.values()].join("; ");
      }
      return { status: res.status, data: await res.json().catch(() => ({})) };
    },
  };
}

const jury = client();
await jury.call("/api/chat/session", {});
let r = await jury.call("/api/chat/messages");
assert(r.status === 200 && /ACEPTO/.test(r.data.messages[0].body), "primer mensaje: consentimiento");
await jury.call("/api/chat/messages", { text: "hola" });
r = await jury.call("/api/chat/messages");
assert(/ACEPTO/.test(r.data.messages.at(-1).body), "sin ACEPTO solo responde el consentimiento");

const steps = [
  ["ACEPTO", /Qué desea hacer/],
  ["1", /para usted o para otra persona/],
  ["para mí", /nombre del paciente/],
  ["Lucía Prueba Ficticia", /documento/],
  ["4", /edad/],
  ["tengo 35 añitos", /especialidad/],
  ["me pica la piel", /elija una opción|especialidad/],
  ["7", /hoja de referencia/],
  ["2", /por qué necesita/],
  ["Manchas en los brazos desde hace dos meses. Me llamo Lucía Prueba.", /signos/],
  ["no", /avisemos/],
  ["1", /2 días de anticipación/],
  ["sí", /embarazada o tiene alguna discapacidad/],
  ["3", /Resumen: Dermatología/],
  ["1", /número de solicitud es S-\d{4}/],
];
let code = "";
for (const [text, expect] of steps) {
  const t = Date.now();
  const p = await jury.call("/api/chat/messages", { text });
  assert(p.status === 200, `envío «${text}» (${Date.now() - t} ms${p.data.meta?.interpreted_by ? `, ${p.data.meta.interpreted_by}` : ""})`);
  r = await jury.call("/api/chat/messages");
  const last = r.data.messages.at(-1).body;
  assert(expect.test(last), `respuesta: ${last.split("\n")[0].slice(0, 90)}`);
  const m = last.match(/S-\d{4}/);
  if (m) code = m[0];
}

// isolation: no cookie, tampered cookie
const anon = client();
assert((await anon.call("/api/chat/messages")).status === 401, "sin cookie: 401");
anon.cookie = jury.cookie.replace(/asistia_chat=([^.;]+)\.[^;]+/, "asistia_chat=$1.firma-falsa");
assert((await anon.call("/api/chat/messages")).status === 401, "cookie alterada: 401");
const other = client();
await other.call("/api/chat/session", {});
const o = await other.call("/api/chat/messages");
assert(!JSON.stringify(o.data).includes("Lucía"), "otra sesión no ve la conversación ajena");

// staff: the request reaches the regulator without the alias or the name; regulate P3; offer the Dermatología slot
const staff = client();
await staff.call("/api/access", { pin: PIN, role: "regulador" });
const reg = await staff.call("/api/regulator");
const row = reg.data.rows.find((x) => x.code === code);
assert(row && !/Lucía|Prueba|alias/i.test(JSON.stringify(row)), `${code} en /regulador sin nombre (motivo: «${row?.reason_text}»)`);
await staff.call("/api/regulator", { action: "regulate", requestId: row.request_id, category: "P3" });
await staff.call("/api/access", { role: "admision" });
const slots = (await staff.call("/api/staff/data?view=slots")).data.slots;
const derm = slots.find((s) => s.specialty === "Dermatología" && s.zone === "media" && s.state === "libre");
assert(derm?.proposal.candidates.some((c) => c.code === code), "candidato del cupo de Dermatología (zona media)");
const ap = await staff.call("/api/staff", { action: "approve_offer", slotId: derm.id });
assert(ap.status === 200, "oferta aprobada y enviada");
r = await jury.call("/api/chat/messages");
assert(/Se liberó un cupo de Dermatología/.test(r.data.messages.at(-1).body), "la oferta llega al chat");
await jury.call("/api/chat/messages", { text: "1" });
const open = (await staff.call("/api/staff/data?view=slots")).data.slots.find((s) => s.id === derm.id).offer;
if (open?.state === "enviada") await staff.call("/api/staff", { action: "close_offer", offerId: open.id });
r = await jury.call("/api/chat/messages");
const val = r.data.messages.at(-1).body;
assert(/El cupo de Dermatología .* es suyo/.test(val), `asignado al cerrar la oferta: ${val.slice(0, 70)}`);
await jury.call("/api/chat/messages", { text: "Sí, soy el paciente" });
r = await jury.call("/api/chat/messages");
assert(/Su cita quedó registrada: Dermatología/.test(r.data.messages.at(-1).body), "validada en el chat: cita registrada");
await jury.call("/api/chat/messages", { text: "2" });
r = await jury.call("/api/chat/messages");
log("estado:", r.data.messages.at(-2)?.body);
log("LISTO: chat en vivo");
