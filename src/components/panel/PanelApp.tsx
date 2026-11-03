"use client";

import { memo, useDeferredValue, useMemo, useState } from "react";
import { toast } from "sonner";
import { PhoneCall, Search, Send, ArrowRightLeft, X } from "lucide-react";
import { Button, RiskTag, StatusBadge } from "@/components/ui";
import { post } from "@/lib/post";
import { useDemoState, useStaffTick } from "@/lib/realtime";
import { STATUS, STATUS_ORDER, fmtMin, num, pct, riskLevel, type RiskLevel } from "@/lib/labels";
import type { DemoState, Status } from "@/lib/types";
import { usePanelData, type Row } from "./usePanelData";
import { AppointmentDetail } from "./AppointmentDetail";

type Tab = "todas" | "llamadas" | "liberadas" | "sin_respuesta";

export function PanelApp() {
  const state = useDemoState();
  const { rows, loading, error, flash } = usePanelData();
  const [tab, setTab] = useState<Tab>("todas");
  const [query, setQuery] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [risk, setRisk] = useState<RiskLevel | "">("");
  const [status, setStatus] = useState<Status | "">("");
  const [selected, setSelected] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const deferredQuery = useDeferredValue(query);
  useStaffTick(Boolean(state?.clock_started_at));

  const all = useMemo(() => [...rows.values()], [rows]);
  const base = useMemo(() => all.filter((r) => r.is_base), [all]);
  const listSize = state ? Math.floor(base.length * state.call_list_pct) : 0;
  const specialties = useMemo(() => [...new Set(base.map((r) => r.specialty))].sort((a, b) => a.localeCompare(b, "es")), [base]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<Status, number>;
    for (const r of base) c[r.status]++;
    const high = state ? base.filter((r) => riskLevel(r.risk, state) === "alto").length : 0;
    const contacted = base.filter((r) => r.status !== "pendiente").length;
    return { ...c, high, contacted, newFromWaitlist: all.length - base.length };
  }, [base, all.length, state]);

  const visible = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    let list = all;
    if (tab === "llamadas") list = list.filter((r) => r.is_base && r.risk_rank != null && r.risk_rank <= listSize);
    if (tab === "liberadas") list = list.filter((r) => r.status === "liberada");
    if (tab === "sin_respuesta") list = list.filter((r) => r.status === "sin_respuesta" || r.status === "en_llamada");
    if (specialty) list = list.filter((r) => r.specialty === specialty);
    if (risk && state) list = list.filter((r) => riskLevel(r.risk, state) === risk);
    if (status) list = list.filter((r) => r.status === status);
    if (q) list = list.filter((r) => r.patient.full_name.toLowerCase().includes(q) || String(r.id) === q);
    return [...list].sort((a, b) => (b.risk ?? -1) - (a.risk ?? -1) || a.time.localeCompare(b.time));
  }, [all, tab, specialty, risk, status, deferredQuery, listSize, state]);

  async function sendReminders() {
    setSending(true);
    try {
      const { sent } = await post<{ sent: number }>("/api/staff", { action: "reminders" });
      toast.success(`Recordatorios enviados a ${num(sent)} citas`, {
        description: "Llegan solo a los teléfonos simulados. Las respuestas aparecerán aquí al instante.",
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  const selectedRow = selected != null ? rows.get(selected) : undefined;
  const filtersOn = Boolean(query || specialty || risk || status);
  const pendingReminders = counts.pendiente;

  return (
    <div className="mx-auto grid max-w-[1500px] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_440px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Citas de mañana</h1>
            <p className="text-sm text-muted">
              {state?.day_label ? `${capitalize(state.day_label)} de 2023` : "Cargando…"} · {num(base.length)} citas
              programadas, ordenadas por riesgo de inasistencia
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button variant="primary" onClick={sendReminders} disabled={sending || loading || pendingReminders === 0}>
              <Send className="size-4" aria-hidden />
              {pendingReminders === 0 && base.length
                ? "Recordatorios enviados"
                : sending
                  ? "Enviando…"
                  : `Enviar recordatorios a ${num(pendingReminders)} citas`}
            </Button>
            {state?.reminders_sent_min != null && (
              <span className="text-xs text-muted">
                Enviados a las {fmtMin(state.reminders_sent_min)} · plazo para responder: {state.reply_deadline_min / 60} h
              </span>
            )}
          </div>
        </div>

        <Indicators counts={counts} total={base.length} onPick={(s) => { setTab("todas"); setStatus(s); }} active={status} />

        <div className="rounded-xl border border-line bg-surface">
          <div role="tablist" aria-label="Vistas" className="flex flex-wrap gap-1 border-b border-line px-2 pt-2">
            <TabButton id="todas" tab={tab} setTab={setTab} label="Todas las citas" count={all.length} />
            <TabButton
              id="llamadas"
              tab={tab}
              setTab={setTab}
              label={`Lista de llamadas (${state ? pct(state.call_list_pct) : "10 %"} de mayor riesgo)`}
              count={listSize}
            />
            <TabButton id="sin_respuesta" tab={tab} setTab={setTab} label="Sin respuesta" count={counts.sin_respuesta + counts.en_llamada} attention={counts.sin_respuesta > 0} />
            <TabButton id="liberadas" tab={tab} setTab={setTab} label="Cupos por reasignar" count={counts.liberada} attention={counts.liberada > 0} />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-sunken px-3 py-2.5">
            <label className="relative min-w-52 flex-1">
              <span className="sr-only">Buscar paciente</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre…"
                className="w-full rounded-lg border border-line-strong bg-surface py-2 pl-8 pr-3 text-sm"
              />
            </label>
            <Select label="Especialidad" value={specialty} onChange={setSpecialty} options={specialties.map((s) => [s, s])} />
            <Select label="Riesgo" value={risk} onChange={(v) => setRisk(v as RiskLevel | "")} options={[["alto", "Alto"], ["medio", "Medio"], ["bajo", "Bajo"]]} />
            <Select label="Estado" value={status} onChange={(v) => setStatus(v as Status | "")} options={STATUS_ORDER.map((s) => [s, STATUS[s].label])} />
            {filtersOn && (
              <Button variant="ghost" onClick={() => { setQuery(""); setSpecialty(""); setRisk(""); setStatus(""); }}>
                <X className="size-4" aria-hidden /> Quitar filtros
              </Button>
            )}
          </div>
          {tab === "llamadas" && (
            <p className="border-b border-line px-4 py-2 text-sm text-muted">
              Las citas con más riesgo reciben más apoyo: si no responden el mensaje, el asistente automático las llama.
              En las pruebas con octubre a diciembre de 2023, esta lista tuvo cerca del doble de inasistencias que el promedio.
            </p>
          )}
          {tab === "liberadas" && (
            <p className="border-b border-line px-4 py-2 text-sm text-muted">
              Abra un cupo para ver la lista de espera de esa especialidad y elegir a quién ofrecérselo.
            </p>
          )}
          <div role="table" aria-label="Citas" aria-rowcount={visible.length}>
            <div role="row" className="hidden grid-cols-[150px_minmax(0,1fr)_minmax(0,0.9fr)_190px_110px] gap-3 border-b border-line px-4 py-2 text-xs font-semibold text-muted md:grid">
              <span role="columnheader">Riesgo</span>
              <span role="columnheader">Paciente</span>
              <span role="columnheader">Cita</span>
              <span role="columnheader">Estado</span>
              <span role="columnheader" className="text-right">Acción</span>
            </div>
            {loading && <p className="px-4 py-10 text-center text-muted">Cargando citas…</p>}
            {error && <p className="px-4 py-10 text-center text-risk-alto">No se pudieron cargar las citas. {error}</p>}
            {!loading && !visible.length && (
              <p className="px-4 py-10 text-center text-muted">
                {tab === "liberadas" ? "Todavía no hay cupos liberados." : "Ninguna cita coincide con los filtros."}
              </p>
            )}
            {visible.map((r) => (
              <AppointmentRow
                key={r.id}
                row={r}
                state={state}
                inList={r.is_base && r.risk_rank != null && r.risk_rank <= listSize}
                selected={selected === r.id}
                flashKey={flash.get(r.id)}
                onSelect={setSelected}
              />
            ))}
          </div>
        </div>
      </div>

      <aside
        className={`lg:sticky lg:top-[76px] lg:block lg:max-h-[calc(100dvh-92px)] lg:self-start ${
          selectedRow ? "fixed inset-0 z-40 overflow-y-auto bg-paper p-3 lg:static lg:z-auto lg:bg-transparent lg:p-0" : "hidden"
        }`}
      >
        {selectedRow && state ? (
          <AppointmentDetail key={selectedRow.id} row={selectedRow} state={state} listSize={listSize} baseTotal={base.length} onClose={() => setSelected(null)} onOpen={setSelected} />
        ) : (
          <div className="rounded-xl border border-dashed border-line-strong p-6 text-sm text-muted">
            Elija una cita para ver el riesgo explicado, la conversación y la bitácora, y para actuar.
          </div>
        )}
      </aside>
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Indicators({
  counts,
  total,
  onPick,
  active,
}: {
  counts: Record<Status, number> & { high: number; contacted: number; newFromWaitlist: number };
  total: number;
  onPick: (s: Status | "") => void;
  active: Status | "";
}) {
  const items: { label: string; value: number; status?: Status; hint?: string }[] = [
    { label: "Riesgo alto", value: counts.high, hint: `de ${num(total)}` },
    { label: "Recordatorio enviado", value: counts.recordatorio_enviado, status: "recordatorio_enviado", hint: "esperan respuesta" },
    { label: "Confirmadas", value: counts.confirmada, status: "confirmada" },
    { label: "Sin respuesta", value: counts.sin_respuesta, status: "sin_respuesta" },
    { label: "Cupos liberados", value: counts.liberada, status: "liberada", hint: "por reasignar" },
    { label: "Reasignadas", value: counts.reasignada, status: "reasignada", hint: "a la lista de espera" },
    { label: "Piden una persona", value: counts.derivada_a_persona, status: "derivada_a_persona" },
  ];
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
      {items.map((it) => {
        const on = it.status && active === it.status;
        const content = (
          <>
            <span className="block text-2xl font-bold tabular-nums leading-none">{num(it.value)}</span>
            <span className="mt-1.5 block text-sm font-medium">{it.label}</span>
            {it.hint && <span className="block text-xs text-muted">{it.hint}</span>}
          </>
        );
        return (
          <li key={it.label}>
            {it.status ? (
              <button
                onClick={() => onPick(on ? "" : it.status!)}
                aria-pressed={Boolean(on)}
                className={`press h-full w-full rounded-xl border px-3 py-2.5 text-left ${on ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-line-strong"}`}
              >
                {content}
              </button>
            ) : (
              <div className="h-full rounded-xl border border-line bg-surface px-3 py-2.5">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TabButton({ id, tab, setTab, label, count, attention }: { id: Tab; tab: Tab; setTab: (t: Tab) => void; label: string; count: number; attention?: boolean }) {
  const on = tab === id;
  return (
    <button
      role="tab"
      aria-selected={on}
      onClick={() => setTab(id)}
      className={`-mb-px flex items-center gap-2 rounded-t-lg border px-3 py-2 text-sm font-medium ${
        on ? "border-line border-b-surface bg-surface text-ink" : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {label}
      <span className={`rounded-full px-1.5 text-xs tabular-nums ${attention ? "bg-st-free text-white" : "bg-st-neutral-soft text-muted"}`}>{num(count)}</span>
    </button>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="max-w-48 rounded-lg border border-line-strong bg-surface px-2 py-2 text-sm">
        <option value="">Todos</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

const AppointmentRow = memo(function AppointmentRow({
  row,
  state,
  inList,
  selected,
  flashKey,
  onSelect,
}: {
  row: Row;
  state: DemoState | null;
  inList: boolean;
  selected: boolean;
  flashKey?: number;
  onSelect: (id: number) => void;
}) {
  const level = state ? riskLevel(row.risk, state) : null;
  const p = row.patient;
  return (
    <div
      role="row"
      key={flashKey}
      className={`row-cv grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-line px-4 py-2.5 last:border-b-0 md:grid-cols-[150px_minmax(0,1fr)_minmax(0,0.9fr)_190px_110px] md:items-center ${
        selected ? "bg-brand-soft" : "hover:bg-sunken"
      } ${flashKey ? "flash" : ""}`}
      onClick={() => onSelect(row.id)}
    >
      <span role="cell">
        {row.origin === "lista_espera" ? (
          <span className="text-sm font-medium text-st-done">Lista de espera</span>
        ) : (
          <RiskTag level={level} risk={row.risk} />
        )}
      </span>
      <span role="cell" className="min-w-0">
        <button
          className="block max-w-full truncate text-left font-semibold hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(row.id);
          }}
        >
          {p.full_name}
        </button>
        <span className="block truncate text-xs text-muted">
          {p.age} años{p.caregiver_name ? ` · responde ${p.caregiver_relation}` : ""}
          {inList ? " · en la lista de llamadas" : ""}
        </span>
      </span>
      <span role="cell" className="col-start-2 min-w-0 text-sm md:col-start-auto">
        <span className="block truncate">{row.specialty}</span>
        <span className="text-xs text-muted">
          {row.time}
          {row.remote ? " · teleconsulta" : ""}
        </span>
      </span>
      <span role="cell" className="col-start-2 md:col-start-auto">
        <StatusBadge status={row.status} small />
      </span>
      <span role="cell" className="col-start-2 md:col-start-auto md:text-right">
        <QuickAction row={row} onSelect={onSelect} />
      </span>
    </div>
  );
});

function QuickAction({ row, onSelect }: { row: Row; onSelect: (id: number) => void }) {
  const [busy, setBusy] = useState(false);
  if (row.status === "sin_respuesta") {
    return (
      <Button
        className="min-h-8 px-2.5 text-xs"
        disabled={busy}
        onClick={async (e) => {
          e.stopPropagation();
          setBusy(true);
          try {
            await post("/api/staff", { action: "call", appointmentId: row.id });
            toast(`Llamando a ${row.patient.short_name}…`, { description: "El asistente automático está marcando." });
          } catch (err) {
            toast.error((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <PhoneCall className="size-3.5" aria-hidden /> Llamar
      </Button>
    );
  }
  if (row.status === "liberada") {
    return (
      <Button
        className="min-h-8 border-st-free/40 px-2.5 text-xs text-st-free"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(row.id);
        }}
      >
        <ArrowRightLeft className="size-3.5" aria-hidden /> Reasignar
      </Button>
    );
  }
  return null;
}
