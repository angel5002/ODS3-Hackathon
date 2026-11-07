// Scenes of the final pitch (insumos/AsistIA_Guion_Pitch_v7.pdf §3-§4): exact AI lines, audio present, order,
// pace and estimated length. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { CONFIRM_MED_TEXT, ESCENA_1, ESCENA_2, chatSpanMs, estimateScene } from "../src/lib/demo/scenes.ts";
import { Q, alarmQuestion, closingLines, initialState, step } from "../src/lib/preconsulta/machine.ts";
import { arrivalWindow } from "../src/lib/preconsulta/arrival.ts";
import { PRESENTATION_ORDER } from "../src/lib/demo/contract.ts";

const ai = (lines: { who: string; text: string }[]) => lines.filter((l) => l.who === "ia").map((l) => l.text);

test("scene 1: the two AI lines are the exact script text with Hospital Mirasur, each with its audio", () => {
  assert.deepEqual(ai(ESCENA_1.lines), [
    "Buenos días, Tito. Le habla el asistente automatizado del Hospital Mirasur. Se liberó un cupo de oncología para mañana a las 9:00. ¿Desea tomarlo?",
    "Listo. Su cita quedó reservada para mañana a las 9:00.",
  ]);
  for (const l of ESCENA_1.lines.filter((x) => x.who === "ia")) {
    assert.ok(l.audio && existsSync(`public${l.audio}`), `${l.id} audio`);
    assert.ok(statSync(`public${l.audio}`).size > 20_000);
  }
  assert.deepEqual(ESCENA_1.lines.map((l) => l.id), ["n1", "t1", "n2", "s1", "ia1", "t2", "ia2", "n3"]);
});

test("scene 2: the four spoken AI lines are the script's and the machine asks exactly the same", () => {
  const spoken = ESCENA_2.lines.filter((l) => l.who === "ia" && l.audio).map((l) => l.text);
  assert.deepEqual(spoken, [
    "Hola, Tito. Antes de su cita, ¿qué molestia quiere consultar?",
    "¿Tomó algún medicamento? ¿Tiene alergias?",
    "¿Tiene fiebre, o la rodilla está muy hinchada o caliente?",
    "Gracias, Tito. Su médico lo recibirá con este resumen. Su consultorio va con 20 min de atraso: llegue entre 10:20 y 10:35.",
  ]);
  for (const l of ESCENA_2.lines.filter((x) => x.audio)) assert.ok(existsSync(`public${l.audio}`), `${l.id} audio`);
  // same words as the live pre-visit, so the playback and the real feature never diverge
  assert.equal(spoken[0], Q.motivo("Tito"));
  assert.equal(spoken[1], Q.medicamentos);
  assert.equal(spoken[2], alarmQuestion({ word: "rodilla", fem: true }));
  assert.equal(spoken[3], closingLines("Tito", "m", arrivalWindow({ appointment: "10:15" }))[0]);
  // the playback's Tito answers drive the real machine through the same questions
  let s = initialState("Tito", "m");
  const asked: string[] = [];
  for (const l of ESCENA_2.lines.filter((x) => x.who === "persona")) {
    const r = step(s, l.text, { window: arrivalWindow({ appointment: "10:15" }) });
    s = r.state;
    asked.push(r.replies[0]);
  }
  assert.deepEqual(asked, [spoken[1], CONFIRM_MED_TEXT, spoken[2], spoken[3]]);
});

test("scene 2: the chat advances every 2.4 s (1.2 s for a tap) and, without voice, ends before 26 s", () => {
  for (const l of ESCENA_2.lines.slice(2).filter((x) => x.cue?.chat)) assert.ok(l.afterMs === 2400 || (l.cue?.tap && l.afterMs === 1200), l.id);
  assert.ok(chatSpanMs(ESCENA_2, false) <= 26_000, `chat span ${chatSpanMs(ESCENA_2, false)} ms`);
});

test("estimated length of each scene is close to the script's ~35 s", () => {
  const e1 = estimateScene(ESCENA_1);
  const e2 = estimateScene(ESCENA_2, false);
  const e2v = estimateScene(ESCENA_2, true);
  console.log(`escena 1 ≈ ${(e1 / 1000).toFixed(1)} s · escena 2 ≈ ${(e2 / 1000).toFixed(1)} s (con voz ${(e2v / 1000).toFixed(1)} s)`);
  assert.ok(e1 > 25_000 && e1 < 50_000, `scene 1: ${e1} ms`);
  assert.ok(e2 > 25_000 && e2 < 45_000, `scene 2: ${e2} ms`);
});

test("both scenes are moments of the presentation", () => {
  assert.ok(PRESENTATION_ORDER.includes("escena1") && PRESENTATION_ORDER.includes("escena2"));
});
