"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Eye } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { useDemoState, useHints, useStaffTick } from "@/lib/realtime";
import { getJson, post } from "@/lib/post";
import { STATUS, fmtMin, num, pct } from "@/lib/labels";
import type { Status } from "@/lib/types";

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
type EquityRow = { category: string; group: string; label: string; list_n: number; list_total: number; offer_n: number; offer_total: number; assign_n: number; assign_total: number };
type BoardData = {
  board: {
    registered_without_slot: number;
    requests_total: number;
    with_care: number;
    pending_regulation: number;
    wait_median: number | null;
    wait_p90: number | null;
    over_deadline: number;
    regulated: number;
    slots_freed: number;
    slots_filled: number;
    offers_sent: number;
    accepted: number;
    declined: number;
    no_answer: number;
    validations: Record<string, number> | null;
    reverted: number;
    domino: number;
    withdrawals: Record<string, number>;
    tasks_today: number;
    agent_derivations: number;
    agent_calls: number;
    confirmed_day: number;
    released_day: number;
    unanswered_day: number;
    equity: EquityRow[];
    params: Record<string, number>;
    feed: { id: number; kind: string; detail: string; demo_min: number | null }[];
  };
  statuses: { status: Status }[];
  calls: number;
  metrics: { key: string; value: unknown }[];
};

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
const WITHDRAW_LABEL: Record<string, string> = {
  atendido_en_otro_lugar: "atendido en otro lugar",
  ya_no_lo_necesita: "ya no lo necesita",
  duplicado: "duplicado",
  otro: "otro",
};

export function Board() {
  const state = useDemoState();
  const [data, setData] = useState<BoardData | null>(null);
  const [revealing, setRevealing] = useState(false);
  useStaffTick(Boolean(state?.clock_started_at));

  const load = useRef(async () => {
    try {
      setData(await getJson<BoardData>("/api/staff/data?view=board"));
    } catch {
      // the next hint retries
    }
  });
  useEffect(() => {
    load.current();
  }, []);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useHints(() => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => load.current(), 400); // coalesce bursts
  });

  const metrics = useMemo(() => Object.fromEntries((data?.metrics ?? []).map((m) => [m.key, m.value])), [data]);
  const hist = metrics.historical as Historical | undefined;
  const card = metrics.model_card as ModelCard | undefined;
  const reveal = metrics.reveal as Reveal | undefined;
  const b = data?.board;
  const count = useMemo(() => {
    const c = Object.fromEntries(STACK.map((s) => [s, 0])) as Record<Status, number>;
    for (const r of data?.statuses ?? []) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [data]);
  const baseTotal = data?.statuses.length ?? 0;

  async function doReveal() {
    setRevealing(true);
    try {
      await post("/api/staff", { action: "reveal" });
      await load.current();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRevealing(false);
    }
  }

  const v = b?.validations ?? {};
  const withdrawals = Object.values(b?.withdrawals ?? {}).reduce((a, n) => a + n, 0);
  return (
    <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-5 sm:px-6">
      <section aria-labelledby="live">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 id="live" className="font-display text-3xl font-bold tracking-tight">
              Tablero en vivo
            </h1>
            <p className="text-sm text-muted">Demanda, reasignación, equidad y carga del personal. Se actualiza solo.</p>
          </div>
          {state?.reminders_sent_min != null && <p className="text-sm text-muted">Recordatorios 72 h enviados a las {fmtMin(state.reminders_sent_min)}</p>}
        </div>

        <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Tile label="Personas registradas sin cupo" value={b?.registered_without_slot ?? 0} sub={`${num(b?.pending_regulation ?? 0)} pendientes de regulación`} strong />
          <Tile label="Solicitudes con atención" value={b ? Math.round((100 * b.with_care) / Math.max(1, b.requests_total)) : 0} unit="%" sub={`${num(b?.with_care ?? 0)} de ${num(b?.requests_total ?? 0)} con cita`} />
          <Tile label="Espera desde el primer intento" value={Math.round(b?.wait_median ?? 0)} unit="días" sub={`mediana · 9 de cada 10 esperan hasta ${num(Math.round(b?.wait_p90 ?? 0))} días`} />
          <Tile label="Fuera de plazo" value={b ? Math.round((100 * b.over_deadline) / Math.max(1, b.regulated)) : 0} unit="%" sub={`${num(b?.over_deadline ?? 0)} superan el plazo de su categoría`} />
          <Tile label="Cupos liberados que se llenan" value={b?.slots_filled ?? 0} sub={`de ${num(b?.slots_freed ?? 0)} liberados · ${num(b?.domino ?? 0)} por efecto dominó`} />
          <Tile label="Ofertas enviadas" value={b?.offers_sent ?? 0} sub={`${num(b?.accepted ?? 0)} aceptadas · ${num(b?.declined ?? 0)} declinadas · ${num(b?.no_answer ?? 0)} sin respuesta`} />
          <Tile label="Validaciones" value={v.confirmada ?? 0} sub={`${num(v.pendiente ?? 0)} pendientes · ${num((v.fallida ?? 0) + (v.vencida ?? 0))} sin éxito · ${num(b?.reverted ?? 0)} revertidas`} />
          <Tile
            label="Retiros sin atención"
            value={withdrawals}
            sub={withdrawals ? Object.entries(b?.withdrawals ?? {}).map(([k, n]) => `${WITHDRAW_LABEL[k] ?? k}: ${n}`).join(" · ") : "ninguno; no responder no es un motivo"}
          />
          <Tile label="Carga del personal" value={b?.tasks_today ?? 0} sub={`tareas para una persona · ${num(b?.agent_derivations ?? 0)} derivadas por el asistente · ${num(b?.agent_calls ?? 0)} llamadas del asistente`} />
          <Tile label="Inasistencia 2023 (HMA)" value={hist ? Math.round(hist.summary.no_show_rate * 1000) / 10 : 0} unit="%" sub={`${num(hist?.summary.no_shows ?? 106100)} citas perdidas en el año`} />
        </ul>

        <Card className="mt-4 p-4">
          <h2 className="font-semibold">Citas en 3 días: estado de las {num(baseTotal)}</h2>
          <p className="text-sm text-muted">
            {num(b?.confirmed_day ?? 0)} confirmadas · {num(b?.released_day ?? 0)} cupos liberados · {num(b?.unanswered_day ?? 0)} sin respuesta. Ninguna cita cambia por no responder.
          </p>
          <div className="mt-3 flex h-7 w-full gap-[2px] overflow-hidden rounded-md" role="img" aria-label="Distribución de estados">
            {STACK.filter((s) => count[s] > 0).map((s) => (
              <div key={s} className={`${FILL[s]} h-full transition-[flex-grow] duration-500 ease-out first:rounded-l-md last:rounded-r-md`} style={{ flexGrow: count[s], flexBasis: 0 }} title={`${STATUS[s].label}: ${num(count[s])}`} />
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

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <Card className="p-4">
            <h2 className="font-semibold">Actividad de reasignación</h2>
            <ol className="mt-2 divide-y divide-line">
              {!b?.feed.length && <li className="py-3 text-sm text-muted">Sin actividad todavía.</li>}
              {b?.feed.slice(0, 12).map((e) => (
                <li key={e.id} className="bubble-in grid grid-cols-[46px_1fr] gap-2 py-2 text-sm">
                  <span className="tabular-nums text-muted">{fmtMin(e.demo_min)}</span>
                  <span>{e.detail}</span>
                </li>
              ))}
            </ol>
          </Card>
          <Scenario params={b?.params} />
        </div>

        {b && <Equity rows={b.equity} />}

        <div className="mt-4">
          <RevealCard reveal={state?.revealed ? reveal ?? null : null} onReveal={doReveal} busy={revealing} />
        </div>
      </section>

      {hist && card && <History hist={hist} card={card} />}
    </main>
  );
}

/** RF-17: r ≈ s + c·f (proposal 4.7). Editable assumptions, never shown as a result; no amounts in soles. */
function Scenario({ params }: { params?: Record<string, number> }) {
  const [v, setV] = useState<{ s: number; c: number; f: number } | null>(null);
  const cur = v ?? { s: Math.round((params?.s ?? 0) * 100), c: Math.round((params?.c ?? 1 / 3) * 100), f: Math.round((params?.f ?? 0.3) * 100) };
  const exactC = v ? cur.c / 100 : params?.c ?? 1 / 3;
  const r = cur.s / 100 + exactC * (cur.f / 100);
  const annual = Math.round((params?.annual_no_shows ?? 106100) * r);
  const breakeven = params?.breakeven_r ?? 0.052; // proposal v5.1, section 9
  const field = (k: "s" | "c" | "f", label: string) => (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-1">
        <input type="number" min={0} max={100} value={cur[k]} onChange={(e) => setV({ ...cur, [k]: Number(e.target.value) })} className="w-16 rounded-md border border-line-strong bg-surface px-2 py-1 text-right tabular-nums" />%
      </span>
    </label>
  );
  return (
    <Card className="p-4">
      <h2 className="font-semibold">Escenario de recuperación: r ≈ s + c · f</h2>
      <p className="text-xs text-muted">Supuestos editables, no es un resultado. Valores por defecto de la propuesta (sección 4.7).</p>
      <div className="mt-3 grid gap-2">
        {field("s", "s · inasistencias que se evitan porque el paciente recuerda")}
        {field("c", "c · inasistencias que se convierten en aviso anticipado")}
        {field("f", "f · cupos liberados que se vuelven a llenar")}
      </div>
      <p className="mt-4 text-sm">
        r ≈ <strong className="font-display text-3xl tabular-nums text-brand">{Math.round(r * 1000) / 10} %</strong> → unas{" "}
        <strong className="tabular-nums">{num(Math.round(annual / 100) * 100)}</strong> citas al año (106,100 × r)
      </p>
      <div className="relative mt-3 h-3 rounded-md bg-sunken" role="img" aria-label={`r frente al umbral de ${(breakeven * 100).toFixed(1)} %`}>
        <div className="h-full rounded-md bg-brand" style={{ width: `${Math.min(100, (r / 0.2) * 100)}%` }} />
        <div className="absolute inset-y-[-4px] w-0.5 bg-risk-alto" style={{ left: `${(breakeven / 0.2) * 100}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-muted">
        Línea roja: el hospital obtiene beneficio desde {(breakeven * 100).toFixed(1)} %. {r >= breakeven ? "Este escenario la supera." : "Este escenario no la alcanza."}
      </p>
    </Card>
  );
}

/** Share of each group among offers and assignments vs. among the list, always within the same category. */
function Equity({ rows }: { rows: EquityRow[] }) {
  const cats = [...new Set(rows.map((r) => r.category))];
  const share = (n: number, t: number) => (t ? `${Math.round((100 * n) / t)} %` : "—");
  return (
    <Card className="mt-4 p-4">
      <h2 className="font-semibold">Equidad dentro de cada categoría</h2>
      <p className="text-xs text-muted">
        Parte de cada grupo en las ofertas y asignaciones frente a su parte en la lista. Los grupos se leen de los atributos de
        equidad en el servidor (el regulador no tiene acceso). Con menos de 5 personas se muestra «Grupo pequeño».
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="py-1.5">Categoría</th>
              <th className="py-1.5">Grupo</th>
              <th className="py-1.5 text-right">En la lista</th>
              <th className="py-1.5 text-right">En las ofertas</th>
              <th className="py-1.5 text-right">En las asignaciones</th>
            </tr>
          </thead>
          <tbody>
            {cats.flatMap((c) =>
              rows
                .filter((r) => r.category === c)
                .map((r) => (
                  <tr key={c + r.group} className="border-b border-line last:border-0">
                    <td className="py-1.5 font-semibold">{c}</td>
                    <td className="py-1.5">{r.label}</td>
                    {r.list_n < 5 ? (
                      <td colSpan={3} className="py-1.5 text-right text-muted">
                        Grupo pequeño
                      </td>
                    ) : (
                      <>
                        <td className="py-1.5 text-right tabular-nums">{share(r.list_n, r.list_total)}</td>
                        <td className="py-1.5 text-right tabular-nums">{share(r.offer_n, r.offer_total)}</td>
                        <td className="py-1.5 text-right tabular-nums">{share(r.assign_n, r.assign_total)}</td>
                      </>
                    )}
                  </tr>
                )),
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Tile({ label, value, sub, strong, unit }: { label: string; value: number; sub?: string; strong?: boolean; unit?: string }) {
  return (
    <li className={`rounded-2xl p-4 ring-1 ${strong ? "bg-night text-white ring-night" : "bg-surface ring-line"}`}>
      <p className="text-sm font-medium">{label}</p>
      <p className={`mt-2 font-display text-4xl font-bold tabular-nums ${strong ? "text-mint" : ""}`}>
        <span key={value} className="bump inline-block">
          {num(value)}
        </span>
        {unit ? <span className="ml-1 text-lg font-semibold">{unit}</span> : null}
      </p>
      {sub && <p className={`mt-1 text-xs ${strong ? "text-white/60" : "text-muted"}`}>{sub}</p>}
    </li>
  );
}

function RevealCard({ reveal, onReveal, busy }: { reveal: Reveal | null; onReveal: () => void; busy: boolean }) {
  if (!reveal) {
    return (
      <Card className="flex flex-col p-4">
        <h2 className="font-semibold">Ver qué pasó ese día</h2>
        <p className="mt-1 max-w-[70ch] text-sm text-muted">
          Este día ocurrió de verdad en 2023. El sistema no conoce el resultado mientras trabaja. Al revelarlo se muestra cuántas
          citas no se atendieron y cuántas de ellas estaban en la lista de llamadas.
        </p>
        <Button variant="primary" className="mt-4 self-start" onClick={onReveal} disabled={busy}>
          <Eye className="size-4" aria-hidden /> {busy ? "Revelando…" : "Ver qué pasó"}
        </Button>
      </Card>
    );
  }
  return (
    <Card className="p-4">
      <h2 className="font-semibold">Lo que pasó de verdad ese día</h2>
      <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat k="Citas no atendidas" v={`${num(reveal.no_shows)} de ${num(reveal.total)}`} sub={pct(reveal.no_show_rate, 1)} />
        <Stat k="Estaban en la lista de llamadas" v={`${num(reveal.list_no_shows)} de ${num(reveal.list_size)}`} sub={`${pct(reveal.list_precision)} de la lista no asistió`} />
        <Stat k="Inasistencias que la lista cubría" v={pct(reveal.list_capture)} sub="del total del día" />
      </dl>
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
        <h3 className="font-semibold">Ficha del modelo (sin la variable sexo)</h3>
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
            {r.flag && (
              <span className="ml-1 text-xs text-risk-medio" title={r.flag}>
                (dato dudoso)
              </span>
            )}
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
