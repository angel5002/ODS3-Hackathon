// Caption helpers for the call screens (E5 stoic, "Respira"). Pure functions, no React.
// Rule of the call screen: show only the END of what was said, never cut a word and never add "…".

/** Last sentence of a caption ("Hola, soy… ¿La cita es para usted?" -> "¿La cita es para usted?"). */
export function lastSentence(text: string) {
  const parts = text.trim().match(/[^.!?…]+[.!?…]*["»)\]]*\s*/g);
  if (!parts) return text.trim();
  for (let i = parts.length - 1; i >= 0; i--) {
    const s = parts[i].trim();
    if (/[\p{L}\p{N}]/u.test(s)) return s;
  }
  return text.trim();
}

/**
 * The tail of a caption that fits in `maxChars`: the last sentence; if that sentence is still too long, its end,
 * starting at a clause (after a comma, colon or semicolon) when one fits, otherwise at a word. Words are never
 * cut and no ellipsis is added: the screen shows what was said last, whole.
 */
export function tailCaption(text: string, maxChars = 110) {
  const s = lastSentence(text);
  return tailOf(s, maxChars);
}

/**
 * The last WHOLE sentences of a caption that fit in `maxChars` (the fixed script: a question needs the sentence
 * before it, e.g. "Le llamo para confirmar su cita del jueves 19 a las 9:00. ¿Podrá asistir?"). When even the last
 * sentence does not fit, its end, as in `tailCaption`.
 */
export function tailSentences(text: string, maxChars = 170) {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  const parts = t.match(/[^.!?…]+[.!?…]*["»)\]]*\s*/g) ?? [t];
  let out = "";
  for (let i = parts.length - 1; i >= 0; i--) {
    const next = parts[i].trim() + (out ? " " + out : "");
    if (next.length > maxChars) break;
    out = next;
  }
  return out || tailCaption(t, maxChars);
}

function tailOf(s: string, maxChars: number) {
  if (s.length <= maxChars) return s;
  // a clause start that leaves the tail within the budget (the earliest one, so the tail is as long as possible)
  const from = s.length - maxChars;
  const clause = /[,;:]\s+/g;
  let m: RegExpExecArray | null;
  while ((m = clause.exec(s))) {
    const start = m.index + m[0].length;
    if (start >= from) return capitalize(s.slice(start));
  }
  // otherwise the first whole word inside the budget
  const space = s.indexOf(" ", from);
  return capitalize(space === -1 ? s.slice(from) : s.slice(space + 1));
}

function capitalize(s: string) {
  const t = s.trim();
  return t.charAt(0).toLocaleUpperCase("es") + t.slice(1);
}
