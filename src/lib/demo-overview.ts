// /demo control center: the compact read the projected screen needs (types only, shared by the route and the UI).
// Every number comes from the database (existing tables and RPCs); nothing here is a supposition.

export type OverviewEvent = { id: number; text: string; at_min: number | null } | null;

export type OverviewWaitRow = {
  id: number;
  code: string;
  short_name: string;
  specialty: string;
  /** category assigned by the regulator (null while it is still pending) */
  category: string | null;
  /** effective category used for the order */
  cat: string;
  pct: number;
  days: number;
  deadline: number;
  state: string;
};

export type OverviewSlot = {
  id: number;
  specialty: string;
  date: string;
  time: string;
  zone: string;
  origin: string;
  /** libre_con_candidatos · libre_sin_candidatos · oferta · por_validar · asignado */
  phase: "propuesta" | "sin_candidatos" | "oferta" | "por_validar" | "asignado";
  candidates: number;
  accepted: number;
  declined: number;
  closes_min: number | null;
  rule: "ventana_prioridad" | "primero_acepta" | null;
  who: string | null;
};

export type DemoOverview = {
  rule: "ventana_prioridad" | "primero_acepta";
  stages: {
    registro: { total: number; without_slot: number; last: OverviewEvent };
    regulacion: { pending: number; regulated: number; last: OverviewEvent };
    espera: { waiting: number; over_deadline: number; last: OverviewEvent };
    confirmacion: { day: number; confirmed: number; released: number; unanswered: number; calls: number; last: OverviewEvent };
    reasignacion: { freed: number; filled: number; offers: number; accepted: number; last: OverviewEvent };
    validacion: { confirmed: number; pending: number; domino: number; reverted: number; last: OverviewEvent };
  };
  waitlist: OverviewWaitRow[];
  slots: OverviewSlot[];
  slot_counts: { open: number; filled: number };
  /** id of the newest request registered during the demo (not seeded), to highlight it in the list */
  newest_request: string | null;
};
