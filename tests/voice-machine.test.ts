// Unit tests of the client voice state machine (E5, hito 2). Run: node --test tests/voice-machine.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { initialVoiceState, isBusy, voiceReducer, voiceStateText, type VoiceEvent, type VoiceState } from "../src/lib/voice/machine.ts";

const run = (events: VoiceEvent[], from: VoiceState = initialVoiceState) => events.reduce(voiceReducer, from);

test("happy path: idle → solicitando → conectando → activa → finalizando → finalizada", () => {
  let s = run([{ type: "START" }]);
  assert.equal(s.name, "solicitando");
  s = voiceReducer(s, { type: "SESSION_GRANTED", sessionId: "a" });
  assert.deepEqual(s, { name: "conectando", sessionId: "a" });
  s = voiceReducer(s, { type: "SDK_CONNECTED", sessionId: "a", at: 1 });
  assert.equal(s.name, "activa");
  s = voiceReducer(s, { type: "HANGUP" });
  assert.deepEqual(s, { name: "finalizando", sessionId: "a" });
  s = voiceReducer(s, { type: "SDK_DISCONNECTED", sessionId: "a", reason: "La persona colgó" });
  assert.deepEqual(s, { name: "finalizada", reason: "La persona colgó" });
});

test("start is idempotent: a double tap or a second START never opens a second request", () => {
  const once = run([{ type: "START" }]);
  assert.equal(voiceReducer(once, { type: "START" }), once);
  const connecting = run([{ type: "START" }, { type: "SESSION_GRANTED", sessionId: "a" }]);
  assert.equal(voiceReducer(connecting, { type: "START" }), connecting);
  const live = voiceReducer(connecting, { type: "SDK_CONNECTED", sessionId: "a", at: 1 });
  assert.equal(voiceReducer(live, { type: "START" }), live);
  assert.ok(isBusy(once) && isBusy(connecting) && isBusy(live));
});

test("a second grant while connecting is ignored (only the first session counts)", () => {
  const s = run([{ type: "START" }, { type: "SESSION_GRANTED", sessionId: "a" }, { type: "SESSION_GRANTED", sessionId: "b" }]);
  assert.deepEqual(s, { name: "conectando", sessionId: "a" });
});

test("late SDK callbacks from an older session do not touch the current one", () => {
  const live = run([{ type: "START" }, { type: "SESSION_GRANTED", sessionId: "new" }, { type: "SDK_CONNECTED", sessionId: "new", at: 5 }]);
  assert.equal(voiceReducer(live, { type: "SDK_DISCONNECTED", sessionId: "old", reason: "x" }), live);
  assert.equal(voiceReducer(live, { type: "SDK_ERROR", sessionId: "old", message: "x" }), live);
  assert.equal(voiceReducer(live, { type: "SDK_CONNECTED", sessionId: "old", at: 9 }), live);
});

test("busy: another device has the call, or capacity is full with a queue position", () => {
  const other = run([{ type: "START" }, { type: "SESSION_BUSY", kind: "otro_dispositivo" }]);
  assert.equal(other.name, "ocupado");
  assert.match(voiceStateText(other), /otro dispositivo/);
  const full = run([{ type: "START" }, { type: "SESSION_BUSY", kind: "capacidad", position: 2, queueId: "q" }]);
  assert.deepEqual(full, { name: "ocupado", kind: "capacidad", position: 2, queueId: "q" });
  assert.equal(voiceStateText(full), "Todas las líneas están ocupadas. Su lugar en la fila: 2");
  // waiting retries: START from ocupado requests again; then it can be granted
  const retried = voiceReducer(full, { type: "START" });
  assert.equal(retried.name, "solicitando");
  assert.equal(voiceReducer(retried, { type: "SESSION_GRANTED", sessionId: "z" }).name, "conectando");
});

test("errors: request failure and SDK failure end in error; a retry starts again", () => {
  const failed = run([{ type: "START" }, { type: "SESSION_FAILED", message: "ElevenLabs 500" }]);
  assert.deepEqual(failed, { name: "error", message: "ElevenLabs 500" });
  const sdk = run([{ type: "START" }, { type: "SESSION_GRANTED", sessionId: "a" }, { type: "SDK_ERROR", sessionId: "a", message: "mic" }]);
  assert.equal(sdk.name, "error");
  assert.equal(voiceReducer(sdk, { type: "START" }).name, "solicitando");
});

test("the call can end from elsewhere (other device, staff, agent) in any live state", () => {
  for (const s of [
    run([{ type: "START" }]),
    run([{ type: "START" }, { type: "SESSION_GRANTED", sessionId: "a" }]),
    run([{ type: "START" }, { type: "SESSION_GRANTED", sessionId: "a" }, { type: "SDK_CONNECTED", sessionId: "a", at: 1 }]),
  ]) {
    assert.deepEqual(voiceReducer(s, { type: "REMOTE_END", reason: "La llamada terminó" }), { name: "finalizada", reason: "La llamada terminó" });
  }
  assert.equal(voiceReducer(initialVoiceState, { type: "REMOTE_END", reason: "x" }), initialVoiceState);
});

test("hanging up while waiting or requesting ends without a session", () => {
  assert.equal(run([{ type: "START" }, { type: "HANGUP" }]).name, "finalizada");
  assert.equal(run([{ type: "START" }, { type: "SESSION_BUSY", kind: "capacidad" }, { type: "HANGUP" }]).name, "finalizada");
});

test("state texts", () => {
  assert.equal(voiceStateText({ name: "activa", sessionId: "a", since: 0 }, true), "El asistente está hablando");
  assert.equal(voiceStateText({ name: "activa", sessionId: "a", since: 0 }, false), "Te escucho");
  assert.equal(voiceStateText({ name: "conectando", sessionId: "a" }), "Conectando…");
  assert.equal(voiceStateText({ name: "finalizada", reason: "x" }), "Llamada finalizada");
});
