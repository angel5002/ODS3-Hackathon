// Unit tests of the voice-quality fixes (E5): live caption trimming and reveal, the close after a transfer and
// the transport choice. Run: node --test tests/voice-captions.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPTION_TAIL_CHARS, REVEAL_CHARS_PER_S, captionTail, revealedPrefix, stripAudioTags } from "../src/lib/voice/captions.ts";
import { TRANSFER_MAX_MS, TRANSFER_MIN_MS, TRANSFER_QUIET_MS, isTransferDone, shouldCloseAfterTransfer } from "../src/lib/voice/transfer.ts";
import { pickTransport } from "../src/lib/voice/transport.ts";
import { isCardToken, noisyRoomOn, reservedForCards, voiceLimit } from "../src/lib/voice/capacity.ts";

test("jury cards: the last lines are reserved for card tokens (j-…), never all of them", () => {
  assert.equal(isCardToken("j-carmen-7f3a"), true);
  assert.equal(isCardToken("valeria"), false);
  assert.equal(isCardToken(null), false);
  assert.equal(isCardToken("j-a1b2c3"), true, "printed card: j- + 6 characters");
  assert.equal(isCardToken("j-test-luis"), true, "test card");
  assert.equal(isCardToken("julio"), false, "old phone token starting with j");
  assert.equal(isCardToken("j2895s6a"), false, "old token without the hyphen");
  assert.equal(isCardToken("J-A1B2C3"), false, "exactly lowercase j-");
  assert.equal(isCardToken(" j-a1b2c3"), false);
  assert.equal(reservedForCards(undefined, 8), 3, "default 3");
  assert.equal(reservedForCards("5", 8), 5);
  assert.equal(reservedForCards("20", 8), 7, "at least one line stays open for everyone");
  assert.equal(reservedForCards("-1", 8), 3);
  assert.equal(voiceLimit(true, 8, 3), 8, "a card may use every line");
  assert.equal(voiceLimit(false, 8, 3), 5, "anyone else, all but the reserved ones");
  assert.equal(voiceLimit(false, 1, 3), 1);
});

test("noisy room: ON unless the setting says off (final day default)", () => {
  assert.equal(noisyRoomOn(null), true);
  assert.equal(noisyRoomOn("on"), true);
  assert.equal(noisyRoomOn("off"), false);
});

const LONG =
  "Hola, le llama el asistente automatizado del Hospital Mirasur para confirmar una cita. Si no puede asistir, su cupo se ofrecerá a otro paciente y usted conserva su lugar en la lista. ¿Hablo con Valeria o con su cuidador?";

test("caption tail: a long answer shows its END (the latest words), never the beginning cut with …", () => {
  const t = captionTail(LONG);
  assert.ok(t.endsWith("¿Hablo con Valeria o con su cuidador?"));
  assert.ok(t.startsWith("…"));
  assert.ok(!t.startsWith("…Hola"));
  assert.ok(t.length <= CAPTION_TAIL_CHARS + 1);
});

test("caption tail: starts at a whole word and keeps short captions intact", () => {
  const t = captionTail(LONG, 40);
  const firstWord = t.slice(1).split(" ")[0];
  assert.ok(LONG.includes(` ${firstWord} `) || LONG.startsWith(firstWord), `"${firstWord}" is a whole word`);
  assert.equal(captionTail("Te escucho."), "Te escucho.");
  assert.equal(captionTail("  Sí, soy yo.  "), "Sí, soy yo.");
});

test("reveal: follows the pace of the voice and never cuts a word", () => {
  assert.equal(revealedPrefix(LONG, 0), "");
  const oneSecond = revealedPrefix(LONG, 1000);
  assert.ok(oneSecond.length <= REVEAL_CHARS_PER_S);
  assert.ok(LONG.startsWith(oneSecond));
  assert.ok(LONG[oneSecond.length] === " ", "cut at the end of a word");
  const later = revealedPrefix(LONG, 5000);
  assert.ok(later.length > oneSecond.length);
  assert.equal(revealedPrefix(LONG, 60_000), LONG);
});

test("reveal + tail: while the agent speaks the line shows the words just said", () => {
  const spoken = revealedPrefix(LONG, 9000);
  const line = captionTail(spoken);
  assert.ok(line.endsWith(spoken.split(" ").slice(-1)[0]));
});

test("audio tags of the expressive voice are not shown", () => {
  assert.equal(stripAudioTags("[Entendido]. Para darle los detalles de la cita"), "Para darle los detalles de la cita");
  assert.equal(stripAudioTags("[Claro]. ¿En qué puedo ayudarle?"), "¿En qué puedo ayudarle?");
  assert.equal(stripAudioTags("Sin etiquetas."), "Sin etiquetas.");
});

test("transfer: closes once the agent's sentence is over, never before it can start, never later than the cap", () => {
  assert.equal(shouldCloseAfterTransfer(500, false, 500), false, "the agent has not started its sentence yet");
  assert.equal(shouldCloseAfterTransfer(TRANSFER_MIN_MS + 1000, true, 0), false, "still speaking");
  assert.equal(shouldCloseAfterTransfer(TRANSFER_MIN_MS + 1000, false, TRANSFER_QUIET_MS - 100), false, "a pause inside the sentence");
  assert.equal(shouldCloseAfterTransfer(TRANSFER_MIN_MS + 1000, false, TRANSFER_QUIET_MS), true);
  assert.equal(shouldCloseAfterTransfer(TRANSFER_MAX_MS, true, 0), true, "hard cap");
  assert.ok(TRANSFER_MAX_MS <= 10_000, "the call never waits more than 10 s after the transfer");
});

test("transfer: only a successful transfer_to_human closes the call", () => {
  assert.equal(isTransferDone({ tool_name: "transfer_to_human", is_error: false }), true);
  assert.equal(isTransferDone({ tool_name: "transfer_to_human", is_error: true }), false);
  assert.equal(isTransferDone({ tool_name: "get_appointment", is_error: false }), false);
  assert.equal(isTransferDone(null), false);
});

test("transport: WebRTC by default, WebSocket as plan B (server variable or ?transporte=websocket)", () => {
  assert.equal(pickTransport(undefined, undefined), "webrtc");
  assert.equal(pickTransport("websocket", undefined), "websocket");
  assert.equal(pickTransport(undefined, "websocket"), "websocket");
  assert.equal(pickTransport("websocket", "webrtc"), "webrtc");
  assert.equal(pickTransport(undefined, "cualquier cosa"), "webrtc");
});
