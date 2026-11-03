import type { Channel, DemoState, Status } from "./types";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Prototipo";

export const DISCLAIMER =
  "Pacientes ficticios. Citas y modelo basados en datos abiertos reales del Hospital María Auxiliadora (2023).";

export const STATUS: Record<Status, { label: string; tone: string }> = {
  pendiente: { label: "Pendiente", tone: "neutral" },
  recordatorio_enviado: { label: "Recordatorio enviado", tone: "sent" },
  confirmada: { label: "Confirmada", tone: "ok" },
  liberada: { label: "Cupo liberado", tone: "free" },
  sin_respuesta: { label: "Sin respuesta", tone: "warn" },
  en_llamada: { label: "En llamada", tone: "call" },
  derivada_a_persona: { label: "Pide hablar con una persona", tone: "human" },
  reasignada: { label: "Reasignada", tone: "done" },
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
];

export const CHANNEL: Record<Channel, string> = {
  panel: "Panel",
  mensaje: "Mensaje",
  voz: "Llamada",
  sistema: "Sistema",
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
  return `${(x * 100).toFixed(digits).replace(".", ",")} %`;
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
