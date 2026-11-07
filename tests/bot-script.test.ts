// Unit tests of the chat registration bot's script (src/lib/bot/script.ts): alarm signs with ONE general
// question, context questions only with context, referral with what the person said, one closing (the
// duplicated closing of S-0431 on 7/11), closings that say what comes next, the "Hablar con una persona" button.
// Run: node --test tests/bot-script.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { hasAlarmWords, rules } from "../src/lib/bot/interpret.ts";
import {
  DB_ALARM_DELIVERY_PREFIX,
  PERSON_LABEL,
  PERSON_NOW_LABEL,
  QUICK_ACTIONS,
  STEPS,
  closingAlarm,
  closingRegistered,
  isPersonRequest,
  next,
  type BotState,
  type Effect,
  type Reply,
} from "../src/lib/bot/script.ts";

/** Plays answers through the pure transitions, interpreting them with the keyword rules (no model). */
function play(answers: string[]) {
  let state: BotState = { step: "para_quien", data: {} };
  const said: Reply[] = [];
  let effect: Effect | undefined;
  for (const a of answers) {
    const s = STEPS[state.step];
    const v = rules(a, s.kind, s.options ?? []);
    const r = next(state, v, hasAlarmWords);
    said.push(...r.replies);
    state = r.state;
    if (r.effect) {
      effect = r.effect;
      break;
    }
  }
  return { state, said, effect, text: said.map((r) => r.body).join("\n") };
}

const UNTIL_REASON = ["1", "Ana", "1", "34", "2", "2"]; // para mí, Ana, DNI, 34, Cardiología, sin referencia
const OLD_LIST = /fiebre en un bebé de menos de 3 meses|debilidad repentina|alguno de estos signos/i;

test("no alarm: ONE general question, never the long list, no context questions, then a registration", () => {
  const r = play([...UNTIL_REASON, "Control de presión", "No", "1", "1", "3", "1"]);
  assert.equal(r.effect?.type, "register");
  assert.doesNotMatch(r.text, OLD_LIST);
  const alarmQs = r.said.filter((x) => /algo que no puede esperar/.test(x.body));
  assert.equal(alarmQs.length, 1, "asked once");
  assert.match(alarmQs[0].body, /^¿Siente ahora algo que no puede esperar, como dolor fuerte en el pecho, falta de aire o un desmayo\?$/);
  assert.doesNotMatch(r.text, /embarazo\?|bebé tiene fiebre/, "no pregnancy or baby question without that context");
});

test("for another person the question is about that person", () => {
  const r = play(["2", "Rosa Pérez", "1", "70", "1", "2", "Dolor de rodilla", "No", "1"]);
  assert.ok(r.said.some((x) => x.body === "¿Rosa tiene ahora algo que no puede esperar, como dolor fuerte en el pecho, falta de aire o un desmayo?"));
});

test("alarm: yes → asks briefly what they feel (no diagnosis) → referral carrying what they said", () => {
  const r = play([...UNTIL_REASON, "Me duele la cabeza", "Sí", "Me falta el aire desde hace una hora"]);
  assert.equal(r.effect?.type, "refer");
  assert.equal((r.effect as { said: string }).said, "Me falta el aire desde hace una hora");
  const which = r.said.find((x) => /Qué siente/.test(x.body));
  assert.ok(which, "asks what they feel");
  assert.doesNotMatch(which!.body, /diagn|causa|podría ser|infarto/i);
  assert.deepEqual(r.state.data.motivo, "Me duele la cabeza", "the data travels with the referral");
});

test("pregnancy in the reason triggers its own question; yes refers with that context", () => {
  const r = play([...UNTIL_REASON, "Control de embarazo de 30 semanas", "No", "Sí"]);
  assert.ok(r.said.some((x) => /sangrado o un dolor fuerte en el embarazo/.test(x.body)));
  assert.equal(r.effect?.type, "refer");
  assert.match((r.effect as { said: string }).said, /Embarazo/);
});

test("a baby (age 0) gets the fever question; an adult never does", () => {
  const baby = play(["2", "Leo", "4", "8 meses", "3", "2", "Control del niño sano", "No"]);
  assert.ok(baby.said.some((x) => /bebé tiene fiebre y menos de 3 meses/.test(x.body)));
  const adult = play([...UNTIL_REASON, "Control", "No"]);
  assert.ok(!adult.said.some((x) => /bebé/.test(x.body)));
});

test("alarm words in the reason: asked once more, then the flow goes on", () => {
  const r = play([...UNTIL_REASON, "Tengo dolor de pecho a veces", "No", "No", "1"]);
  assert.equal(r.said.filter((x) => /algo que no puede esperar/.test(x.body)).length, 2);
  assert.equal(r.effect, undefined);
  assert.equal(r.state.step, "poco_aviso");
});

test("duplicated closing (S-0431): the bot's alarm closing never repeats the instruction derive_emergency delivers", () => {
  const r = play([...UNTIL_REASON, "Dolor", "Sí", "Dolor fuerte en el pecho"]);
  assert.equal(r.effect?.type, "refer");
  assert.ok(!r.said.some((x) => x.body.includes(DB_ALARM_DELIVERY_PREFIX)), "the transition itself posts nothing about emergency");
  const c = closingAlarm("S-0431");
  assert.ok(!c.body.includes(DB_ALARM_DELIVERY_PREFIX));
  assert.equal(c.body.match(/S-0431/g)?.length, 1);
});

test("closings say what comes next in 1–2 sentences and promise no time", () => {
  const reg = closingRegistered("S-0432", { especialidad: "Cardiología", canal: "llamada" });
  assert.match(reg.body, /S-0432/);
  assert.match(reg.body, /no es una cita/);
  assert.match(reg.body, /profesional la revisará/);
  assert.match(reg.body, /con una llamada/);
  assert.match(reg.body, /106/);
  assert.ok(reg.body.split(/(?<=\.)\s/).length <= 2, "two sentences at most");
  assert.doesNotMatch(reg.body, /\b(hoy|mañana|en \d+ (días|horas|minutos)|24 horas)\b/i, "no time promised");
  const alarm = closingAlarm("S-0431");
  assert.match(alarm.body, /una persona del equipo/);
  assert.match(alarm.body, /106/);
  assert.deepEqual(alarm.buttons, [PERSON_NOW_LABEL], "a button to talk to a person now");
});

test("talking to a person: a persistent quick action and the button both go through the PERSONA path", () => {
  assert.deepEqual(QUICK_ACTIONS.map((q) => q.send), [PERSON_LABEL]);
  for (const t of ["PERSONA", "persona", PERSON_LABEL, PERSON_NOW_LABEL, "3. Hablar con una persona"]) assert.equal(isPersonRequest(t), true, t);
  for (const t of ["Sí", "Quiero una cita", "personal de salud"]) assert.equal(isPersonRequest(t), false, t);
});
