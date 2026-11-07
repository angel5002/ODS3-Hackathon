// Jury cards (track E): token generation and the projector's activity feed. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { JURY_ALPHABET, isJuryToken, juryToken, newJuryTokens, testJuryToken } from "../src/lib/jury/tokens.ts";
import { buildActivity, buildJuryOverview, type JurySnapshot } from "../src/lib/jury/overview.ts";

const rand = (n: number) => new Uint8Array(randomBytes(n));
/** deterministic byte source that walks 0, 1, 2, ... */
function counter(start = 0) {
  let i = start;
  return (n: number) => Uint8Array.from({ length: n }, () => i++ % 256);
}

// the 8 printed cards (supabase/migrations/20261107070000_e5_jury_cards.sql)
const PRINTED = ["j-cmp73z", "j-geg8pd", "j-xrcnu6", "j-a34yvp", "j-g6ytk3", "j-5fsv23", "j-8bv35u", "j-uqpbrq"];

test("a token is 'j-' plus 6 characters of the unambiguous alphabet", () => {
  for (let i = 0; i < 500; i++) {
    const t = juryToken(rand);
    assert.match(t, /^j-[a-z2-9]{6}$/);
    for (const ch of t.slice(2)) assert.ok(JURY_ALPHABET.includes(ch), `${ch} in alphabet`);
    assert.ok(!/[01ilo]/.test(t.slice(2)), "no look-alike characters");
    assert.ok(isJuryToken(t));
  }
});

test("bytes >= 248 are rejected so every symbol is equally likely", () => {
  const t = juryToken(() => Uint8Array.from([255, 250, 248, 0, 1, 2, 3, 4, 5, 6, 7, 8]));
  assert.equal(t, `j-${JURY_ALPHABET.slice(0, 6)}`);
});

test("new tokens are unique among themselves and never reuse a token in use", () => {
  const taken = new Set([...PRINTED, "julio", "j2895s6a", "rosa", "carmen"]);
  const tokens = newJuryTokens(400, taken, rand);
  assert.equal(new Set(tokens).size, 400);
  for (const t of tokens) assert.ok(!taken.has(t));
});

test("a repeating random source still yields unique tokens (collisions are retried)", () => {
  const first = juryToken(counter());
  const tokens = newJuryTokens(5, [first], counter());
  assert.ok(!tokens.includes(first));
  assert.equal(new Set(tokens).size, 5);
});

test("an exhausted source fails loudly instead of returning duplicates", () => {
  const same = () => new Uint8Array(12); // always "aaaaaa"
  assert.throws(() => newJuryTokens(2, [], same, 50), /unique/);
});

test("printed cards and test cards are jury tokens; old phone tokens are not", () => {
  for (const t of PRINTED) assert.ok(isJuryToken(t), t);
  assert.equal(new Set(PRINTED).size, PRINTED.length);
  assert.ok(isJuryToken(testJuryToken(rand)));
  for (const t of ["julio", "j2895s6a", "carmen", "j-", "j-abc", "j-ABCDEF", "j-abcde1", "j-abcdefg", "x-abcdef", null, 7]) {
    assert.ok(!isJuryToken(t), String(t));
  }
});

// ---------------------------------------------------------------- the activity feed
const T = (s: number) => new Date(Date.UTC(2026, 10, 8, 15, 0, s)).toISOString();
const card = (token: string, character: string, kind: "cancela" | "confirma" | "pide_cita" | "acepta_oferta", extra = {}) => ({
  token,
  character,
  story: `Usted es ${character}.`,
  tryLine: "Pruebe.",
  channel: "chat" as const,
  kind,
  specialty: "Dermatología",
  scene: false,
  test: false,
  sort: 0,
  appointment: null,
  firstVisit: null,
  ...extra,
});

function snapshot(): JurySnapshot {
  return {
    epoch: T(0),
    cards: [
      card("j-cmp73z", "Carmen", "cancela", {
        scene: true,
        firstVisit: T(1),
        appointment: { id: 1, specialty: "Oncología Médica", date: "2023-10-19", time: "09:00", status: "liberada" },
      }),
      card("j-geg8pd", "Jorge", "confirma", {
        firstVisit: T(2),
        appointment: { id: 2, specialty: "Medicina Interna", date: "2023-10-19", time: "11:40", status: "recordatorio_enviado" },
      }),
      card("j-g6ytk3", "Óscar", "pide_cita", { firstVisit: T(3) }),
      card("j-5fsv23", "Teresa", "acepta_oferta"),
      card("j-8bv35u", "Raúl", "confirma", {
        appointment: { id: 3, specialty: "Gastroenterología", date: "2023-10-19", time: "10:40", status: "recordatorio_enviado" },
      }),
    ],
    requests: [
      { token: "j-g6ytk3", id: 50, code: "S-0700", specialty: "Dermatología", category: "P2", state: "con_cita", source: "chat", seeded: false, createdAt: T(10), position: null },
      { token: "j-5fsv23", id: 40, code: "S-0650", specialty: "Cirugía Torácica", category: "P2", state: "priorizada_sin_cupo", source: "semilla", seeded: true, createdAt: T(0), position: 1 },
    ],
    apptEvents: [
      { token: "j-cmp73z", toStatus: "liberada", channel: "mensaje", at: T(5) },
      { token: "j-geg8pd", toStatus: "confirmada", channel: "voz", at: T(9) },
    ],
    reqEvents: [
      { token: "j-g6ytk3", requestId: 50, specialty: "Dermatología", type: "recepcion", payload: { source: "chat" }, at: T(10) },
      { token: "j-g6ytk3", requestId: 50, specialty: "Dermatología", type: "regulacion", payload: { category: "P2" }, at: T(11) },
      { token: "j-g6ytk3", requestId: 50, specialty: "Dermatología", type: "oferta", payload: {}, at: T(12) },
      { token: "j-g6ytk3", requestId: 50, specialty: "Dermatología", type: "respuesta_oferta", payload: { response: "acepta" }, at: T(13) },
      { token: "j-g6ytk3", requestId: 50, specialty: "Dermatología", type: "confirmacion", payload: {}, at: T(14) },
      // a row of a card that is not in this view (test card hidden from the projector)
      { token: "j-test-zzzz", requestId: 99, specialty: "Dermatología", type: "recepcion", payload: { source: "chat" }, at: T(15) },
    ],
    calls: [{ token: "j-geg8pd", id: 7, purpose: "confirmacion", status: "finalizada", createdAt: T(6), answeredAt: T(7), endedAt: T(9) }],
    chats: [{ token: "j-g6ytk3", at: T(4) }],
    scene: {
      token: "j-cmp73z",
      slotId: 77,
      specialty: "Oncología Médica",
      date: "2023-10-19",
      time: "09:00",
      state: "ocupado",
      openOffer: false,
      releasedAt: T(5),
      assignment: { name: "Tito", state: "confirmada", at: T(20) },
    },
  };
}

test("the feed is newest first, with short plain sentences", () => {
  const a = buildActivity(snapshot());
  for (let i = 1; i < a.length; i++) assert.ok(a[i - 1].at >= a[i].at, "newest first");
  const texts = a.map((x) => x.text);
  assert.ok(texts.includes("Carmen avisó por mensaje que no podrá ir: su cupo no se pierde"));
  assert.ok(texts.includes("Jorge confirmó su cita en la llamada"));
  assert.ok(texts.includes("Óscar pidió una cita de dermatología por chat"));
  assert.ok(texts.includes("Un profesional revisó la solicitud de Óscar (P2)"));
  assert.ok(texts.includes("Óscar aceptó el cupo"));
  assert.ok(texts.includes("Óscar confirmó el cupo: ya tiene cita"));
  assert.ok(texts.includes("El cupo que liberó Carmen es ahora de Tito"));
  assert.equal(a[0].text, "El cupo que liberó Carmen es ahora de Tito");
  for (const x of a) assert.ok(x.text.length <= 90, `short: ${x.text}`);
});

test("each line stays under its own token, and rows of cards outside the view are dropped", () => {
  const s = snapshot();
  const a = buildActivity(s);
  const names = new Map(s.cards.map((c) => [c.token, c.character]));
  for (const x of a) {
    assert.ok(names.has(x.token), `known card ${x.token}`);
    assert.equal(x.character, names.get(x.token));
    // the sentence names its own character (or is about her slot)
    assert.ok(x.text.includes(x.character), `${x.text} mentions ${x.character}`);
  }
  assert.ok(!a.some((x) => x.token === "j-test-zzzz"));
  // Raúl did nothing: no line; Teresa only has a seeded request: no "pidió una cita"
  assert.ok(!a.some((x) => x.token === "j-8bv35u"));
  assert.ok(!a.some((x) => x.token === "j-5fsv23"));
});

test("card states, carmenSlot and new requests", () => {
  const o = buildJuryOverview(snapshot());
  const st = Object.fromEntries(o.cards.map((c) => [c.character, c.state]));
  assert.deepEqual(st, { Carmen: "completo", Jorge: "en_curso", Óscar: "completo", Teresa: "sin_abrir", Raúl: "sin_abrir" });
  assert.equal(o.cards[0].path, "/j/j-cmp73z");
  assert.equal(o.cards.find((c) => c.character === "Teresa")!.lastAt, null);
  assert.deepEqual(o.carmenSlot, { slotId: 77, specialty: "Oncología Médica", when: T(5), state: "asignado", assignedTo: "Tito" });
  assert.deepEqual(o.newRequests, [
    { code: "S-0700", character: "Óscar", specialty: "Dermatología", category: "P2", position: null, state: "Con cita" },
  ]);
});

test("a card that was only opened is 'abierta'; the slot offered and not yet taken is 'ofrecido'", () => {
  const s = snapshot();
  s.apptEvents = [];
  s.calls = [];
  s.cards[0].appointment!.status = "recordatorio_enviado";
  s.scene = { ...s.scene!, state: "retenido", openOffer: true, assignment: null };
  const o = buildJuryOverview(s);
  assert.equal(o.cards.find((c) => c.character === "Carmen")!.state, "abierta");
  assert.equal(o.cards.find((c) => c.character === "Jorge")!.state, "abierta");
  assert.equal(o.carmenSlot!.state, "ofrecido");
  assert.equal(o.carmenSlot!.assignedTo, null);
  s.scene = null;
  assert.equal(buildJuryOverview(s).carmenSlot, null);
});
