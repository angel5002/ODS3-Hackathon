// Arrival window for the clinic (pitch v7, slide 7 and scene 2). NOT in proposal v5.1: it is presented as an
// ESTIMATE that the pilot validates, never as a promise. In the prototype the durations of today's consultations
// are SIMULATED (a fixed, deterministic list); in a clinic they would be the real start and end times it already
// records, recalculated each time a consultation ends (question N1 of the script).
// Pure: no imports, unit-tested with node --test.

/** Simulated durations (minutes) of the consultations before the patient's slot, cycled if more are needed. */
export const SIMULATED_DURATIONS = [18, 19, 17, 20, 21];

export type ArrivalWindow = { desde: string; hasta: string; atrasoMin: number; esEstimacion: true };

export type ArrivalInput = {
  /** scheduled time of the patient, "HH:MM" */
  appointment: string;
  /** when the doctor's session starts, "HH:MM" */
  sessionStart?: string;
  /** minutes planned per consultation */
  slotMin?: number;
  /** simulated (or recorded) durations of the consultations before the patient's */
  durations?: number[];
  /** width of the window in minutes: the patient arrives at most this early before the expected start */
  widthMin?: number;
};

export function toMin(hhmm: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function fmtMin(min: number) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Delay of the doctor's session when the patient's turn comes, and the window to arrive. The window ENDS at the
 * expected start and opens `widthMin` earlier: conservative, so the patient is not late if the doctor catches up.
 * Example (scene 2): start 9:00, 15-min slots, appointment 10:15, five consultations of 18+19+17+20+21 = 95 min
 * instead of 75 → 20 min late → expected 10:35 → "llegue entre 10:20 y 10:35".
 */
export function arrivalWindow(input: ArrivalInput): ArrivalWindow | null {
  const appt = toMin(input.appointment);
  const start = toMin(input.sessionStart ?? "09:00");
  const slot = input.slotMin ?? 15;
  const width = input.widthMin ?? 15;
  const durations = input.durations ?? SIMULATED_DURATIONS;
  if (!Number.isFinite(appt) || !Number.isFinite(start) || slot <= 0 || appt < start || durations.length === 0) return null;
  const before = Math.floor((appt - start) / slot);
  let used = 0;
  for (let i = 0; i < before; i++) used += durations[i % durations.length];
  const atraso = Math.max(0, used - before * slot);
  const expected = appt + atraso;
  return { desde: fmtMin(expected - width), hasta: fmtMin(expected), atrasoMin: atraso, esEstimacion: true };
}
