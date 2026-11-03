"use client";

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  CalendarDays,
  CalendarX2,
  CircleCheck,
  MessageSquareText,
  PhoneCall,
  PhoneOff,
  Repeat2,
  Search,
  Send,
  SlidersHorizontal,
  TriangleAlert,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button, RiskTag, StatusBadge } from "@/components/ui";
import { post } from "@/lib/post";
import { useDemoState, useNow, useStaffTick } from "@/lib/realtime";
import { STATUS, STATUS_ORDER, demoNowMin, fmtMin, num, pct, riskLevel, years, type RiskLevel } from "@/lib/labels";
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
  const [shown, setShown] = useState<number | null>(null); // kept while the pane slides out
  const [sending, setSending] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferredQuery = useDeferredValue(query);
  useStaffTick(Boolean(state?.clock_started_at));

  const open = useCallback((id: number) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setSelected(id);
    setShown(id);
  }, []);
  const close = useCallback(() => {
    setSelected(null);
    closeTimer.current = setTimeout(() => setShown(null), 450);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const all = useMemo(() => [...rows.values()], [rows]);
  const base = useMemo(() => all.filter((r) => r.is_base), [all]);
  const listSize = state ? Math.floor(base.length * state.call_list_pct) : 0;
  const specialties = useMemo(() => [...new Set(base.map((r) => r.specialty))].sort((a, b) => a.localeCompare(b, "es")), [base]);

  const counts = useMemo(() => {
    const c: Record<string, number> = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0]));
    for (const r of base) c[r.status]++;
    c.high = state ? base.filter((r) => riskLevel(r.risk, state) === "alto").length : 0;
    return c;
  }, [base, state]);

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
      toast.success(`Recordatorios enviados a ${num(sent)} citas`, { description: "Las respuestas aparecerán aquí al instante." });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  const shownRow = shown != null ? rows.get(shown) : undefined;
  const isOpen = selected != null;
  const filtersOn = Boolean(query || specialty || risk || status);
  const pending = counts.pendiente;

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      <div className="panel-layout" data-open={isOpen}>
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight">Citas de mañana</h1>
              <div className="mt-2.5 flex flex-wrap gap-2 text-sm">
                <Chip icon={CalendarDays}>{state?.day_label ? `${capitalize(state.day_label)} de 2023` : "…"}</Chip>
                <Chip icon={UsersRound}>{num(base.length)} citas</Chip>
                <DemoClock state={state} />
              </div>
            </div>
            <div className="flex flex-col items-start gap-1.5 sm:items-end">
              <Button
                variant="primary"
                onClick={sendReminders}
                disabled={sending || loading || pending === 0}
                className="min-h-11 rounded-full px-5 shadow-[0_10px_24px_-12px_rgba(14,90,87,0.9)]"
              >
                <Send className="size-4" aria-hidden />
                {pending === 0 && base.length ? "Recordatorios enviados" : sending ? "Enviando…" : `Enviar recordatorios (${num(pending)})`}
              </Button>
              {state?.reminders_sent_min != null && (
                <span className="text-xs text-muted">
                  A las {fmtMin(state.reminders_sent_min)} · plazo {state.reply_deadline_min / 60} h
                </span>
              )}
            </div>
          </div>

          <Indicators
            counts={counts}
            active={status}
            onPick={(s) => {
              setTab("todas");
              setStatus(s);
            }}
          />

          <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-3">
              <div role="tablist" aria-label="Vistas" className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-sunken p-1 [scrollbar-width:none]">
                <TabButton id="todas" tab={tab} setTab={setTab} label="Todas" count={all.length} />
                <TabButton
                  id="llamadas"
                  tab={tab}
                  setTab={setTab}
                  label="Lista de llamadas"
                  count={listSize}
                  title={`El ${state ? pct(state.call_list_pct) : "10 %"} de mayor riesgo: si no responden, se les llama`}
                />
                <TabButton id="sin_respuesta" tab={tab} setTab={setTab} label="Sin respuesta" count={counts.sin_respuesta + counts.en_llamada} attention={counts.sin_respuesta > 0 ? "warn" : undefined} />
                <TabButton id="liberadas" tab={tab} setTab={setTab} label="Por reasignar" count={counts.liberada} attention={counts.liberada > 0 ? "free" : undefined} />
              </div>
              <label className="relative ml-auto min-w-48 flex-1 sm:max-w-72">
                <span className="sr-only">Buscar paciente</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
                <input
                  type="search"
                  name="buscar"
                  autoComplete="off"
                  spellCheck={false}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar paciente…"
                  className="w-full rounded-full border border-line bg-sunken py-2 pl-9 pr-3 text-sm transition-colors focus:bg-surface"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-2">
              <SlidersHorizontal className="size-4 text-faint" aria-hidden />
              <Select label="Especialidad" value={specialty} onChange={setSpecialty} options={specialties.map((x) => [x, x])} />
              <Select label="Riesgo" value={risk} onChange={(v) => setRisk(v as RiskLevel | "")} options={[["alto", "Alto"], ["medio", "Medio"], ["bajo", "Bajo"]]} />
              <Select label="Estado" value={status} onChange={(v) => setStatus(v as Status | "")} options={STATUS_ORDER.map((x) => [x, STATUS[x].label])} />
              {filtersOn && (
                <button
                  onClick={() => {
                    setQuery("");
                    setSpecialty("");
                    setRisk("");
                    setStatus("");
                  }}
                  className="press ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium text-muted hover:bg-sunken hover:text-ink"
                >
                  <X className="size-3.5" aria-hidden /> Limpiar
                </button>
              )}
            </div>
            <div role="table" aria-label="Citas" aria-rowcount={visible.length}>
              <div role="row" className="hidden grid-cols-[140px_minmax(0,1.2fr)_minmax(0,0.9fr)_180px_104px] gap-3 border-b border-line px-4 py-2 text-xs font-semibold text-faint md:grid">
                <span role="columnheader">Riesgo</span>
                <span role="columnheader">Paciente</span>
                <span role="columnheader">Cita</span>
                <span role="columnheader">Estado</span>
                <span role="columnheader" className="text-right">Acción</span>
              </div>
              {loading && <p className="px-4 py-12 text-center text-muted">Cargando citas…</p>}
              {error && <p className="px-4 py-12 text-center text-risk-alto">No se pudieron cargar las citas. {error}</p>}
              {!loading && !visible.length && (
                <p className="px-4 py-12 text-center text-muted">{tab === "liberadas" ? "Todavía no hay cupos liberados." : "Ninguna cita coincide."}</p>
              )}
              {visible.map((r) => (
                <AppointmentRow
                  key={r.id}
                  row={r}
                  state={state}
                  inList={r.is_base && r.risk_rank != null && r.risk_rank <= listSize}
                  selected={selected === r.id}
                  flashKey={flash.get(r.id)}
                  onSelect={open}
                />
              ))}
            </div>
          </div>
        </div>

        <aside className="detail-pane" data-open={isOpen} aria-hidden={!isOpen} aria-label="Detalle de la cita">
          <div className="detail-inner">
            {shownRow && state && (
              <AppointmentDetail key={shownRow.id} row={shownRow} state={state} listSize={listSize} baseTotal={base.length} onClose={close} onOpen={open} />
            )}
          </div>
        </aside>
        <button type="button" className="detail-backdrop" data-open={isOpen} onClick={close} aria-label="Cerrar detalle" tabIndex={-1} />
      </div>
    </div>
  );
}

function capitalize(x: string) {
  return x.charAt(0).toUpperCase() + x.slice(1);
}

function Chip({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-muted ring-1 ring-line">
      <Icon className="size-3.5" aria-hidden />
      {children}
    </span>
  );
}

function DemoClock({ state }: { state: DemoState | null }) {
  const now = useNow(1000);
  const running = Boolean(state?.clock_started_at);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 ring-1 ring-line" title="Hora simulada de la demo: el día anterior a las citas">
      <span className={`size-2 rounded-full ${running ? "animate-pulse bg-st-ok" : "bg-line-strong"}`} aria-hidden />
      <span className="text-muted">Hoy</span>
      <span className="font-semibold tabular-nums">{state ? fmtMin(demoNowMin(state, now)) : "--:--"}</span>
    </span>
  );
}

const INDICATORS: { key: string; label: string; status?: Status; icon: LucideIcon; tone: string }[] = [
  { key: "high", label: "Riesgo alto", icon: TriangleAlert, tone: "bg-risk-alto-soft text-risk-alto" },
  { key: "recordatorio_enviado", label: "Esperan respuesta", status: "recordatorio_enviado", icon: MessageSquareText, tone: "bg-st-sent-soft text-st-sent" },
  { key: "confirmada", label: "Confirmadas", status: "confirmada", icon: CircleCheck, tone: "bg-st-ok-soft text-st-ok" },
  { key: "sin_respuesta", label: "Sin respuesta", status: "sin_respuesta", icon: PhoneOff, tone: "bg-st-warn-soft text-st-warn" },
  { key: "liberada", label: "Cupos libres", status: "liberada", icon: CalendarX2, tone: "bg-st-free-soft text-st-free" },
  { key: "reasignada", label: "Reasignadas", status: "reasignada", icon: Repeat2, tone: "bg-st-done-soft text-st-done" },
  { key: "derivada_a_persona", label: "Piden una persona", status: "derivada_a_persona", icon: UserRound, tone: "bg-st-human-soft text-st-human" },
];

function Indicators({ counts, onPick, active }: { counts: Record<string, number>; onPick: (s: Status | "") => void; active: Status | "" }) {
  return (
    <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-7">
      {INDICATORS.map((it) => {
        const on = Boolean(it.status && active === it.status);
        const value = counts[it.key] ?? 0;
        const body = (
          <>
            <span className={`grid size-9 place-items-center rounded-xl ${it.tone}`}>
              <it.icon className="size-[18px]" aria-hidden />
            </span>
            <span className="mt-3 block font-display text-[28px] font-bold leading-none tabular-nums">
              <span key={value} className="bump inline-block">
                {num(value)}
              </span>
            </span>
            <span className="mt-1 block text-sm text-muted">{it.label}</span>
          </>
        );
        return (
          <li key={it.key}>
            {it.status ? (
              <button
                onClick={() => onPick(on ? "" : it.status!)}
                aria-pressed={on}
                className={`press h-full w-full rounded-2xl bg-surface p-3.5 text-left ring-1 transition-shadow duration-200 hover:shadow-[0_8px_24px_-14px_rgba(22,33,44,0.45)] ${
                  on ? "ring-2 ring-brand" : "ring-line"
                }`}
              >
                {body}
              </button>
            ) : (
              <div className="h-full rounded-2xl bg-surface p-3.5 ring-1 ring-line">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TabButton({
  id,
  tab,
  setTab,
  label,
  count,
  attention,
  title,
}: {
  id: Tab;
  tab: Tab;
  setTab: (t: Tab) => void;
  label: string;
  count: number;
  attention?: "warn" | "free";
  title?: string;
}) {
  const on = tab === id;
  return (
    <button
      role="tab"
      aria-selected={on}
      title={title}
      onClick={() => setTab(id)}
      className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 ${
        on ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 text-xs tabular-nums ${
          attention === "warn" ? "bg-st-warn text-white" : attention === "free" ? "bg-st-free text-white" : "bg-line/70 text-muted"
        }`}
      >
        {num(count)}
      </span>
    </button>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`max-w-48 rounded-full border bg-surface px-3 py-1.5 text-sm ${value ? "border-brand text-brand" : "border-line"}`}
      >
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

const AVATAR: Record<string, string> = {
  alto: "bg-risk-alto-soft text-risk-alto",
  medio: "bg-risk-medio-soft text-risk-medio",
  bajo: "bg-risk-bajo-soft text-risk-bajo",
  none: "bg-st-done-soft text-st-done",
};

function initials(name: string) {
  const [a, b] = name.split(" ");
  return `${a?.[0] ?? ""}${b?.[0] ?? ""}`;
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
      className={`row-cv grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2.5 transition-colors duration-150 last:border-b-0 md:grid-cols-[140px_minmax(0,1.2fr)_minmax(0,0.9fr)_180px_104px] ${
        selected ? "bg-brand-soft/70 shadow-[inset_3px_0_0_var(--color-brand)]" : "hover:bg-sunken"
      } ${flashKey ? "flash" : ""}`}
      onClick={() => onSelect(row.id)}
    >
      <span role="cell">
        {row.origin === "lista_espera" ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-st-done-soft px-2 py-0.5 text-sm font-semibold text-st-done">
            <Repeat2 className="size-3.5" aria-hidden /> Nueva
          </span>
        ) : (
          <RiskTag level={level} risk={row.risk} />
        )}
      </span>
      <span role="cell" className="flex min-w-0 items-center gap-3">
        <span className={`hidden size-9 shrink-0 place-items-center rounded-full text-xs font-bold md:grid ${AVATAR[level ?? "none"]}`} aria-hidden>
          {initials(p.full_name)}
        </span>
        <span className="min-w-0">
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
            {years(p.age)}
            {p.caregiver_relation ? ` · responde ${p.caregiver_relation}` : ""}
            {inList ? " · lista de llamadas" : ""}
          </span>
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
        className="min-h-8 rounded-full px-3 text-xs"
        disabled={busy}
        onClick={async (e) => {
          e.stopPropagation();
          setBusy(true);
          try {
            await post("/api/staff", { action: "call", appointmentId: row.id });
            toast(`Llamando a ${row.patient.short_name}…`);
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
        className="min-h-8 rounded-full border-st-free/40 px-3 text-xs text-st-free"
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
