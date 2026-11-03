"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Eye } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { browserDb, fetchAll } from "@/lib/supabase/browser";
import { useDemoState, useHints, useStaffTick } from "@/lib/realtime";
import { post } from "@/lib/post";
import { STATUS, fmtMin, num, pct } from "@/lib/labels";
import { isBroad, type EventRow, type Status } from "@/lib/types";

type Lite = { id: number; status: Status; is_base: boolean; reminder_at_min: number | null };
type Group = { group: string; citas: number; tasa: number; flag?: string | null; auc?: number | null; precision_lista?: number | null; share_poblacion?: number; share_lista?: number };
type Historical = { summary: Record<string, number>; by_specialty: (Group & { no_atendidas: number })[]; by_age: Group[]; by_insurance: Group[]; by_modality: Group[] };
type ModelCard = {
  auc: number;
  test_no_show_rate: number;
  call_list_precision: number;
  call_list_capture: number;
  train_rows: number;
  test_rows: number;
  features: string[];
  history_rule: string;
  limitations: string[];
  groups: Record<string, Group[]>;
  demo_day_check: { demo_day: string; train_max_date: string };
};
type Reveal = { total: number; no_shows: number; no_show_rate: number; list_size: number; list_no_shows: number; list_precision: number; list_capture: number };
type Feed = EventRow & { patient: { short_name: string } | null; appointment: { specialty: string } | null };

const STACK: Status[] = ["confirmada", "reasignada", "liberada", "derivada_a_persona", "en_llamada", "sin_respuesta", "recordatorio_enviado", "pendiente"];
const FILL: Record<string, string> = {
  confirmada: "bg-st-ok",
  reasignada: "bg-st-done",
  liberada: "bg-st-free",
  derivada_a_persona: "bg-st-human",
  en_llamada: "bg-st-call",
  sin_respuesta: "bg-st-warn",
  recordatorio_enviado: "bg-st-sent",
  pendiente: "bg-line-strong",
};

export function Board() {
  const state = useDemoState();
  const [rows, setRows] = useState<Lite[]>([]);
  const [calls, setCalls] = useState({ total: 0, answered: 0 });
  const [feed, setFeed] = useState<Feed[]>([]);
  const [hist, setHist] = useState<Historical | null>(null);
  const [card, setCard] = useState<ModelCard | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [revealing, setRevealing] = useState(false);
  useStaffTick(Boolean(state?.clock_started_at));

  const loadLive = useCallback(async () => {
    const db = browserDb();
    const [r, c, a, e] = await Promise.all([
      fetchAll<Lite>((from, to) => db.from("appointments").select("id,status,is_base,reminder_at_min").order("id").range(from, to) as never),
      db.from("calls").select("id", { count: "exact", head: true }),
      db.from("calls").select("id", { count: "exact", head: true }).not("answered_at", "is", null),
      db
        .from("events")
        .select("*,patient:patients(short_name),appointment:appointments(specialty)")
        .eq("kind", "estado")
        .neq("to_status", "recordatorio_enviado")
        .neq("actor", "Paciente (simulado)")
        .order("id", { ascending: false })
        .limit(10),
    ]);
    setRows(r);
    setCalls({ total: c.count ?? 0, answered: a.count ?? 0 });
    setFeed((e.data ?? []) as Feed[]);
  }, []);

  const loadStatic = useRef(async () => {
    const { data } = await browserDb().from("metrics").select("key,value").in("key", ["historical", "model_card", "reveal"]);
    for (const m of data ?? []) {
      if (m.key === "historical") setHist(m.value);
      if (m.key === "model_card") setCard(m.value);
      if (m.key === "reveal") setReveal(m.value);
    }
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch from an external system
    loadLive();
    loadStatic.current();
  }, [loadLive]);

  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useHints((h) => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(loadLive, 250); // coalesce bursts
    if (isBroad(h)) loadStatic.current();
  });
  const base = useMemo(() => rows.filter((r) => r.is_base), [rows]);
  const count = useMemo(() => {
    const c = Object.fromEntries(STACK.map((s) => [s, 0])) as Record<Status, number>;
    for (const r of base) c[r.status]++;
    return c;
  }, [base]);
  const reminders = base.filter((r) => r.reminder_at_min != null).length;
  const answered = count.confirmada + count.liberada + count.derivada_a_persona + count.reasignada;

  async function doReveal() {
    setRevealing(true);
    try {
      const r = await post<Reveal & { ok: boolean }>("/api/staff", { action: "reveal" });
      setReveal(r);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRevealing(false);
    }
  }

  return (
    <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-5 sm:px-6">
      <section aria-labelledby="live">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 id="live" className="font-display text-3xl font-bold tracking-tight">
              Tablero en vivo
            </h1>
            <p className="text-sm text-muted">
              Citas de mañana, {state?.day_label ?? "…"} de 2023. Se actualiza solo.
            </p>
          </div>
          {state?.reminders_sent_min != null && <p className="text-sm text-muted">Recordatorios enviados a las {fmtMin(state.reminders_sent_min)}</p>}
        </div>

        <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Tile label="Recordatorios enviados" value={reminders} sub={`de ${num(base.length)} citas`} />
          <Tile label="Confirmadas" value={count.confirmada} sub={reminders ? `${pct(count.confirmada / base.length)} del total` : ""} />
          <Tile label="Cupos liberados" value={count.liberada + count.reasignada} sub="avisaron que no irán" />
          <Tile label="Sin respuesta" value={count.sin_respuesta + count.en_llamada} sub={`${num(count.en_llamada)} en llamada ahora`} />
          <Tile label="Llamadas del asistente" value={calls.total} sub={`${num(calls.answered)} contestadas`} />
          <Tile label="Reasignadas" value={count.reasignada} sub="cupos recuperados para la lista de espera" strong />
        </ul>

        <Card className="mt-4 p-4">
          <h2 className="font-semibold">Estado de las {num(base.length)} citas</h2>
          <p className="text-sm text-muted">{reminders ? `${num(answered)} ya respondieron.` : "Todavía no se enviaron los recordatorios."}</p>
          <div className="mt-3 flex h-7 w-full gap-[2px] overflow-hidden rounded-md" role="img" aria-label="Distribución de estados">
            {STACK.filter((s) => count[s] > 0).map((s) => (
              <div
                key={s}
                className={`${FILL[s]} h-full transition-[flex-grow] duration-500 ease-out first:rounded-l-md last:rounded-r-md`}
                style={{ flexGrow: count[s], flexBasis: 0 }}
                title={`${STATUS[s].label}: ${num(count[s])}`}
              />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            {STACK.map((s) => (
              <li key={s} className="flex items-center gap-1.5">
                <span className={`size-2.5 rounded-sm ${FILL[s]}`} aria-hidden />
                {STATUS[s].label} <span className="tabular-nums text-muted">{num(count[s])}</span>
              </li>
            ))}
          </ul>
        </Card>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.3fr]">
          <Card className="p-4">
            <h2 className="font-semibold">Actividad reciente</h2>
            
            <ol className="mt-2 divide-y divide-line">
              {!feed.length && <li className="py-3 text-sm text-muted">Sin actividad todavía.</li>}
              {feed.map((e) => (
                <li key={e.id} className="bubble-in grid grid-cols-[46px_1fr] gap-2 py-2 text-sm">
                  <span className="tabular-nums text-muted">{fmtMin(e.demo_min)}</span>
                  <span>
                    <strong>{e.patient?.short_name ?? ""}</strong> · {e.to_status ? STATUS[e.to_status].label.toLowerCase() : e.kind}
                    <span className="block text-xs text-muted">
                      {e.appointment?.specialty} · {e.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          <RevealCard reveal={state?.revealed ? reveal : null} onReveal={doReveal} busy={revealing} careDays={hist?.summary.care_days ?? 0} />
        </div>
      </section>

      {hist && card && <History hist={hist} card={card} />}
    </main>
  );
}

function Tile({ label, value, sub, strong }: { label: string; value: number; sub?: string; strong?: boolean }) {
  return (
    <li className={`rounded-2xl p-4 ring-1 ${strong ? "bg-night text-white ring-night" : "bg-surface ring-line"}`}>
      <p className="text-sm font-medium">{label}</p>
      <p className={`mt-2 font-display text-4xl font-bold tabular-nums ${strong ? "text-mint" : ""}`}><span key={value} className="bump inline-block">{num(value)}</span></p>
      {sub && <p className={`mt-1 text-xs ${strong ? "text-white/60" : "text-muted"}`}>{sub}</p>}
    </li>
  );
}

function RevealCard({ reveal, onReveal, busy, careDays }: { reveal: Reveal | null; onReveal: () => void; busy: boolean; careDays: number }) {
  const [a, setA] = useState(30);
  const [b, setB] = useState(70);
  if (!reveal) {
    return (
      <Card className="flex flex-col p-4">
        <h2 className="font-semibold">Ver qué pasó ese día</h2>
        <p className="mt-1 max-w-[60ch] text-sm text-muted">
          Este día ocurrió de verdad en 2023. El sistema no conoce el resultado mientras trabaja. Al revelarlo se muestra cuántas
          citas no se atendieron y cuántas de ellas estaban en la lista de llamadas.
        </p>
        <Button variant="primary" className="mt-4 self-start" onClick={onReveal} disabled={busy}>
          <Eye className="size-4" aria-hidden /> {busy ? "Revelando…" : "Ver qué pasó"}
        </Button>
      </Card>
    );
  }
  const recovered = reveal.no_shows * (a / 100) * (b / 100);
  return (
    <Card className="p-4">
      <h2 className="font-semibold">Lo que pasó de verdad ese día</h2>
      <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat k="Citas no atendidas" v={`${num(reveal.no_shows)} de ${num(reveal.total)}`} sub={pct(reveal.no_show_rate, 1)} />
        <Stat k="Estaban en la lista de llamadas" v={`${num(reveal.list_no_shows)} de ${num(reveal.list_size)}`} sub={`${pct(reveal.list_precision)} de la lista no asistió`} />
        <Stat k="Inasistencias que la lista cubría" v={pct(reveal.list_capture)} sub="del total del día" />
      </dl>
      <div className="mt-4 rounded-lg border border-dashed border-line-strong bg-sunken p-3">
        <p className="text-sm font-semibold">Escenario (supuestos editables, no es un resultado)</p>
        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          <label className="flex items-center justify-between gap-2">
            <span>De quienes no iban a ir, avisan y liberan el cupo</span>
            <span className="flex items-center gap-1">
              <input type="number" min={0} max={100} value={a} onChange={(e) => setA(Number(e.target.value))} className="w-16 rounded-md border border-line-strong bg-surface px-2 py-1 text-right" />%
            </span>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>Cupos liberados que se reasignan</span>
            <span className="flex items-center gap-1">
              <input type="number" min={0} max={100} value={b} onChange={(e) => setB(Number(e.target.value))} className="w-16 rounded-md border border-line-strong bg-surface px-2 py-1 text-right" />%
            </span>
          </label>
        </div>
        <p className="mt-3 text-sm">
          Con estos supuestos se recuperarían unas <strong className="text-lg tabular-nums text-brand">{num(Math.round(recovered))}</strong> citas
          ese día{careDays ? <> y unas <strong className="tabular-nums">{num(Math.round(recovered * careDays))}</strong> en un año de {num(careDays)} días de atención</> : null}.
        </p>
      </div>
    </Card>
  );
}

function Stat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="text-lg font-bold tabular-nums">{v}</dd>
      {sub && <dd className="text-xs text-muted">{sub}</dd>}
    </div>
  );
}

function History({ hist, card }: { hist: Historical; card: ModelCard }) {
  const s = hist.summary;
  const [showAll, setShowAll] = useState(false);
  const specs = showAll ? hist.by_specialty : hist.by_specialty.slice(0, 12);
  return (
    <section aria-labelledby="hist" className="space-y-4">
      <div>
        <h2 id="hist" className="font-display text-2xl font-bold tracking-tight">
          Histórico 2023 y ficha del modelo
        </h2>
        <p className="max-w-[90ch] text-sm text-muted">
          {num(s.clean_rows)} citas de {num(s.patients)} pacientes en el Hospital María Auxiliadora. {num(s.no_shows)} no se atendieron (
          {pct(s.no_show_rate, 1)}), unas {num(Math.round(s.no_shows_per_day))} por día de atención. Se excluyeron 19 especialidades con 95 % o
          más de citas no atendidas, que parecen errores de registro.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="font-semibold">Citas no atendidas por especialidad</h3>
          <p className="text-xs text-muted">Ordenadas por número de citas no atendidas. La barra muestra la tasa.</p>
          <Bars rows={specs} />
          <button className="mt-2 text-sm font-semibold text-brand underline-offset-2 hover:underline" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Ver solo las 12 primeras" : `Ver las ${hist.by_specialty.length} especialidades`}
          </button>
        </Card>
        <div className="grid gap-4">
          <Card className="p-4">
            <h3 className="font-semibold">Por edad</h3>
            <Bars rows={hist.by_age} />
          </Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-4">
              <h3 className="font-semibold">Por seguro de salud</h3>
              <Bars rows={hist.by_insurance} />
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold">Por modalidad</h3>
              <Bars rows={hist.by_modality} />
            </Card>
          </div>
        </div>
      </div>

      <Card className="p-4">
        <h3 className="font-semibold">Ficha del modelo</h3>
        <dl className="mt-2 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat k="Capacidad de ordenar (AUC)" v={card.auc.toFixed(3)} sub="0.5 = azar · 1 = perfecto" />
          <Stat k="No asistió en la lista del 10 %" v={pct(card.call_list_precision)} sub={`frente a ${pct(card.test_no_show_rate)} de promedio`} />
          <Stat k="Inasistencias que cubre la lista" v={pct(card.call_list_capture)} sub="del total de cada día" />
          <Stat k="Datos" v={`${num(card.train_rows)} / ${num(card.test_rows)}`} sub="entrenamiento ene–sep / prueba oct–dic" />
        </dl>
        <p className="mt-3 text-sm text-muted">
          {card.history_rule} El modelo usado para el día de la demo ({card.demo_day_check.demo_day}) se entrenó solo con citas hasta el{" "}
          {card.demo_day_check.train_max_date}.
        </p>
        <p className="mt-2 text-sm">
          <span className="font-medium">Variables:</span> {card.features.join(", ")}.
        </p>
        <h4 className="mt-4 text-sm font-semibold">Desempeño por grupo (octubre a diciembre de 2023)</h4>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-1.5 font-semibold">Grupo</th>
                <th className="py-1.5 text-right font-semibold">Citas</th>
                <th className="py-1.5 text-right font-semibold">No asistió</th>
                <th className="py-1.5 text-right font-semibold">AUC</th>
                <th className="py-1.5 text-right font-semibold">No asistió en la lista</th>
                <th className="py-1.5 text-right font-semibold">Parte de las citas</th>
                <th className="py-1.5 text-right font-semibold">Parte de la lista</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(card.groups).flatMap(([, gs]) =>
                gs.map((g) => (
                  <tr key={g.group} className="border-b border-line last:border-0">
                    <td className="py-1.5">{g.group}</td>
                    <td className="py-1.5 text-right tabular-nums">{num(g.citas)}</td>
                    <td className="py-1.5 text-right tabular-nums">{pct(g.tasa)}</td>
                    <td className="py-1.5 text-right tabular-nums">{g.auc?.toFixed(2) ?? "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">{g.precision_lista != null ? pct(g.precision_lista) : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">{g.share_poblacion != null ? pct(g.share_poblacion) : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">{g.share_lista != null ? pct(g.share_lista) : "—"}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
          {card.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function Bars({ rows }: { rows: (Group & { no_atendidas?: number })[] }) {
  const max = Math.max(...rows.map((r) => r.tasa), 0.01);
  return (
    <ul className="mt-3 space-y-1.5">
      {rows.map((r) => (
        <li key={r.group} className="grid grid-cols-[minmax(0,10rem)_1fr_3.2rem] items-center gap-2 text-sm" title={`${r.group}: ${pct(r.tasa, 1)} de ${num(r.citas)} citas`}>
          <span className="truncate">
            {r.group}
            {r.flag && <span className="ml-1 text-xs text-risk-medio" title={r.flag}>(dato dudoso)</span>}
          </span>
          <span className="h-3 rounded-r-[4px] bg-sunken">
            <span className="block h-full rounded-r-[4px] bg-brand" style={{ width: `${(r.tasa / max) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums text-muted">{pct(r.tasa)}</span>
        </li>
      ))}
    </ul>
  );
}
