// End-to-end walk of the v4 script (requisitos_v4 §6) through the HTTP API, with the simulated channels.
// Usage: node scripts/dev/flow-v4.mjs [baseUrl] [pin]   (defaults: local dev server + local test PIN)
const BASE = process.argv[2] ?? "http://localhost:3000";
const PIN = process.argv[3] ?? process.env.LOCAL_TEST_PIN ?? "246810";
let cookie = "";
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

async function call(path, body, method = body ? "POST" : "GET", role) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) {
    const jar = new Map(cookie.split("; ").filter(Boolean).map((c) => [c.split("=")[0], c]));
    for (const c of set) jar.set(c.split("=")[0], c.split(";")[0]);
    cookie = [...jar.values()].join("; ");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} ${res.status} ${JSON.stringify(data)}`);
  void role;
  return data;
}
const staff = (action, extra = {}) => call("/api/staff", { action, ...extra });
const view = (v, q = "") => call(`/api/staff/data?view=${v}${q}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) {
  if (!cond) throw new Error(`FALLA: ${msg}`);
  log("ok", msg);
}

await call("/api/access", { pin: PIN, role: "admision" });
const r0 = await staff("reset");
assert(r0.ms < 10000, `reinicio en ${r0.ms} ms (< 10 s)`);

let { requests } = await view("requests");
const ana = requests.find((r) => r.name.startsWith("Ana Gutiérrez"));
const julio = requests.find((r) => r.name.startsWith("Julio Gonzales"));
const luis = requests.find((r) => r.name.startsWith("Luis Ramos"));
assert(Number(ana.idx).toFixed(2) === "0.77" && ana.reason === "P2 · 69 % de su plazo · primera consulta · adulta mayor", `Ana 0.77: ${ana.reason}`);
assert(Number(julio.idx).toFixed(2) === "0.48" && julio.reason === "P2 · 44 % de su plazo · primera consulta", `Julio 0.48: ${julio.reason}`);
assert(Number(luis.idx).toFixed(2) === "0.28" && luis.reason === "P3 · 17 % de su plazo · primera consulta", `Luis 0.28: ${luis.reason}`);

// regulator: new request by the front desk (as the jury would by chat), blind view
const reg = await staff("register", { request: { display_name: "Prueba Jurado Ficticio", age: 35, specialty: "Dermatología", reason_text: "Manchas en la piel desde hace dos meses. Me llamo Prueba Jurado, cel 987654321", doc_type: "dni", insurance: false, district: "Surco" } });
log("registrada", reg.code);
await call("/api/access", { role: "regulador" });
const blind = await call("/api/regulator");
const mine = blind.rows.find((r) => r.code === reg.code);
const raw = JSON.stringify(blind);
assert(mine && mine.state === "pendiente_regulacion", "la solicitud aparece en /regulador");
assert(!/display_name|phone|insurance|district|identifier|Prueba Jurado|Surco|987654321/i.test(raw), "la vista del regulador no filtra identidad ni números");
let denied = false;
try {
  await view("requests");
} catch (e) {
  denied = /403/.test(e.message);
}
assert(denied, "el regulador no puede leer la API de Admisión (403)");
await call("/api/regulator", { action: "regulate", requestId: mine.request_id, category: "P3" });
await call("/api/access", { role: "admision" });

// 72 h reminders; Carmen releases her slot
const rem = await staff("reminders");
log("recordatorios", rem.sent);
const carmen = await call("/api/patient?token=carmen");
const carmenAppt = carmen.appts[0];
await call("/api/patient", { token: "carmen", action: "reply", appointmentId: carmenAppt.id, reply: "libera" });
let { slots } = await view("slots");
const slot = slots.find((s) => s.source_appointment_id === carmenAppt.id);
assert(slot && slot.zone === "cercana", `cupo de Carmen en zona cercana (${slot?.zone})`);
assert(slot.proposal.k === 4 && Math.round(slot.proposal.fill_probability * 100) === 54, `k = ${slot.proposal.k}, ${Math.round(slot.proposal.fill_probability * 100)} %`);
assert(slot.proposal.candidates[0].name.startsWith("Ana") && slot.proposal.candidates[1].name.startsWith("Julio"), "Ana y Julio primeros");

// approve and send; Julio accepts first, Ana after; close
await staff("approve_offer", { slotId: slot.id });
({ slots } = await view("slots"));
const offer = slots.find((s) => s.id === slot.id).offer;
await call("/api/patient", { token: "julio", action: "offer", slotOfferId: offer.id, requestId: julio.id, accept: true });
const again = await call("/api/patient", { token: "julio", action: "offer", slotOfferId: offer.id, requestId: julio.id, accept: false });
assert(again.response === "acepta", "respuesta repetida no duplica ni cambia (idempotente)");
await sleep(300);
await call("/api/patient", { token: "ana", action: "offer", slotOfferId: offer.id, requestId: ana.id, accept: true });
await staff("close_offer", { offerId: offer.id });
({ slots } = await view("slots"));
const { feed } = await view("slots");
const msg = feed.find((e) => e.kind === "asignacion")?.detail ?? "";
assert(/Asignado a Ana G\. \(prioridad 0\.77: P2, 69 % de su plazo\) aunque Julio respondió primero \(0\.48\)/.test(msg), msg);
({ requests } = await view("requests"));
assert(requests.find((r) => r.id === julio.id).state === "en_espera_prioritaria", "Julio queda en espera prioritaria");

// Ana validates on her simulated phone -> domino frees 09/11
const anaPhone = await call("/api/patient?token=ana");
const val = anaPhone.messages.filter((m) => m.kind === "validacion").pop();
await call("/api/patient", { token: "ana", action: "validate", assignmentId: val.assignment_id, ok: true, role: "paciente" });
({ slots } = await view("slots"));
const dom = slots.find((s) => s.origin === "domino");
assert(dom && dom.zone === "lejana" && dom.date === "2023-11-09", `dominó: cita del 09/11 libre en zona lejana`);
assert(dom.proposal.k === 4 && dom.proposal.candidates[0].name.startsWith("Luis"), `ofrecida a ${dom.proposal.k}, primero Luis`);
await staff("approve_offer", { slotId: dom.id });
// simulated candidates answer via the demo clock; push it with ticks
for (let i = 0; i < 20; i++) {
  await staff("advance", { minutes: 1 });
  ({ slots } = await view("slots"));
  const d = slots.find((s) => s.id === dom.id);
  if (d.state === "ocupado") break;
  if (d.offer?.state === "enviada" && d.offer.candidates.filter((c) => c.response).length >= 3) await staff("close_offer", { offerId: d.offer.id });
  await sleep(1500);
}
({ slots } = await view("slots"));
const domDone = slots.find((s) => s.id === dom.id);
assert(domDone.state === "ocupado" && domDone.assignments[0].short_name === "Luis R.", "el cupo del 09/11 termina en Luis");

// withdraw without reason is rejected
let rejected = false;
try {
  await staff("withdraw", { requestId: luis.id, reason: null });
} catch {
  rejected = true;
}
assert(rejected, "retiro sin motivo: rechazado");

// Dermatología: the jury's P3 request gets the mid-zone slot offer
({ slots } = await view("slots"));
const derm = slots.find((s) => s.specialty === "Dermatología" && s.zone === "media");
assert(derm.proposal.candidates.some((c) => c.code === reg.code), "la solicitud P3 del jurado es candidata del cupo de Dermatología (zona media)");

const board = await view("board");
log("tablero", JSON.stringify({ sin_cupo: board.board.registered_without_slot, llenados: board.board.slots_filled, ofertas: board.board.offers_sent, validaciones: board.board.validations }));
log("LISTO: guion v4 completo con canales simulados");
