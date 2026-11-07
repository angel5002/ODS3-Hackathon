// Closing the call after "Hablar con una persona" (E5, voice quality). On a real phone the agent announced the
// transfer, waited for an answer, said goodbye and its end_call was then cancelled by its own echo: 14-17 s
// from the request to the end. The client now closes the voice session itself once transfer_to_human
// succeeded and the agent finished its short sentence. Pure, so it is unit-tested (tests/voice-captions.test.ts).

/** at least this long after the tool answered: the agent still has to start its sentence (LLM + TTS ≈ 1 s) */
export const TRANSFER_MIN_MS = 2500;
/** the agent has been quiet this long: its sentence is over */
export const TRANSFER_QUIET_MS = 1200;
/** never later than this after the tool answered, whatever the agent does */
export const TRANSFER_MAX_MS = 9000;

export function shouldCloseAfterTransfer(sinceToolMs: number, agentSpeaking: boolean, quietMs: number) {
  if (sinceToolMs >= TRANSFER_MAX_MS) return true;
  return sinceToolMs >= TRANSFER_MIN_MS && !agentSpeaking && quietMs >= TRANSFER_QUIET_MS;
}

/** A tool answer that means "a person takes it from here": the call can end. */
export function isTransferDone(r: { tool_name?: string; is_error?: boolean } | null | undefined) {
  return !!r && r.tool_name === "transfer_to_human" && r.is_error !== true;
}
