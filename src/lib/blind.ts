// Blind view of the regulator (v4 §2, RF-02). The database view already returns clinical fields only;
// this whitelist is a second barrier so no future column can leak through the API, Realtime or errors.
export const REGULATOR_FIELDS = [
  "request_id",
  "code",
  "specialty",
  "reason_text",
  "age",
  "pregnant",
  "referral",
  "first_attempt_at",
  "state",
  "category",
  "info_question",
  "hours_waiting",
] as const;

export const FORBIDDEN_KEYS = ["display_name", "name", "phone", "insurance", "district", "identifier", "origin_facility", "person_id", "patient_id", "token", "alias"];

export type RegulatorRow = Record<(typeof REGULATOR_FIELDS)[number], unknown>;

export function blind(rows: Record<string, unknown>[]): RegulatorRow[] {
  return rows.map((r) => {
    const out = {} as RegulatorRow;
    for (const k of REGULATOR_FIELDS) out[k] = r[k] ?? null;
    if (out.pregnant !== true) out.pregnant = null; // only shown when it applies
    return out;
  });
}
