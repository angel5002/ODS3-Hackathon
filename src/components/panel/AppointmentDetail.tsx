"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ExternalLink, PhoneCall, Smartphone, X } from "lucide-react";
import { Button, RiskTag, StatusBadge } from "@/components/ui";
import { post } from "@/lib/post";
import { useHints, useNow, useSingleFlight } from "@/lib/realtime";
import { getJson } from "@/lib/post";
import { CHANNEL, STATUS, days, demoNowMin, fmtMin, riskLevel, years } from "@/lib/labels";
import { isBroad, type Appointment, type Call, type DemoState, type EventRow, type Message, type Offer, type Patient, type Status, type WaitlistEntry } from "@/lib/types";
import type { Row } from "./usePanelData";

type Candidate = WaitlistEntry & { patient: Pick<Patient, "full_name" | "short_name" | "age" | "token" | "demo_role"> };
type Detail = {
  appt: Appointment;
  patient: Patient;
  events: EventRow[];
  messages: Message[];
  call: Call | null;
  offers: Offer[];
  candidates: Candidate[];
  newAppt: { id: number; patient: { full_name: string } } | null;
  slot?: { id: number; state: string } | null;
};

const MANUAL: Status[] = ["confirmada", "liberada", "sin_respuesta", "derivada_a_persona", "pendiente"];

export function AppointmentDetail({
  row,
  state,
  listSize,
  baseTotal,
  onClose,
  onOpen,
}: {
  row: Row;
  state: DemoState;
  listSize: number;
  baseTotal: number;
  onClose: () => void;
  onOpen: (id: number) => void;
}) {
  const [d, setD] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState<Status | "">("");
  const [loadError, setLoadError] = useState(false);
  const now = useNow(1000);
  const nowMin = demoNowMin(state, now);

  const fetchDetail = useCallback(async () => {
    const data = await getJson<{
      appt: Appointment;
      patient: Patient;
      events: EventRow[];
      messages: Message[];
      call: Call | null;
      slot: { id: number; state: string } | null;
      newAppt: Detail["newAppt"];
    }>(`/api/staff/data?view=detail&id=${row.id}`);
    setD({ ...data, offers: [], candidates: [] });
    // row.status in the deps: a status change reloads the detail
  }, [row.id, row.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // one request at a time; a failed load retries once after a moment
  const load = useSingleFlight(async () => {
    try {
      await fetchDetail();
    } catch {
      await new Promise((r) => setTimeout(r, 1200));
      await fetchDetail().catch(() => setLoadError(true));
    }
  });

  useEffect(() => {
     
    load();
  }, [load, row.status]);

  useHints((h) => {
    // status changes of this row already reload through row.status; bulk hints matter for open offers
    if ((isBroad(h) && row.status === "liberada") || h.appts.includes(row.id) || h.patients.includes(row.patient_id)) load();
  });

  async function act(body: Record<string, unknown>, success?: string) {
    setBusy(true);
    try {
      await post("/api/staff", body);
      if (success) toast.success(success);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const level = riskLevel(row.risk, state);
  const p = d?.patient;
  const a = d?.appt;
  const inList = row.is_base && row.risk_rank != null && row.risk_rank <= listSize;
  const canCall = !["liberada", "reasignada", "en_llamada"].includes(row.status);
  const openOffer = d?.offers.find((o) => o.status === "enviada");
  const offeredIds = new Set(d?.offers.map((o) => o.waitlist_id));
  const eligible = (d?.candidates ?? []).filter((c) => c.status !== "asignado" && !offeredIds.has(c.id));
  const nextCandidate = eligible[0];

  return (
    <div className="space-y-3 pb-6">
      <section className="relative overflow-hidden rounded-2xl bg-surface p-5 ring-1 ring-line">
        <div className="relative flex items-start gap-3">
          <span className={`grid size-12 shrink-0 place-items-center rounded-2xl font-display text-lg font-bold ${level ? AVATAR_TONE[level] : "bg-st-done-soft text-st-done"}`} aria-hidden>
            {row.patient.full_name.split(" ").slice(0, 2).map((w) => w[0]).join("")}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-xl font-bold leading-tight">{row.patient.full_name}</h2>
            <p className="text-sm text-muted">
              {years(row.patient.age)}
              {p?.caregiver_name ? ` · responde ${p.caregiver_name} (${p.caregiver_relation})` : ""}
            </p>
          </div>
          <Button variant="ghost" onClick={onClose} aria-label="Cerrar detalle" className="-mr-2 -mt-1 min-h-11 rounded-md px-2">
            <X className="size-5" />
          </Button>
        </div>
        <div className="relative mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={row.status} />
          {row.status_at && row.status_channel && <span className="text-xs text-muted">por {CHANNEL[row.status_channel].toLowerCase()}</span>}
          {row.uses_messaging === false && <span className="ml-auto text-xs text-muted">No usa mensajería: recibe llamada</span>}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Info k="Especialidad" v={row.specialty} />
          <Info k="Hora" v={`${row.time} · ${state.day_label}`} />
          <Info k="Modalidad" v={row.remote ? "Teleconsulta" : "Presencial"} />
          {a && <Info k="Seguro de salud" v={a.insured ? "Sí" : "No"} />}
          {a?.wait_days != null && <Info k="Pidió la cita" v={`hace ${days(a.wait_days)}`} />}
          {a?.prev_n != null && <Info k="Citas anteriores (2023)" v={`${a.prev_n}, faltó a ${a.prev_no_shows}`} />}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          {canCall && (
            <Button variant="primary" className="rounded-md px-4" disabled={busy} onClick={() => act({ action: "call", appointmentId: row.id }, "Llamada iniciada")}>
              <PhoneCall className="size-4" aria-hidden /> Llamar con el asistente
            </Button>
          )}
          <Link
            href={`/t/${row.patient.token}`}
            target="_blank"
            className="press inline-flex min-h-11 items-center gap-2 rounded-md border border-line-strong bg-surface px-4 text-sm font-semibold hover:bg-sunken"
          >
            <Smartphone className="size-4" aria-hidden /> Ver su teléfono <ExternalLink className="size-3.5 text-muted" aria-hidden />
          </Link>
        </div>
      </section>

      {row.origin === "agenda" && (
        <section className="rounded-2xl bg-surface p-5 ring-1 ring-line">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Riesgo de inasistencia</h3>
            <RiskTag level={level} risk={row.risk} />
          </div>
          <p className="mt-1 text-sm text-muted">
            Puesto {row.risk_rank} de {baseTotal} por riesgo.{" "}
            {inList ? "Está en la lista de llamadas: si no responde el mensaje, se le llama." : "No está en la lista de llamadas."}
          </p>
          <p className="mt-3 text-sm font-medium">Lo que más pesa en esta estimación</p>
          <ul className="mt-1.5 space-y-1.5">
            {(a?.factors ?? []).map((f) => (
              <li key={f.key} className="flex gap-2 text-sm">
                {f.effect === "sube" ? (
                  <ArrowUp className="mt-0.5 size-4 shrink-0 text-risk-alto" aria-label="Sube el riesgo" />
                ) : (
                  <ArrowDown className="mt-0.5 size-4 shrink-0 text-risk-bajo" aria-label="Baja el riesgo" />
                )}
                <span>{f.text}</span>
              </li>
            ))}
          </ul>
          {row.specialty === "Obstetricia" && (
            <p className="mt-3 rounded-lg bg-risk-medio-soft px-3 py-2 text-xs text-risk-medio">
              Obstetricia tiene una tasa de inasistencia inusual en los datos de 2023 (55 %), posiblemente por la forma de
              registro. Tome esta estimación con cautela.
            </p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Un riesgo alto significa más apoyo para llegar a la cita (recordatorio y llamada), nunca perderla.
          </p>
        </section>
      )}

      {(row.status === "liberada" || row.status === "reasignada") && (
        <section className="rounded-2xl bg-surface p-5 ring-2 ring-st-free/40">
          <h3 className="font-semibold">{row.status === "liberada" ? "Cupo libre: se reasigna por zonas" : "Cupo reasignado"}</h3>
          {row.status === "reasignada" && d?.newAppt ? (
            <p className="mt-1 text-sm">
              Cupo tomado por <strong>{d.newAppt.patient.full_name}</strong>.{" "}
              <button className="font-semibold text-brand underline" onClick={() => onOpen(d.newAppt!.id)}>
                Ver la nueva cita
              </button>
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">
              Está en la pestaña <strong>Por reasignar</strong>: el sistema propone candidatos de la lista de espera según la zona
              y una persona aprueba la oferta antes de enviarla.
            </p>
          )}
        </section>
      )}

      <section className="rounded-2xl bg-surface p-5 ring-1 ring-line">
        <h3 className="font-semibold">Cambiar el estado a mano</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <select
            value={manual}
            onChange={(e) => setManual(e.target.value as Status)}
            className="flex-1 rounded-lg border border-line-strong bg-surface px-2 py-2 text-sm"
            aria-label="Nuevo estado"
          >
            <option value="">Elegir estado…</option>
            {MANUAL.filter((s) => s !== row.status).map((s) => (
              <option key={s} value={s}>
                {STATUS[s].label}
              </option>
            ))}
          </select>
          <Button
            disabled={!manual || busy || row.status === "reasignada"}
            onClick={async () => {
              await act({ action: "status", appointmentId: row.id, to: manual }, "Estado actualizado");
              setManual("");
            }}
          >
            Guardar
          </Button>
        </div>
      </section>

      {d?.call && (
        <section className="rounded-2xl bg-surface p-5 ring-1 ring-line">
          <h3 className="font-semibold">Última llamada</h3>
          <p className="mt-1 text-sm text-muted">
            {CALL_LABEL[d.call.status]}
            {d.call.result ? ` · ${d.call.result}` : ""}
          </p>
          {d.call.transcript.length > 0 && (
            <ol className="mt-2 space-y-1 text-sm">
              {d.call.transcript.map((t, i) => (
                <li key={i}>
                  <span className="font-semibold">{t.who === "agente" ? "Asistente" : "Paciente"}:</span> {t.text}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      <section className="rounded-2xl bg-surface p-5 ring-1 ring-line">
        <h3 className="font-semibold">Conversación por mensaje</h3>
        {!d && <p className="mt-1 text-sm text-muted">{loadError ? "No se pudo cargar. Cierre y vuelva a abrir la cita." : "Cargando…"}</p>}
        {d && !d.messages.length && <p className="mt-1 text-sm text-muted">Todavía no hay mensajes.</p>}
        <ol className="mt-2 space-y-2">
          {d?.messages.map((m) => (
            <li key={m.id} className={`bubble-in flex ${m.direction === "entrante" ? "justify-end" : ""}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  m.direction === "entrante" ? "bg-brand text-white" : "bg-sunken text-ink"
                }`}
              >
                <p>{m.body}</p>
                {m.answered_with && m.direction === "saliente" && (
                  <p className="mt-1 text-xs font-semibold opacity-80">Respondió: {m.answered_with}</p>
                )}
                <p className="mt-0.5 text-right text-[11px] opacity-70">{fmtMin(m.demo_min)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl bg-surface p-5 ring-1 ring-line">
        <h3 className="font-semibold">Bitácora</h3>
        {d && !d.events.length && <p className="mt-1 text-sm text-muted">Sin movimientos todavía.</p>}
        <ol className="mt-2 space-y-2">
          {d?.events.map((e) => (
            <li key={e.id} className="bubble-in grid grid-cols-[48px_1fr] gap-2 text-sm">
              <span className="tabular-nums text-muted">{fmtMin(e.demo_min)}</span>
              <span>
                <span className="font-medium">{e.detail ?? (e.to_status ? STATUS[e.to_status].label : e.kind)}</span>
                <span className="block text-xs text-muted">
                  {CHANNEL[e.channel]} · {e.actor} · {new Date(e.created_at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} (hora real)
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

const AVATAR_TONE: Record<string, string> = {
  alto: "bg-risk-alto-soft text-risk-alto",
  medio: "bg-risk-medio-soft text-risk-medio",
  bajo: "bg-risk-bajo-soft text-risk-bajo",
};

const OFFER_LABEL: Record<Offer["status"], string> = {
  enviada: "oferta enviada",
  aceptada: "aceptó",
  rechazada: "no puede",
  vencida: "no respondió a tiempo",
  retirada: "oferta retirada",
};

const CALL_LABEL: Record<Call["status"], string> = {
  sonando: "Sonando",
  en_curso: "En curso",
  finalizada: "Terminada",
  no_contesta: "No contestó",
  rechazada: "Rechazada",
  fallo: "Falló la conexión",
};

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
