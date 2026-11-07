// Figures shown in the final (7/11), each with its source, taken ONLY from the proposal v5.1 and the pitch script v7
// (insumos/). Nothing here is computed from live data: these are the published figures and their references as the
// proposal cites them. The emergency numbers of the stages view come from a fixed SIMULATION (simulatedEmergency),
// always labelled "Simulado": no public dataset has arrival, triage, care and exit times (proposal §1).

export type Source = { label: string; url: string };

/** Real data of the Hospital María Auxiliadora (open data, 2023), as the proposal and the script give them. */
export const HMA_SOURCE: Source = {
  label: "Hospital María Auxiliadora, datos abiertos (2024)",
  url: "https://www.datosabiertos.gob.pe/dataset/citas-medicas-en-el-hospital-de-apoyo-maria-auxiliadora-hma",
};
export const HMA = {
  noShowPct: "25.7 %", // 106,100 of 412,747 appointments (19 specialties with ≥ 95 % no-show excluded)
  lostPerDay: "347", // appointments lost per day of care
  medianWaitDays: "17", // median days to the appointment for those who got one (script v7, slide 3)
};

/** "Qué respalda esta propuesta": one line per figure, with the reference as the proposal cites it. */
export const EVIDENCE: { figure: string; text: string; source: Source }[] = [
  {
    figure: "1 de cada 4",
    text: "citas del Hospital María Auxiliadora en 2023 terminó en inasistencia: 106,100, unas 347 por día de atención.",
    source: HMA_SOURCE,
  },
  {
    figure: "3 de cada 4",
    text: "hospitales del MINSA supervisados en Lima tuvieron pacientes con más de 12 horas en observación de emergencia.",
    source: { label: "Contraloría, difundido por Caretas (2026)", url: "https://caretas.pe/?p=792616" },
  },
  {
    figure: "33,086",
    text: "reclamos por demora en la atención de emergencia y 36,895 por falta de información clínica comprensible (2022–2025).",
    source: {
      label: "SUSALUD (2026)",
      url: "https://intranet.mesadeconcertacion.org.pe/storage/documentos/2026-03-26/iprot-susalud-gestion-de-reclamos-y-denuncias-2019-2025.pdf",
    },
  },
  {
    figure: "21.0 % → 10.7 %",
    text: "bajó la inasistencia en un hospital pediátrico de Chile al llamar a las citas de mayor riesgo.",
    source: { label: "Dunstan et al. (2023)", url: "https://doi.org/10.1007/s10729-022-09626-z" },
  },
  {
    figure: "24.6 %",
    text: "de las citas en lista de espera aceptó un cupo adelantado en Mayo Clinic.",
    source: { label: "North et al. (2025)", url: "https://doi.org/10.1177/11786329251326461" },
  },
  {
    figure: "28.7 %",
    text: "más corta fue la consulta con una preconsulta por IA, sin cambiar la espera; esa preconsulta daba diagnósticos, la de AsistIA no.",
    source: { label: "Tao et al. (2026), ensayo PreA", url: "https://doi.org/10.1038/s41591-025-04176-7" },
  },
];
export const EVIDENCE_CLOSING = "Lo que AsistIA logre en cada institución se mide en el piloto.";

// ---------------------------------------------------------------- simulated emergency (stages view)

/** Deterministic PRNG (mulberry32) so the simulated board shows the same numbers on every screen. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * A SIMULATED morning of an emergency service: 60 arrivals, triage priority I–IV assigned by a professional
 * (NTS 042 proportions as an editable assumption: 3 %, 12 %, 45 %, 40 %), exponential waits whose means grow with
 * a lower priority. Only for showing HOW the board computes each stage; never a measurement.
 */
export function simulatedEmergency(seed = 7112026) {
  const r = rng(seed);
  const exp = (mean: number) => -Math.log(1 - r()) * mean;
  const toTriage: number[] = [];
  const toDoctor: number[] = [];
  let alerts = 0;
  let alertsOnTime = 0;
  for (let k = 0; k < 60; k++) {
    const u = r();
    const prio = u < 0.03 ? 1 : u < 0.15 ? 2 : u < 0.6 ? 3 : 4;
    toTriage.push(prio === 1 ? 0 : 4 + exp(10));
    const wait = prio === 1 ? 0 : prio === 2 ? exp(12) : prio === 3 ? 15 + exp(45) : 30 + exp(90);
    toDoctor.push(wait);
    const limit = prio === 2 ? 15 : prio === 3 ? 60 : 120; // re-evaluation interval (editable assumption)
    if (prio > 1 && wait > limit) {
      alerts++;
      if (r() < 0.8) alertsOnTime++;
    }
  }
  return {
    arrivalToTriageMin: Math.round(median(toTriage)),
    triageToDoctorMin: Math.round(median(toDoctor)),
    alertsOnTimePct: alerts ? Math.round((alertsOnTime / alerts) * 100) : 100,
  };
}
