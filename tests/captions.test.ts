// The call screen shows the END of what was said, whole: no cut word, no "…". Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { lastSentence, tailCaption, tailSentences } from "../src/lib/voice/captions.ts";

test("lastSentence keeps the last sentence with its punctuation", () => {
  assert.equal(lastSentence("Hola, le habla el asistente. ¿La cita es para usted?"), "¿La cita es para usted?");
  assert.equal(lastSentence("Sí, ahí estaré."), "Sí, ahí estaré.");
});

test("tailCaption returns a short sentence untouched", () => {
  assert.equal(tailCaption("Perfecto. Queda confirmada para el jueves 19 a las 9:00."), "Queda confirmada para el jueves 19 a las 9:00.");
});

test("tailCaption shows the end of a long sentence, from a clause or a whole word, never with an ellipsis", () => {
  const long =
    "Le confirmo que su cita de Cardiología del jueves 19 de octubre queda registrada a las 9:00 en el consultorio 4, y le pedimos que llegue veinte minutos antes con su documento";
  const out = tailCaption(long, 80);
  assert.ok(out.length <= 80, out);
  assert.ok(long.toLowerCase().endsWith(out.toLowerCase()), out);
  assert.ok(!out.includes("…"));
  assert.match(out, /^[A-ZÁÉÍÓÚÑ¿¡]/);
  // starts at a whole word: the character before it in the original is a space or a comma
  const at = long.toLowerCase().lastIndexOf(out.toLowerCase());
  assert.match(long[at - 1], /[\s,]/);
});

test("tailSentences keeps the sentences that give a question its context", () => {
  const t = "Hola, le habla el asistente automatizado. Le llamo para confirmar su cita del jueves 19 a las 9:00. ¿Podrá asistir?";
  assert.equal(tailSentences(t, 80), "Le llamo para confirmar su cita del jueves 19 a las 9:00. ¿Podrá asistir?");
  assert.equal(tailSentences(t, 500), t);
});
