// /demo operation mode: one row per character in the call lists. Test calls (purpose "prueba") stay hidden unless the
// operator asks for them; a call that is ringing or in progress is always shown, so it can be ended from the panel.
import type { CallRow } from "./LiveSection";

export type CallGroup = { key: string; call: CallRow; count: number; tests: number };

const isActive = (c: CallRow) => c.status === "sonando" || c.status === "en_curso";

/** newest call of each character first (active calls first), with how many calls the character had */
export function groupCalls(calls: CallRow[], showTests: boolean): { groups: CallGroup[]; hiddenTests: number } {
  const visible = calls.filter((c) => showTests || c.purpose !== "prueba" || isActive(c));
  const hiddenTests = calls.length - visible.length;
  const byName = new Map<string, CallGroup>();
  // newest first so the first call seen of each character is the one shown
  for (const c of [...visible].sort((a, b) => b.id - a.id)) {
    const key = (c.name ?? "Participante").trim();
    const g = byName.get(key);
    if (!g) byName.set(key, { key, call: c, count: 1, tests: c.purpose === "prueba" ? 1 : 0 });
    else {
      g.count++;
      if (c.purpose === "prueba") g.tests++;
      // an active call of the character wins over a newer finished one
      if (isActive(c) && !isActive(g.call)) g.call = c;
    }
  }
  const groups = [...byName.values()].sort((a, b) => Number(isActive(b.call)) - Number(isActive(a.call)) || b.call.id - a.call.id);
  return { groups, hiddenTests };
}
