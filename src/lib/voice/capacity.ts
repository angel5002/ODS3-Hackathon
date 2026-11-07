// Voice lines for the final (pitch v7): the last N lines are reserved for the printed jury cards, and the
// noisy-room mode ("modo sala ruidosa": push-to-talk on the phones). Pure, so it is unit-tested
// (tests/voice-captions.test.ts); the database reads live in src/lib/voice/sessions.ts.

/** Tokens of the printed jury cards start with this (the jury track issues them). */
export const CARD_TOKEN_PREFIX = "j-";

export function isCardToken(token: string | null | undefined) {
  return !!token && token.startsWith(CARD_TOKEN_PREFIX);
}

/** Lines kept for the cards: VOICE_RESERVED_FOR_CARDS (default 3), never all of them. */
export function reservedForCards(envValue: string | undefined, max: number) {
  const n = envValue === undefined || envValue === "" ? 3 : Math.floor(Number(envValue));
  if (!Number.isFinite(n) || n < 0) return Math.min(3, Math.max(0, max - 1));
  return Math.min(n, Math.max(0, max - 1));
}

/** How many simultaneous voice sessions this call may join: all of them for a card, the rest otherwise. */
export function voiceLimit(isCard: boolean, max: number, reserved: number) {
  return isCard ? max : Math.max(1, max - reserved);
}

/** settings_v51 'sala_ruidosa' = 'on' | 'off'. ON by default (final day) when the key is missing. */
export function noisyRoomOn(value: string | null | undefined) {
  return value !== "off";
}
