import type { Channel, DemoState, Status } from "./types";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "AsistIA";

export const DISCLAIMER =
  "Demostración. Pacientes ficticios. Citas y modelo basados en datos abiertos reales del Hospital María Auxiliadora (2023).";

export const STATUS: Record<Status, { label: string; tone: string }> = {
  pendiente: { label: "Pendiente", tone: "neutral" },
  recordatorio_enviado: { label: "Recordatorio enviado", tone: "sent" },
  confirmada: { label: "Confirmada", tone: "ok" },
  liberada: { label: "Cupo liberado", tone: "free" },
  sin_respuesta: { label: "Sin respuesta", tone: "warn" },
  en_llamada: { label: "En llamada", tone: "call" },
  derivada_a_persona: { label: "Pide hablar con una persona", tone: "human" },
  reasignada: { label: "Reasignada", tone: "done" },
  reprogramacion_pendiente: { label: "Reprogramación por validar", tone: "human" },
  validacion_pendiente: { label: "Por validar", tone: "human" },
};

export const STATUS_ORDER: Status[] = [
  "pendiente",
  "recordatorio_enviado",
  "sin_respuesta",
  "en_llamada",
  "derivada_a_persona",
  "confirmada",
  "liberada",
  "reasignada",
  "reprogramacion_pendiente",
];

export const CHANNEL: Record<Channel, string> = {
  panel: "Panel",
  mensaje: "Mensaje",
  voz: "Llamada",
  sistema: "Sistema",
  chat: "Chat",
};

export type RiskLevel = "alto" | "medio" | "bajo";
export const RISK_LABEL: Record<RiskLevel, string> = { alto: "Alto", medio: "Medio", bajo: "Bajo" };

export function riskLevel(risk: number | null, s: Pick<DemoState, "threshold_high" | "threshold_mid">): RiskLevel | null {
  if (risk == null) return null;
  if (risk >= s.threshold_high) return "alto";
  if (risk >= s.threshold_mid) return "medio";
  return "bajo";
}

export function pct(x: number, digits = 0) {
  return `${(x * 100).toFixed(digits)} %`;
}

export function num(x: number) {
  return x.toLocaleString("es-PE");
}

export function fmtMin(m: number | null | undefined) {
  if (m == null) return "";
  const h = Math.floor(m / 60) % 24;
  const mm = ((m % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Current demo minute ("today", the day before the appointments), from the shared clock. */
export function demoNowMin(s: DemoState | null, now = Date.now()) {
  if (!s) return 540;
  if (!s.clock_started_at) return s.clock_base_min;
  return s.clock_base_min + Math.floor(((now - Date.parse(s.clock_started_at)) / 1000) * (s.speed / 60));
}

export function addresseeName(p: { first_name: string; caregiver_name: string | null }) {
  return p.caregiver_name ? p.caregiver_name.split(" ")[0] : p.first_name;
}

export function years(n: number) {
  return n === 1 ? "1 año" : `${n} años`;
}

export function days(n: number) {
  return n === 1 ? "1 día" : `${n} días`;
}

// ---------------------------------------------------------------- v4: requests, slots, offers
export type RequestState =
  | "registrada"
  | "pendiente_regulacion"
  | "pendiente_informacion"
  | "priorizada_sin_cupo"
  | "con_oferta"
  | "en_espera_prioritaria"
  | "asignada_por_validar"
  | "con_cita"
  | "atendida"
  | "derivada_emergencia"
  | "cerrada_con_causal";

export const REQUEST_STATE: Record<RequestState, { label: string; tone: string }> = {
  registrada: { label: "Registrada", tone: "neutral" },
  pendiente_regulacion: { label: "Pendiente de regulación", tone: "sent" },
  pendiente_informacion: { label: "Pendiente de información", tone: "warn" },
  priorizada_sin_cupo: { label: "En lista, sin cupo", tone: "neutral" },
  con_oferta: { label: "Con oferta abierta", tone: "free" },
  en_espera_prioritaria: { label: "Primero para el próximo cupo", tone: "call" },
  asignada_por_validar: { label: "Asignada, por validar", tone: "human" },
  con_cita: { label: "Con cita", tone: "ok" },
  atendida: { label: "Atendida", tone: "done" },
  derivada_emergencia: { label: "Derivada a emergencia", tone: "warn" },
  cerrada_con_causal: { label: "Retirada con motivo", tone: "done" },
};

export const CATEGORY_TEXT: Record<string, string> = {
  P1: "P1 · hasta 30 días",
  P2: "P2 · hasta 90 días",
  P3: "P3 · hasta 180 días",
  P4: "P4 · hasta 360 días",
};

export const ZONE_TEXT: Record<string, string> = {
  cercana: "Zona cercana · P1–P2 y poco aviso",
  media: "Zona media · P2–P3",
  lejana: "Zona lejana · P3–P4",
};

export const WITHDRAW_REASONS: { id: string; label: string }[] = [
  { id: "atendido_en_otro_lugar", label: "Atendido en otro establecimiento" },
  { id: "ya_no_lo_necesita", label: "Ya no lo necesita" },
  { id: "duplicado", label: "Solicitud duplicada" },
  { id: "otro", label: "Otro (escribir el motivo)" },
];

export const TASK_TYPE: Record<string, string> = {
  pide_persona: "Pide hablar con una persona",
  derivacion_clinica: "Duda clínica derivada por el agente",
  validacion_fallida: "Validación sin éxito",
  p1_no_contactable: "Paciente P1 no contactable",
  alarma: "Signos de alarma",
};

/** The 8 specialties with most demand on the demo day plus the jury's test ones (chat and form). */
export const SPECIALTIES = [
  "Medicina Interna",
  "Cardiología",
  "Pediatría General",
  "Ginecología",
  "Traumatología",
  "Oftalmología",
  "Dermatología",
  "Gastroenterología",
  "Otorrinolaringología",
  "Neurología",
  "Endocrinología",
  "Urología",
  "Psiquiatría",
  "Psicología",
];

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export function dateEs(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[dt.getUTCDay()]} ${d} de ${MONTHS[m - 1]}`;
}
export function dateShort(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
/** Demo minutes count from Monday 16/10/2023 00:00. */
export function demoDayLabel(min: number) {
  const day = Math.floor(min / 1440);
  const base = new Date(Date.UTC(2023, 9, 16 + day));
  return `${WEEKDAYS[base.getUTCDay()]} ${base.getUTCDate()}/${base.getUTCMonth() + 1}`;
}
export function index2(x: number | string | null | undefined) {
  return x == null ? "—" : Number(x).toFixed(2);
}
