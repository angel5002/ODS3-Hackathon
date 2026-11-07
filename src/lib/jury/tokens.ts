// Tokens of the printed jury cards (track E). Pure helpers, unit-tested in tests/jury.test.ts.
//
// Format: "j-" + 6 characters from an alphabet without look-alikes (no 0/o, 1/l/i), e.g. "j-k7m2qa".
// The hyphen is what makes them unmistakable: older simulated-phone tokens also start with "j" ("j2895s6a",
// "julio") but never contain a hyphen. The voice track reserves its lines for tokens that start with "j-".
// The database enforces the same shape (check constraint on public.jury_cards.token).

export const JURY_PREFIX = "j-";
export const JURY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const JURY_BODY_LENGTH = 6;
const TEST_BODY = /^test-[a-z0-9]{4,12}$/;
const CARD_BODY = new RegExp(`^[${JURY_ALPHABET}]{${JURY_BODY_LENGTH}}$`);

/** A printed card token ("j-xxxxxx") or a temporary test card ("j-test-xxxx"). */
export function isJuryToken(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith(JURY_PREFIX)) return false;
  const body = value.slice(JURY_PREFIX.length);
  return CARD_BODY.test(body) || TEST_BODY.test(body);
}

/** One token from a source of random bytes (crypto.getRandomValues in production, a seeded one in tests). */
export function juryToken(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(JURY_BODY_LENGTH * 2);
  let body = "";
  // rejection sampling: 31 symbols, keep bytes below 248 (= 8 * 31) so every symbol is equally likely
  for (const b of bytes) {
    if (b >= 248) continue;
    body += JURY_ALPHABET[b % JURY_ALPHABET.length];
    if (body.length === JURY_BODY_LENGTH) break;
  }
  if (body.length < JURY_BODY_LENGTH) return juryToken(randomBytes);
  return JURY_PREFIX + body;
}

/** `count` new tokens, unique among themselves and against every token already in use (cards and phones). */
export function newJuryTokens(count: number, taken: Iterable<string>, randomBytes: (n: number) => Uint8Array, maxTries = 10_000): string[] {
  const used = new Set(taken);
  const out: string[] = [];
  let tries = 0;
  while (out.length < count) {
    if (++tries > maxTries) throw new Error("could not generate unique jury tokens");
    const t = juryToken(randomBytes);
    if (used.has(t)) continue;
    used.add(t);
    out.push(t);
  }
  return out;
}

/** Token for a temporary card of the automated test (removed at the end of the test). */
export function testJuryToken(randomBytes: (n: number) => Uint8Array): string {
  return `${JURY_PREFIX}test-${juryToken(randomBytes).slice(JURY_PREFIX.length)}`;
}
