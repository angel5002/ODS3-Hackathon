// Waiting-list priority and assignment rule, as pure functions (no I/O). The database does the same:
//   v5.1 -> priority_v51(), category_rank_v51(), priority_sort_key_v51(), v_requests_v51, close_offer_v51()
//           (supabase/migrations/20261107020000_e5_v51_priority.sql)
//   v4   -> public.v_requests.idx (supabase/migrations/20261106020000_v4_functions.sql), kept for main
// Unit tests: tests/priority-v51.test.ts. scripts/dev/priority-v51.mjs checks the database against these.

export type Category = "P1" | "P2" | "P3" | "P4";
export type AssignmentRule = "ventana_prioridad" | "primero_acepta";

/** Maximum deadlines in days (params deadline_p1..p4). */
export const DEADLINES: Record<Category, number> = { P1: 30, P2: 90, P3: 180, P4: 360 };

/** A request without a category is ordered as a provisional P3, as in the database. */
export function deadlineFor(category: Category | null | undefined): number {
  return DEADLINES[category ?? "P3"];
}

/** 1 for P1 ... 4 for P4 (no category = provisional P3). */
export function categoryRank(category: Category | null | undefined): number {
  return Number((category ?? "P3").slice(1));
}

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;

/**
 * Proposal v5.1, section 3.5: the value shown is the fraction of the deadline already consumed,
 * R = min(days / deadline, 1). Its only inputs are the days waited and the deadline: insurance, sex and
 * past no-shows cannot enter.
 */
export function priorityV51(daysWaited: number, deadlineDays: number): number | null {
  if (!Number.isFinite(deadlineDays) || deadlineDays <= 0) return null;
  const days = Math.max(0, Number.isFinite(daysWaited) ? daysWaited : 0);
  return round4(Math.min(days / deadlineDays, 1));
}

/**
 * Sort key, descending, that encodes the category first: P1 = 40, P2 = 30, P3 = 20, P4 = 10, plus R in [0, 1].
 * As R <= 1 < 10, a P3 at 100 % (21) stays below a P2 at 0 % (30). Same as public.priority_sort_key_v51().
 */
export function sortKeyV51(category: Category | null | undefined, daysWaited: number): number {
  return round4((5 - categoryRank(category)) * 10 + (priorityV51(daysWaited, deadlineFor(category)) ?? 0));
}

/** v4 (superseded): 0.75·R + 0.15·N + 0.10·E. Kept to check that production still shows the old values. */
export function priorityV4(daysWaited: number, deadlineDays: number, firstVisit: boolean, preferential: boolean): number {
  const r = Math.min(Math.max(0, daysWaited) / deadlineDays, 1);
  return round4(0.75 * r + 0.15 * (firstVisit ? 1 : 0) + 0.1 * (preferential ? 1 : 0));
}

export type RankedRequest = { category: Category | null; daysWaited: number; firstAttemptAt: string; id: number };

/** v5.1 order (lexicographic): category (P1 first), then deadline fraction (higher first), then who waited longest. */
export function compareV51(a: RankedRequest, b: RankedRequest): number {
  const ra = categoryRank(a.category);
  const rb = categoryRank(b.category);
  if (ra !== rb) return ra - rb;
  const ia = priorityV51(a.daysWaited, deadlineFor(a.category)) ?? 0;
  const ib = priorityV51(b.daysWaited, deadlineFor(b.category)) ?? 0;
  if (ia !== ib) return ib - ia;
  if (a.firstAttemptAt !== b.firstAttemptAt) return a.firstAttemptAt < b.firstAttemptAt ? -1 : 1;
  return a.id - b.id;
}

export type Acceptor = RankedRequest & { acceptedAt: string };

/**
 * Who gets the slot among those who accepted (close_offer_v51):
 * 'ventana_prioridad' -> the highest priority (compareV51); 'primero_acepta' -> the first to accept.
 */
export function pickAcceptor(rule: AssignmentRule, acceptors: Acceptor[]): Acceptor | null {
  if (!acceptors.length) return null;
  const sorted = [...acceptors].sort(
    rule === "primero_acepta" ? (a, b) => (a.acceptedAt === b.acceptedAt ? a.id - b.id : a.acceptedAt < b.acceptedAt ? -1 : 1) : compareV51,
  );
  return sorted[0];
}

/** params.value is numeric: 0 = 'primero_acepta', anything else (or missing) = 'ventana_prioridad'. */
export function ruleFromParam(value: number | null | undefined): AssignmentRule {
  return value === 0 ? "primero_acepta" : "ventana_prioridad";
}
