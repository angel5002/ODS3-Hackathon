export type Status =
  | "pendiente"
  | "recordatorio_enviado"
  | "confirmada"
  | "liberada"
  | "sin_respuesta"
  | "en_llamada"
  | "derivada_a_persona"
  | "reasignada";

export type Channel = "panel" | "mensaje" | "voz" | "sistema";
export type Reply = "confirma" | "libera" | "persona" | "otra_fecha";

export type Factor = { key: string; effect: "sube" | "baja"; text: string };

export type Patient = {
  id: string;
  full_name: string;
  first_name: string;
  short_name: string;
  sex: "F" | "M";
  age: number;
  phone: string;
  caregiver_name: string | null;
  caregiver_relation: string | null;
  token: string;
  demo_role: string | null;
  demo_label: string | null;
  demo_order: number | null;
};

export type Appointment = {
  id: number;
  patient_id: string;
  specialty: string;
  date: string;
  time: string;
  remote: boolean;
  insured: boolean;
  wait_days: number | null;
  prev_n: number | null;
  prev_no_shows: number | null;
  risk: number | null;
  risk_rank: number | null;
  factors: Factor[];
  status: Status;
  status_channel: Channel | null;
  status_at: string | null;
  reminder_at_min: number | null;
  origin: "agenda" | "lista_espera";
  replaces_id: number | null;
  reassigned_to_id: number | null;
  is_base: boolean;
  updated_at: string;
};

export type AppointmentWithPatient = Appointment & { patient: Patient };

export type WaitlistEntry = {
  id: number;
  patient_id: string;
  specialty: string;
  wait_days: number;
  requested_on: string;
  status: "en_espera" | "ofertado" | "asignado";
};

export type Offer = {
  id: number;
  slot_id: number;
  waitlist_id: number;
  patient_id: string;
  status: "enviada" | "aceptada" | "rechazada" | "vencida" | "retirada";
  expires_min: number;
  created_at: string;
  decided_at: string | null;
  new_appointment_id: number | null;
};

export type Message = {
  id: number;
  patient_id: string;
  appointment_id: number | null;
  offer_id: number | null;
  direction: "saliente" | "entrante";
  kind: "recordatorio" | "oferta" | "info" | "respuesta";
  body: string;
  buttons: string[] | null;
  answered_with: string | null;
  demo_min: number | null;
  created_at: string;
};

export type Call = {
  id: number;
  appointment_id: number;
  patient_id: string;
  status: "sonando" | "en_curso" | "finalizada" | "no_contesta" | "rechazada";
  agent: string;
  result: string | null;
  transcript: { who: "agente" | "paciente"; text: string }[];
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
};

export type EventRow = {
  id: number;
  appointment_id: number | null;
  patient_id: string | null;
  kind: string;
  from_status: Status | null;
  to_status: Status | null;
  channel: Channel;
  actor: string;
  detail: string | null;
  demo_min: number | null;
  created_at: string;
};

export type DemoState = {
  id: number;
  day_label: string;
  clock_base_min: number;
  clock_started_at: string | null;
  speed: number;
  reminders_sent_min: number | null;
  reply_deadline_min: number;
  offer_deadline_min: number;
  call_list_pct: number;
  threshold_high: number;
  threshold_mid: number;
  simulate_others: boolean;
  revealed: boolean;
  version: number;
  updated_at: string;
};

/** appt/offer: specific rows changed · bulk: many rows changed (refetch what changed) · full: reload everything (reset, reconnect) */
export type Hint = { kind: "appt" | "offer" | "bulk" | "full"; appts: number[]; patients: string[] };

export const isBroad = (h: Hint) => h.kind === "bulk" || h.kind === "full";
