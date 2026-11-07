// Pre-visit state machine and summary rules (proposal v5.1 §4.2, pitch v7 scene 2). Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alarmMentions,
  buildSummary,
  initialState,
  parseMedsAndAllergies,
  shown,
  splitOnset,
  step,
  type PcState,
  type StepOptions,
} from "../src/lib/preconsulta/machine.ts";
import { arrivalWindow } from "../src/lib/preconsulta/arrival.ts";
import { ALARM_WORDS } from "../src/lib/bot/interpret.ts";

const window = arrivalWindow({ appointment: "10:15" });
const opts: StepOptions = { window, extraAlarmWords: ALARM_WORDS };
const run = (answers: string[], from: PcState = initialState("Tito", "m")) => {
  let s = from;
  const replies: string[][] = [];
  let last = null as ReturnType<typeof step> | null;
  for (const a of answers) {
    last = step(s, a, opts);
    s = last.state;
    replies.push(last.replies);
  }
  return { s, replies, last: last! };
};

test("arrival window: 20 min late with the simulated durations → 10:20 to 10:35, labelled as an estimate", () => {
  assert.deepEqual(window, { desde: "10:20", hasta: "10:35", atrasoMin: 20, esEstimacion: true });
  assert.equal(arrivalWindow({ appointment: "09:00" })?.atrasoMin, 0, "the first patient has no delay");
  assert.equal(arrivalWindow({ appointment: "08:00" }), null, "before the session starts: no window");
});

test("scene 2 script: Tito's three answers give the exact questions, the medicine confirmation and the closing line", () => {
  const { s, replies, last } = run(["Me duele la rodilla derecha desde hace una semana.", "Ibuprofeno. Alergias, ninguna.", "Sí", "No."]);
  assert.deepEqual(replies[0], ["¿Tomó algún medicamento? ¿Tiene alergias?"]);
  assert.deepEqual(replies[1], ["Anoté: Ibuprofeno. ¿Es correcto? Responda SÍ o NO."], "medicines are confirmed one by one");
  assert.deepEqual(replies[2], ["¿Tiene fiebre, o la rodilla está muy hinchada o caliente?"]);
  assert.equal(
    replies[3][0],
    "Gracias, Tito. Su médico lo recibirá con este resumen. Su consultorio va con 20 min de atraso: llegue entre 10:20 y 10:35.",
  );
  assert.match(replies[3][1], /estimación/);
  assert.equal(last.status, "completa");
  const sum = buildSummary(s, { sessionId: "x", window });
  assert.equal(sum.referidoPorElPaciente, true);
  assert.equal(sum.motivo, "Me duele la rodilla derecha");
  assert.equal(sum.inicio, "desde hace una semana");
  assert.deepEqual(sum.medicamentos, [{ nombre: "Ibuprofeno", confirmado: true }]);
  assert.equal(sum.alergias, "ninguna");
  assert.deepEqual(sum.alarma, { preguntada: true, positiva: false, detalle: null });
  assert.equal(sum.derivadoAEmergencia, false);
  assert.deepEqual(sum.ventanaLlegada, { desde: "10:20", hasta: "10:35", atrasoMin: 20, esEstimacion: true });
  assert.ok(sum.signos.every((x) => x.estado === "no"), "the three signs asked are verified negations");
  assert.equal(sum.otrosSignos, "no_evaluado");
});

test("the first question is the script's", () => {
  assert.equal(step(initialState("Tito", "m"), "", opts).replies.length, 0);
  const s = initialState("Tito", "m");
  assert.equal(s.step, "motivo");
});

test("missing fields are 'no informado', never invented", () => {
  const s = initialState("Ana");
  const sum = buildSummary(s, { sessionId: "x" });
  for (const v of [sum.motivo, sum.inicio, sum.alergias]) assert.equal(shown(v), "No informado");
  assert.deepEqual(sum.medicamentos, []);
  assert.equal(sum.ventanaLlegada, null, "no window before the interview ends");
  assert.ok(sum.signos.every((x) => x.estado === "no_evaluado"), "signs not asked are 'no evaluado'");
  assert.equal(sum.alarma.preguntada, false);
});

test("'no sé' and 'prefiero decirlo en la consulta' are recorded as such", () => {
  const { s } = run(["Prefiero decirlo en la consulta", "no sé"], initialState("Ana"));
  const sum = buildSummary(s, { sessionId: "x" });
  assert.equal(sum.motivo, "Prefiere decirlo en la consulta");
  assert.equal(sum.motivoEstado, "prefiere_consulta");
  assert.equal(sum.medicamentosEstado, "no_sabe");
  assert.equal(shown(sum.alergias), "No informado");
});

test("a missing onset is asked for (required field)", () => {
  const { replies, s } = run(["Me duele la espalda"], initialState("Ana"));
  assert.deepEqual(replies[0], ["¿Desde cuándo tiene esta molestia?"]);
  assert.equal(s.step, "inicio");
  assert.equal(s.part?.word, "espalda");
});

test("negation verification: a bare 'No' to the double question is asked again; 'sin fiebre' in free text stays to verify", () => {
  const a = run(["Me duele el tobillo desde ayer, sin fiebre", "No"]);
  assert.equal(a.s.step, "aclarar_no");
  assert.equal(a.s.signos.find((x) => x.id === "fiebre")?.estado, "por_verificar", "a negation in a free answer is not verified");
  const b = run(["Sí"], a.s);
  assert.equal(b.s.medsEstado, "ninguno");
  assert.equal(b.s.alergias?.valor, "ninguna");
  assert.deepEqual(b.replies[0], ["¿Tiene fiebre, o el tobillo está muy hinchado o caliente?"]);
  const c = run(["no"], b.s);
  assert.equal(c.s.signos.find((x) => x.id === "fiebre")?.estado, "no", "the direct closed question verifies it");
});

test("negation verification: an unclear answer to the alarm question is never written as 'sin signos de alarma'", () => {
  const base = run(["Me duele la rodilla desde hace una semana", "Ninguno. Alergias, ninguna."]).s;
  const a = run(["un poco hinchada"], base);
  assert.equal(a.s.step, "alarma", "asked again");
  assert.match(a.replies[0][0], /SÍ o NO/);
  const b = run(["no sé"], a.s);
  assert.equal(b.last.status, "completa");
  assert.equal(b.last.task?.type, "alarma", "a person follows up");
  const sum = buildSummary(b.s, { sessionId: "x" });
  assert.ok(sum.signos.every((x) => x.estado !== "no"), "no sign is marked as denied");
  assert.equal(sum.alarma.positiva, false);
  assert.ok(sum.pendientes.some((p) => /alarma/.test(p)));
});

test("medicines are confirmed one by one; a 'no' removes it and asks for the right name", () => {
  const a = run(["Me duele la rodilla desde hace dos días", "Tomé paracetamol y naproxeno. No tengo alergias."]);
  assert.deepEqual(a.s.medicamentos.map((m) => m.nombre), ["Paracetamol", "Naproxeno"]);
  assert.equal(a.s.alergias?.valor, "ninguna");
  const b = run(["sí"], a.s);
  assert.equal(b.replies[0][0], "Anoté: Naproxeno. ¿Es correcto? Responda SÍ o NO.");
  const c = run(["no", "diclofenaco", "sí"], b.s);
  assert.deepEqual(c.s.medicamentos, [
    { nombre: "Paracetamol", confirmado: true },
    { nombre: "Diclofenaco", confirmado: true },
  ]);
  assert.ok(c.s.pendientes.some((p) => /Naproxeno/.test(p)), "the correction is kept for the doctor");
  assert.equal(c.s.step, "alarma");
});

test("an unconfirmed medicine is flagged in the summary", () => {
  const a = run(["Me duele la rodilla desde hace dos días", "Ibuprofeno. Alergias, ninguna."]);
  assert.deepEqual(buildSummary(a.s, { sessionId: "x" }).medicamentos, [{ nombre: "Ibuprofeno", confirmado: false }]);
});

test("alarm signs interrupt the interview at any step, refer to emergency and create a staff task", () => {
  for (const [answers, label] of [
    [["Me duele la rodilla desde ayer", "Ibuprofeno. Alergias, ninguna.", "sí", "Sí", "me arde mucho"], "yes to the alarm question, then which one"],
    [["Me duele la cabeza desde ayer", "Ninguno. Alergias, ninguna.", "sí, me desmayé hace un rato"], "general question, with the sign"],
    [["Me duele la rodilla desde ayer", "Ibuprofeno. Alergias, ninguna.", "sí", "No, pero tengo fiebre"], "'no, pero' with a sign"],
    [["Me duele la rodilla y está muy hinchada"], "in the motive"],
    [["Me duele la rodilla desde ayer", "Paracetamol para la fiebre"], "in the medicines answer"],
    [["Tengo dolor fuerte en el pecho"], "the chat bot's alarm list"],
    [["Me duele la rodilla desde ayer", "Ibuprofeno. Alergias, ninguna.", "sí", "la rodilla está caliente"], "hot knee"],
  ] as [string[], string][]) {
    const { s, last } = run(answers);
    assert.equal(s.step, "emergencia", label);
    assert.equal(last.status, "derivada_emergencia", label);
    assert.match(last.replies[0], /emergencia/, label);
    assert.match(last.replies[0], /106/, label);
    assert.equal(last.task?.type, "alarma", label);
    const sum = buildSummary(s, { sessionId: "x", window });
    assert.equal(sum.derivadoAEmergencia, true, label);
    assert.equal(sum.alarma.positiva, true, label);
    assert.equal(sum.ventanaLlegada, null, `${label}: no arrival window after an alarm`);
    // the interview is over: further answers change nothing
    const after = step(s, "Me duele la rodilla", opts);
    assert.deepEqual(after.replies, [], label);
  }
});

test("a bare 'sí' to the alarm question asks briefly which one (no diagnosis), then refers", () => {
  const base = run(["Me duele la cabeza desde ayer", "Ninguno. Alergias, ninguna."]).s;
  const a = run(["Sí"], base);
  assert.equal(a.s.step, "alarma_cual");
  assert.match(a.replies[0][0], /^¿Qué siente\? Cuéntelo en pocas palabras/);
  assert.match(a.replies[0][0], /106/, "the emergency number is already there");
  const b = run(["no sé, algo raro"], a.s);
  assert.equal(b.last.status, "derivada_emergencia");
  assert.equal(b.last.task?.type, "alarma");
  assert.match(b.last.replies[0], /Hablar con una persona ahora/, "a button to talk to a person now");
  assert.match(b.last.replies[0], /una persona revisará su caso y le escribirá/, "says what the team will do");
});

test("a person without alarm signs gets ONE short general question, never a long list", () => {
  const { replies, s } = run(["Me duele la cabeza desde ayer", "Paracetamol. Alergias, ninguna.", "sí", "no"], initialState("Ana"));
  const all = replies.flat();
  assert.ok(all.includes("¿Siente ahora algo que no puede esperar, como dolor fuerte en el pecho, falta de aire o desmayo?"));
  for (const r of all) {
    assert.ok(!/\n\s*[·•-]/.test(r), `a list in «${r}»`);
    if (r.endsWith("?")) assert.ok(r.split(",").length <= 4 && r.length <= 120, `a long question: «${r}»`);
  }
  assert.ok(!all.some((r) => /embarazo|bebé/.test(r)), "no pregnancy/baby question without that context");
  assert.equal(s.step, "fin");
  assert.deepEqual(s.signos.map((x) => x.estado), ["no", "no", "no"]);
});

test("a pregnancy (or a baby) in the motive adds ITS question, after the general one", () => {
  const { replies, s } = run(["Estoy embarazada de 20 semanas y me duele la cabeza desde ayer", "Ninguno. Alergias, ninguna.", "no"], initialState("Lucía", "f"));
  assert.equal(replies[2][0], "Por el embarazo: ¿tiene ahora sangrado o dolor fuerte de barriga?");
  assert.equal(s.step, "alarma");
  const yes = run(["sí, tengo sangrado"], s);
  assert.equal(yes.last.status, "derivada_emergencia");
  const baby = run(["Mi bebé de 2 meses tiene tos desde ayer", "Ninguno. Alergias, ninguna.", "no"], initialState("Rosa", "f"));
  assert.equal(baby.replies[2][0], "¿El bebé tiene fiebre ahora?");
});

test("every closing says what was registered, who reviews it, how we notify and what to do if worse", () => {
  const done = run(["Me duele la rodilla derecha desde hace una semana.", "Ibuprofeno. Alergias, ninguna.", "Sí", "No."]).last.replies.join(" ");
  for (const re of [/Registramos/, /su médico los revisará/, /le avisaremos por este chat/, /Si se siente peor/, /106/, /estimación/]) assert.match(done, re);
  const person = run(["quiero hablar con una persona"]).last.replies.join(" ");
  for (const re of [/le escribirá/, /registrado/, /revisará/, /Si se siente peor/]) assert.match(person, re);
  const unclear = run(["Me duele la rodilla desde ayer", "Ninguno. Alergias, ninguna.", "un poco", "tal vez"]).last.replies.join(" ");
  for (const re of [/No pudimos confirmar/, /106/, /Registramos/, /Si se siente peor/]) assert.match(unclear, re);
});

test("negated alarm words do not interrupt", () => {
  assert.deepEqual(alarmMentions("No tengo fiebre ni la rodilla caliente").positive, []);
  assert.deepEqual(alarmMentions("No, pero tengo fiebre").positive, ["Fiebre"]);
  assert.deepEqual(alarmMentions("sin fiebre").negated, ["Fiebre"]);
});

test("the summary never carries a diagnosis or a suggested test", () => {
  const { s } = run(["Me duele la rodilla derecha desde hace una semana.", "Ibuprofeno. Alergias, ninguna.", "Sí", "No."]);
  const text = JSON.stringify(buildSummary(s, { sessionId: "x", window })).toLowerCase();
  for (const w of ["diagn", "artritis", "artrosis", "radiograf", "resonancia", "examen", "análisis", "sugerimos", "probable"]) {
    assert.ok(!text.includes(w), `summary contains "${w}"`);
  }
});

test("asking for a person stops the interview and creates a task", () => {
  const { last } = run(["Quiero hablar con una persona"]);
  assert.equal(last.status, "con_persona");
  assert.equal(last.task?.type, "pide_persona");
});

test("parsers", () => {
  assert.deepEqual(splitOnset("Me duele la rodilla derecha desde hace una semana."), { motivo: "Me duele la rodilla derecha", inicio: "desde hace una semana" });
  const p = parseMedsAndAllergies("Ibuprofeno. Alergias, ninguna.");
  assert.deepEqual(p.meds, ["Ibuprofeno"]);
  assert.equal(p.allergies.valor, "ninguna");
  assert.equal(parseMedsAndAllergies("No").ambiguousNo, true);
  assert.equal(parseMedsAndAllergies("Soy alérgico a la penicilina").allergies.valor, "la penicilina");
});
