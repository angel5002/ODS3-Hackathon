// /pedir-cita session recovery (E5). Pure helpers so they are unit-tested (tests/chat-recovery.test.ts).
//
// The 7/11 08:42 UTC incident: the page reloaded again and again and every load created a NEW chat session
// that was never used (9 sessions in 2.5 min), alternating between the menu and "La conversación se cerró".
// Rules now:
//   - a failed load first tries to recreate the session, at most MAX_RECOVERIES times per page;
//   - once expired, the page stops polling (no flapping) and waits for the person;
//   - no automatic or manual reload may run more than MAX_RELOADS times within RELOAD_WINDOW_MS.

export const MAX_RECOVERIES = 2;
export const MAX_RELOADS = 2;
export const RELOAD_WINDOW_MS = 60_000;
const KEY = "asistia.recargas";

export type KeyValueStore = { getItem(k: string): string | null; setItem(k: string, v: string): void };

/** Timestamps of the recent reloads still inside the window. */
export function recentReloads(raw: string | null, now: number): number[] {
  let list: unknown;
  try {
    list = raw ? JSON.parse(raw) : [];
  } catch {
    list = [];
  }
  return Array.isArray(list) ? list.filter((t): t is number => typeof t === "number" && now - t < RELOAD_WINDOW_MS && t <= now) : [];
}

/**
 * Records a reload and says whether it may happen. Returns false (and records nothing) when MAX_RELOADS already
 * happened in the last RELOAD_WINDOW_MS: the caller must then show a message instead of reloading.
 */
export function mayReload(store: KeyValueStore | null, now: number): boolean {
  if (!store) return true;
  let recent: number[] = [];
  try {
    recent = recentReloads(store.getItem(KEY), now);
  } catch {
    return true;
  }
  if (recent.length >= MAX_RELOADS) return false;
  try {
    store.setItem(KEY, JSON.stringify([...recent, now]));
  } catch {
    // storage blocked: allow this one reload (it cannot loop faster than a person clicks)
  }
  return true;
}

/** Whether a failed load should try to recreate the session before showing "expired". */
export function shouldRecover(recoveriesSoFar: number) {
  return recoveriesSoFar < MAX_RECOVERIES;
}
