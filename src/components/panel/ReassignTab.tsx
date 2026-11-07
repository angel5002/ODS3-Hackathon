"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Clock, Lock, MessageCircle, Send, ShieldCheck, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui";
import { post } from "@/lib/post";
import { useDemoState, useNow } from "@/lib/realtime";
import { ZONE_TEXT, dateEs, dateShort, demoNowMin, fmtMin, num } from "@/lib/labels";
import { useServerView } from "./useStaffView";
import { CAT_TONE } from "./WaitlistTab";
import { Pill } from "./badges";

type Candidate = {
  request_id: number;
  code: string;
  name: string;
  short_name: string;
  index: number;
  reason: string;
  category: string;
  a?: number;
  response?: "acepta" | "declina" | "sin_respuesta" | null;
  channel?: string | null;
  at?: string | null;
  simulated?: boolean;
  phone_token?: string | null;
  live_chat?: boolean;
  priority_wait?: boolean;
  current_date?: string | null;
};
type Slot = {
  id: number;
  specialty: string;
  date: string;
  time: string;
  state: "libre" | "retenido" | "ocupado";
  origin: string;
  protected: boolean;
  round: number;
  zone: string;
  days: number;
  source_name: string | null;
  proposal: { zone: string; k: number; fill_probability: number; available: number; candidates: Candidate[]; target: number } | null;
  offer: { id: number; state: string; k: number; fill_probability: number; closes_min: number; zone: string; approved_by: string; candidates: Candidate[]; rule?: "ventana_prioridad" | "primero_acepta" } | null;
  assignments: { id: number; state: string; reverted: boolean; short_name: string; code: string; had_appointment: boolean }[];
};
type Feed = { id: number; kind: string; detail: string; actor: string; demo_min: number | null };

const ORIGIN: Record<string, string> = {
  liberado: "Liberado por el paciente",
  domino: "Liberado por efecto dominó",
  agenda_libre: "Cupo libre de la agenda",
  cupo_del_dia: "Cupo del día",
};

export function ReassignTab() {
  const { data, error, reload } = useServerView<{ slots: Slot[]; feed: Feed[] }>("/api/staff/data?view=slots", ["full", "bulk", "slot", "req"]);
  const [busy, setBusy] = useState("");
  const [showFilled, setShowFilled] = useState(false);
  const slots = useMemo(() => data?.slots ?? [], [data]);
  const open = slots.filter((s) => s.state !== "ocupado");
  // what needs a decision first: open offers and pending validations, then slots with candidates
  const actionable = open
    .filter((s) => s.state === "retenido" || (s.proposal?.k ?? 0) > 0)
    .sort((a, b) => Number(b.state === "retenido") - Number(a.state === "retenido"));
  const waiting = open.filter((s) => s.state === "libre" && (s.proposal?.k ?? 0) === 0);
  const [showWaiting, setShowWaiting] = useState(false);
  const filled = slots.filter((s) => s.state === "ocupado");
  const free = open.filter((s) => s.state === "libre" && (s.proposal?.k ?? 0) > 0);

  async function act(key: string, body: Record<string, unknown>, success?: string) {
    setBusy(key);
    try {
      await post("/api/staff", body);
      reload(); // do not wait for the Realtime hint
      if (success) toast.success(success);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Por reasignar</h1>
          <p className="mt-1 max-w-[85ch] text-sm text-muted">
            Cada cupo libre se ofrece a la vez a varios pacientes de la zona que le corresponde. <strong>Sin su aprobación no sale
            ninguna oferta.</strong> Al cerrar la oferta, el cupo se asigna con la regla elegida en Demo: al de mayor prioridad entre
            quienes aceptaron (primero la categoría y luego la parte del plazo consumida) o al primero que aceptó.
          </p>
        </div>
        <Button
          disabled={!free.length || !!busy}
          onClick={() => {
            if (window.confirm(`¿Aprobar y enviar las ${free.length} ofertas propuestas? Se registra que usted las aprobó.`)) {
              act("all", { action: "approve_all" }, "Ofertas aprobadas y enviadas");
            }
          }}
        >
          <ShieldCheck className="size-4" aria-hidden /> Aprobar todas ({num(free.length)})
        </Button>
      </div>

      {data?.feed && data.feed.length > 0 && (
        <section className="rounded-2xl bg-night p-4 text-white" aria-label="Actividad reciente">
          <h2 className="text-sm font-semibold text-mint">Actividad reciente</h2>
          <ol className="mt-2 space-y-1.5 text-sm">
            {data.feed.slice(0, 6).map((e) => (
              <li key={e.id} className="bubble-in flex gap-3">
                <span className="w-12 shrink-0 tabular-nums text-white/50">{fmtMin(e.demo_min)}</span>
                <span className={e.kind === "asignacion" ? "font-semibold" : "text-white/85"}>{e.detail}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {error && <p className="text-risk-alto">{error}</p>}
      {!data && !error && <p className="text-muted">Cargando cupos…</p>}
      {data && !open.length && <p className="rounded-2xl bg-surface p-8 text-center text-muted ring-1 ring-line">No hay cupos libres por ahora.</p>}

      {waiting.length > 0 && (
        <section className="rounded-2xl bg-surface px-4 py-3 ring-1 ring-line">
          <button onClick={() => setShowWaiting(!showWaiting)} className="text-sm font-semibold text-brand hover:underline">
            {showWaiting ? "Ocultar" : "Ver"} {num(waiting.length)} cupos libres sin candidatos en su zona
          </button>
          <span className="ml-2 text-xs text-muted">Esperan a que se regule una solicitud que corresponda, o pasan a la zona siguiente.</span>
          {showWaiting && (
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {waiting.map((s) => (
                <li key={s.id} className="flex flex-wrap gap-x-2 border-t border-line py-1.5">
                  <strong>{s.specialty}</strong> {dateShort(s.date)} {s.time}
                  <span className="text-muted">· {ZONE_TEXT[s.zone] ?? s.zone}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <ul className="grid gap-4 xl:grid-cols-2">
        {actionable.map((s) => (
          <li key={s.id}>
            <SlotCard slot={s} busy={busy} act={act} />
          </li>
        ))}
      </ul>

      {filled.length > 0 && (
        <section>
          <button onClick={() => setShowFilled(!showFilled)} className="text-sm font-semibold text-brand underline-offset-2 hover:underline">
            {showFilled ? "Ocultar" : "Ver"} cupos llenados ({num(filled.length)})
          </button>
          {showFilled && (
            <ul className="mt-2 divide-y divide-line rounded-2xl bg-surface ring-1 ring-line">
              {filled.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                  <strong>
                    {s.specialty} · {dateShort(s.date)} {s.time}
                  </strong>
                  <span className="text-muted">{ORIGIN[s.origin]}</span>
                  <span className="ml-auto">→ {s.assignments.find((a) => a.state === "confirmada" && !a.reverted)?.short_name ?? "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function SlotCard({ slot: s, busy, act }: { slot: Slot; busy: string; act: (k: string, b: Record<string, unknown>, ok?: string) => Promise<void> }) {
  const state = useDemoState();
  const now = useNow(1000);
  const nowMin = demoNowMin(state, now);
  const offer = s.state === "retenido" && s.offer?.state === "enviada" ? s.offer : null;
  const pending = s.assignments.find((a) => a.state === "pendiente" && !a.reverted);
  const p = s.proposal;
  const zone = offer?.zone ?? p?.zone ?? s.zone;
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  const allOfZone = p && p.k === p.available;

  return (
    <article className={`h-full rounded-2xl bg-surface p-4 ring-1 ${offer ? "ring-2 ring-st-free/50" : "ring-line"}`}>
      <header className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold leading-tight">
            {s.specialty} · {dateEs(s.date)}, {s.time}
          </h2>
          <p className="text-xs text-muted">
            {ORIGIN[s.origin]}
            {s.source_name ? ` (${s.source_name})` : ""} · en {s.days} {s.days === 1 ? "día" : "días"}
            {s.round > 0 ? ` · ronda ${s.round + 1}` : ""}
          </p>
        </div>
        <Pill tone="free">{ZONE_TEXT[zone] ?? zone}</Pill>
        {s.protected && (
          <Pill tone="human">
            <Lock className="size-3" aria-hidden /> Protegido P1–P2
          </Pill>
        )}
      </header>

      {s.state === "libre" && p && (
        <>
          {p.k === 0 ? (
            <p className="mt-3 rounded-lg bg-sunken p-3 text-sm text-muted">
              No hay candidatos de {zone === "cercana" ? "P1–P2 (o con poco aviso)" : zone === "media" ? "P2–P3" : "P3–P4"} en la lista
              de {s.specialty}. Cuando se regule una solicitud que corresponda, aparecerá aquí.
            </p>
          ) : (
            <>
              <p className="mt-3 text-sm">
                <strong>
                  {pct(p.fill_probability)} de probabilidad de llenarlo con {p.k} {p.k === 1 ? "candidato" : "candidatos"}
                </strong>
                {allOfZone ? ", todos los de la zona" : ` de ${p.available} en la zona`}. Se ofrece al menor número de personas que llega al{" "}
                {pct(p.target)} de probabilidad (máximo 8).
              </p>
              <CandidateList list={p.candidates} />
              <Button
                variant="primary"
                className="mt-3 w-full rounded-md"
                disabled={!!busy}
                onClick={() => act(`a${s.id}`, { action: "approve_offer", slotId: s.id }, `Oferta enviada a ${p.k} ${p.k === 1 ? "persona" : "personas"} a la vez`)}
              >
                <Send className="size-4" aria-hidden /> Aprobar y enviar oferta a {p.k}
              </Button>
            </>
          )}
        </>
      )}

      {offer && (
        <>
          <p className="mt-3 flex items-center gap-1.5 text-sm text-st-free">
            <Clock className="size-4" aria-hidden /> Oferta abierta hasta las {fmtMin(offer.closes_min)} ({Math.max(0, offer.closes_min - nowMin)} min) · aprobó{" "}
            {offer.approved_by} · regla: {offer.rule === "primero_acepta" ? "primero que acepta" : "mayor prioridad al cierre"}
          </p>
          <CandidateList list={offer.candidates} offerId={offer.id} busy={busy} act={act} />
          <Button
            variant="primary"
            className="mt-3 w-full rounded-md"
            disabled={!!busy}
            onClick={() => act(`c${offer.id}`, { action: "close_offer", offerId: offer.id }, offer.rule === "primero_acepta" ? "Oferta cerrada: asignada al primero que aceptó" : "Oferta cerrada: asignada al de mayor prioridad entre quienes aceptaron")}
          >
            Cerrar oferta y asignar
          </Button>
        </>
      )}

      {pending && (
        <p className="mt-3 rounded-lg bg-st-human-soft px-3 py-2 text-sm text-st-human">
          Asignado a <strong>{pending.short_name}</strong> ({pending.code}), por validar con el paciente. Véalo en <strong>Por validar</strong>.
        </p>
      )}
    </article>
  );
}

const RESPONSE: Record<string, { label: string; tone: string }> = {
  acepta: { label: "Aceptó", tone: "ok" },
  declina: { label: "No puede", tone: "neutral" },
  sin_respuesta: { label: "Sin respuesta", tone: "warn" },
};

function CandidateList({
  list,
  offerId,
  busy,
  act,
}: {
  list: Candidate[];
  offerId?: number;
  busy?: string;
  act?: (k: string, b: Record<string, unknown>, ok?: string) => Promise<void>;
}) {
  const first = list.filter((c) => c.response === "acepta" && c.at).sort((a, b) => (a.at! < b.at! ? -1 : 1))[0];
  return (
    <ol className="mt-2 divide-y divide-line rounded-xl border border-line">
      {list.map((c, i) => (
        <li key={c.request_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
          <span className="w-5 text-xs tabular-nums text-faint">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
              {c.name}
              <span className={`rounded px-1.5 text-[11px] font-bold ${CAT_TONE[c.category]}`}>{c.category}</span>
              {c.priority_wait && <Pill tone="call">Primero en espera</Pill>}
              {c.live_chat && (
                <span className="inline-flex items-center gap-0.5 text-xs font-medium text-st-sent">
                  <MessageCircle className="size-3" aria-hidden /> chat en vivo
                </span>
              )}
              {c.phone_token && (
                <a href={`/t/${c.phone_token}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-xs font-medium text-brand" title="Abrir su teléfono simulado">
                  <Smartphone className="size-3" aria-hidden /> teléfono
                </a>
              )}
            </p>
            <p className="text-xs text-muted">
              Prioridad <strong className="text-ink">{c.reason}</strong>
              {c.a != null ? ` · probabilidad de aceptar: ${Math.round(c.a * 100)} %` : ""}
              {c.current_date ? ` · cita actual ${dateShort(c.current_date)}` : ""}
            </p>
          </div>
          {offerId != null && (
            <div className="flex items-center gap-1.5">
              {c.response ? (
                <Pill tone={RESPONSE[c.response].tone}>
                  {RESPONSE[c.response].label}
                  {first?.request_id === c.request_id ? " primero" : ""}
                </Pill>
              ) : (
                <>
                  <span className="text-xs text-muted">Esperando</span>
                  {act && (
                    <>
                      <button
                        disabled={!!busy}
                        title="Usar simulado: responde que acepta"
                        aria-label={`Simular que ${c.short_name} acepta`}
                        onClick={() => act(`s${c.request_id}`, { action: "simulate_response", offerId, requestId: c.request_id, accept: true }, `${c.short_name} acepta (simulado)`)}
                        className="press inline-flex items-center gap-1 rounded-md border border-st-ok/40 px-2 py-1 text-xs font-semibold text-st-ok hover:bg-st-ok-soft"
                      >
                        <Check className="size-3.5" aria-hidden /> Acepta
                      </button>
                      <button
                        disabled={!!busy}
                        title="Usar simulado: responde que no puede"
                        aria-label={`Simular que ${c.short_name} no puede`}
                        onClick={() => act(`s${c.request_id}`, { action: "simulate_response", offerId, requestId: c.request_id, accept: false }, `${c.short_name} no puede (simulado)`)}
                        className="press inline-flex items-center gap-1 rounded-md border border-line-strong px-2 py-1 text-xs font-semibold text-muted hover:bg-sunken"
                      >
                        <X className="size-3.5" aria-hidden /> No
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
