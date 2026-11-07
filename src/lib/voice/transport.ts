// Transport of a voice session (E5, voice quality). Pure, so it is unit-tested (tests/voice-captions.test.ts).
export type VoiceTransport = "webrtc" | "websocket";

/** WebRTC (the browser's echo cancellation, noise suppression and jitter buffer on the agent's audio) unless
 *  VOICE_TRANSPORT=websocket or the client asks for it (?transporte=websocket, plan B on a network that blocks
 *  WebRTC). */
export function pickTransport(envValue: string | undefined, requested: unknown): VoiceTransport {
  if (requested === "websocket" || requested === "webrtc") return requested;
  return envValue === "websocket" ? "websocket" : "webrtc";
}
