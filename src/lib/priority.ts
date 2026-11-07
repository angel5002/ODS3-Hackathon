// Waiting-list priority, as pure functions (no I/O). The database computes the same thing:
//   v5.1 -> public.priority_v51() / public.v_requests_v51  (supabase/migrations/20261107020000_e5_v51_priority.sql)
//   v4   -> public.v_requests.idx                          (supabase/migrations/20261106020000_v4_functions.sql)
// Nothing here is imported by the app yet; it exists so the formula is unit-tested (tests/priority-v51.test.ts).

export type Category = "P1" | "P2" | "P3" | "P4";

/** Maximum deadlines in days (params deadline_p1..p4). */
export const DEADLINES: Record<Category, number> = { P1: 30, P2: 90, P3: 180, P4: 360 };

/** A request without a category is ordered as a provisional P3, as in the database. */
export function deadlineFor(category: Category | null | undefined): number {
  return DEADLINES[category ?? "P3"];
}

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;

/**
 * Proposal v5.1, section 3.5: the fraction of the deadline already consumed, R = min(days / deadline, 1).
 * Its only inputs are the days waited and the deadline: insurance, sex and past no-shows cannot enter.
 */
export function priorityV51(daysWaited: number, deadlineDays: number): number | null {
  if (!Number.isFinite(deadlineDays) || deadlineDays <= 0) return null;
  const days = Math.max(0, Number.isFinite(daysWaited) ? daysWaited : 0);
  return round4(Math.min(days / deadlineDays, 1));
}

/** v4 (superseded): 0.75·R + 0.15·N + 0.10·E. Kept to check that production still shows the old values. */
export function priorityV4(daysWaited: number, deadlineDays: number, firstVisit: boolean, preferential: boolean): number {
  const r = Math.min(Math.max(0, daysWaited) / deadlineDays, 1);
  return round4(0.75 * r + 0.15 * (firstVisit ? 1 : 0) + 0.1 * (preferential ? 1 : 0));
}

export type RankedRequest = { category: Category | null; daysWaited: number; firstAttemptAt: string; id: number };

/** v5.1 order: category first (P1 before P4), then the deadline fraction (higher first), then who waited longest. */
export function compareV51(a: RankedRequest, b: RankedRequest): number {
  const ca = a.category ?? "P3";
  const cb = b.category ?? "P3";
  if (ca !== cb) return ca < cb ? -1 : 1;
  const ia = priorityV51(a.daysWaited, deadlineFor(a.category)) ?? 0;
  const ib = priorityV51(b.daysWaited, deadlineFor(b.category)) ?? 0;
  if (ia !== ib) return ib - ia;
  if (a.firstAttemptAt !== b.firstAttemptAt) return a.firstAttemptAt < b.firstAttemptAt ? -1 : 1;
  return a.id - b.id;
}
