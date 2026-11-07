// /demo control center (read only): one compact answer built from the RPCs and tables the panel and the board
// already read. No writes, no new database objects. Admisión only (the parent route sits behind the PIN proxy).
import { rpc, serverDb } from "@/lib/supabase/server";
import type { DemoOverview, OverviewEvent, OverviewSlot, OverviewWaitRow } from "@/lib/demo-overview";

type ReqRow = {
  id: number;
  code: string;
  short_name: string;
  specialty: string;
  category: string | null;
  cat: string;
  days_waited: number;
  deadline: number;
  pct_deadline: number;
  state: string;
};
type SlotRow = {
  id: number;
  specialty: string;
  date: string;
  time: string;
  state: "libre" | "retenido" | "ocupado";
  origin: string;
  zone: string;
  proposal: { k: number } | null;
  offer: { state: string; k: number; closes_min: number; rule?: string; candidates: { response?: string | null }[] } | null;
  assignments: { state: string; reverted: boolean; short_name: string; rule?: string | null }[];
};

const REGULATION = new Set(["pendiente_regulacion", "pendiente_informacion"]);
const CLOSED = new Set(["cerrada_con_causal", "atendida", "derivada_emergencia"]);
// same set as board_v4 "registered_without_slot"
const WITHOUT_SLOT = new Set(["pendiente_regulacion", "pendiente_informacion", "priorizada_sin_cupo", "con_oferta", "en_espera_prioritaria", "asignada_por_validar"]);
const SOURCE: Record<string, string> = { ventanilla: "por ventanilla", chat: "por chat", voz: "por voz", formulario: "por formulario", semilla: "dato inicial" };
const STATUS_TEXT: Record<string, string> = {
  confirmada: "confirmó su cita",
  liberada: "avisó que no podrá asistir",
  sin_respuesta: "no respondió (la cita se mantiene)",
  en_llamada: "recibe la llamada del asistente",
  derivada_a_persona: "pidió hablar con una persona",
  reasignada: "cita reasignada",
  reprogramacion_pendiente: "pidió reprogramar",
  validacion_pendiente: "cita por validar",
  recordatorio_enviado: "recibió el recordatorio",
};
const CHANNEL: Record<string, string> = { mensaje: "por mensaje", voz: "por llamada", chat: "por chat", panel: "en el panel", sistema: "" };

function one<T>(rows: T[] | null | undefined): T | null {
  return rows?.[0] ?? null;
}

export async function demoOverview(): Promise<DemoOverview> {
  const db = serverDb();
  const base = () => db.from("appointments").select("id", { count: "exact", head: true }).eq("is_base", true);
  const [
    requests,
    slots,
    rule,
    day,
    confirmed,
    released,
    unanswered,
    calls,
    offers,
    accepted,
    assignments,
    lastReception,
    lastRegulation,
    lastStatus,
    lastOffer,
    lastValidation,
    newest,
  ] = await Promise.all([
    rpc<ReqRow[]>("staff_requests_v51"),
    rpc<SlotRow[]>("staff_slots_v51"),
    db.from("settings_v51").select("value").eq("key", "regla_asignacion").maybeSingle(),
    base(),
    base().eq("status", "confirmada"),
    base().in("status", ["liberada", "reasignada"]),
    base().in("status", ["sin_respuesta", "en_llamada"]),
    db.from("calls").select("id", { count: "exact", head: true }),
    db.from("slot_offers").select("id", { count: "exact", head: true }),
    db.from("offer_responses").select("id", { count: "exact", head: true }).eq("response", "acepta"),
    db.from("assignments").select("validation_state,reverted"),
    db.from("request_events").select("id,demo_min,payload,request:requests(code,specialty,source)").eq("type", "recepcion").order("id", { ascending: false }).limit(1),
    db.from("request_events").select("id,demo_min,payload,request:requests(code,specialty)").eq("type", "regulacion").order("id", { ascending: false }).limit(1),
    db
      .from("events")
      .select("id,demo_min,to_status,channel,patient:patients(short_name)")
      .eq("kind", "estado")
      .neq("actor", "Paciente (simulado)")
      .not("to_status", "is", null)
      .order("id", { ascending: false })
      .limit(1),
    db.from("events").select("id,demo_min,detail").in("kind", ["oferta", "asignacion"]).order("id", { ascending: false }).limit(1),
    db.from("events").select("id,demo_min,detail").in("kind", ["validacion", "domino", "reversion"]).order("id", { ascending: false }).limit(1),
    db.from("requests").select("code").eq("seeded", false).order("id", { ascending: false }).limit(1),
  ]);

  // ---- requests: registration, blind regulation, waiting list (v5.1 order comes from the RPC)
  const reqs = requests ?? [];
  const waiting = reqs.filter((r) => !REGULATION.has(r.state) && !CLOSED.has(r.state));
  const waitlist: OverviewWaitRow[] = waiting.map((r) => ({
    id: r.id,
    code: r.code,
    short_name: r.short_name,
    specialty: r.specialty,
    category: r.category,
    cat: r.cat,
    pct: r.pct_deadline,
    days: r.days_waited,
    deadline: r.deadline,
    state: r.state,
  }));

  type Rel<T> = T | T[] | null;
  const rel = <T,>(x: Rel<T>): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);

  const rec = one(lastReception.data as { id: number; demo_min: number | null; request: Rel<{ code: string; specialty: string; source: string }> }[] | null);
  const recReq = rec ? rel(rec.request) : null;
  const reg = one(lastRegulation.data as { id: number; demo_min: number | null; payload: { category?: string }; request: Rel<{ code: string; specialty: string }> }[] | null);
  const regReq = reg ? rel(reg.request) : null;
  const st = one(lastStatus.data as { id: number; demo_min: number | null; to_status: string; channel: string; patient: Rel<{ short_name: string }> }[] | null);
  const stName = st ? rel(st.patient)?.short_name : null;
  const ev = (x: { id: number; demo_min: number | null; detail: string | null }[] | null): OverviewEvent => {
    const e = one(x);
    return e?.detail ? { id: e.id, text: e.detail, at_min: e.demo_min } : null;
  };
  const top = waitlist[0];

  // ---- slots: what needs a decision first, then the recently filled ones
  const allSlots = slots ?? [];
  const compact: OverviewSlot[] = allSlots.map((s) => {
    const live = s.assignments.find((a) => !a.reverted) ?? null;
    const responses = s.offer?.candidates ?? [];
    let phase: OverviewSlot["phase"];
    if (s.state === "ocupado") phase = "asignado";
    else if (s.state === "retenido") phase = s.offer?.state === "enviada" ? "oferta" : live?.state === "pendiente" ? "por_validar" : "oferta";
    else phase = (s.proposal?.k ?? 0) > 0 ? "propuesta" : "sin_candidatos";
    const r = (phase === "asignado" || phase === "por_validar" ? live?.rule : s.offer?.rule) ?? null;
    return {
      id: s.id,
      specialty: s.specialty,
      date: s.date,
      time: s.time,
      zone: s.zone,
      origin: s.origin,
      phase,
      candidates: phase === "propuesta" ? (s.proposal?.k ?? 0) : (s.offer?.k ?? 0),
      accepted: responses.filter((c) => c.response === "acepta").length,
      declined: responses.filter((c) => c.response === "declina").length,
      closes_min: phase === "oferta" ? (s.offer?.closes_min ?? null) : null,
      rule: r === "primero_acepta" || r === "ventana_prioridad" ? r : null,
      who: phase === "asignado" || phase === "por_validar" ? (live?.short_name ?? null) : null,
    };
  });
  const ORDER: Record<OverviewSlot["phase"], number> = { oferta: 0, por_validar: 1, propuesta: 2, asignado: 3, sin_candidatos: 4 };
  const freedOrigins = new Set(["liberado", "domino"]);
  // filled slots: newest first (higher id = created later in the demo)
  const sorted = [...compact].sort((a, b) => ORDER[a.phase] - ORDER[b.phase] || (a.phase === "asignado" ? b.id - a.id : 0));

  const asg = assignments.data ?? [];
  return {
    rule: rule.data?.value === "primero_acepta" ? "primero_acepta" : "ventana_prioridad",
    stages: {
      registro: {
        total: reqs.length,
        without_slot: reqs.filter((r) => WITHOUT_SLOT.has(r.state)).length,
        last: rec && recReq ? { id: rec.id, text: `${recReq.code} · ${recReq.specialty} · ${SOURCE[recReq.source] ?? recReq.source}`, at_min: rec.demo_min } : null,
      },
      regulacion: {
        pending: reqs.filter((r) => REGULATION.has(r.state)).length,
        regulated: reqs.filter((r) => r.category && !CLOSED.has(r.state)).length,
        last: reg && regReq ? { id: reg.id, text: `${regReq.code} · ${regReq.specialty} → ${reg.payload?.category ?? "?"}`, at_min: reg.demo_min } : null,
      },
      espera: {
        waiting: waitlist.length,
        over_deadline: waiting.filter((r) => r.category && r.days_waited > r.deadline).length,
        last: top ? { id: top.id, text: `1.º ${top.short_name} · ${top.cat} · ${top.pct} % de su plazo`, at_min: null } : null,
      },
      confirmacion: {
        day: day.count ?? 0,
        confirmed: confirmed.count ?? 0,
        released: released.count ?? 0,
        unanswered: unanswered.count ?? 0,
        calls: calls.count ?? 0,
        last: st && stName ? { id: st.id, text: `${stName} ${STATUS_TEXT[st.to_status] ?? st.to_status} ${CHANNEL[st.channel] ?? ""}`.trim(), at_min: st.demo_min } : null,
      },
      reasignacion: {
        freed: compact.filter((s) => freedOrigins.has(s.origin)).length,
        filled: compact.filter((s) => freedOrigins.has(s.origin) && s.phase === "asignado").length,
        offers: offers.count ?? 0,
        accepted: accepted.count ?? 0,
        last: ev(lastOffer.data),
      },
      validacion: {
        confirmed: asg.filter((a) => !a.reverted && a.validation_state === "confirmada").length,
        pending: asg.filter((a) => !a.reverted && a.validation_state === "pendiente").length,
        domino: compact.filter((s) => s.origin === "domino").length,
        reverted: asg.filter((a) => a.reverted).length,
        last: ev(lastValidation.data),
      },
    },
    waitlist,
    slots: sorted.slice(0, 12),
    slot_counts: { open: compact.filter((s) => s.phase !== "asignado").length, filled: compact.filter((s) => s.phase === "asignado").length },
    newest_request: one(newest.data)?.code ?? null,
  };
}
