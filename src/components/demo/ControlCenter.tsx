"use client";

// /demo, main view: the control center projected to the jury. Props only (DemoControls owns the data and the calls).
// One screen without scrolling at 1280×720 and 1920×1080: the script steps on the left, the patient journey across
// the top (with the jury QR, where the journey starts), and underneath the three live things: calls, freed slots and
// the waiting list. Sober public-health styling (NHS / USWDS): flat surfaces, 1 px borders, small radii, Public Sans.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  ArrowRightLeft,
  AudioLines,
  CalendarClock,
  Check,
  Clock3,
  ExternalLink,
  FastForward,
  LayoutDashboard,
  ListOrdered,
  PhoneIncoming,
  PhoneOff,
  QrCode,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  Users,
  Wrench,
} from "lucide-react";
import { DISCLAIMER, REQUEST_STATE, demoDayLabel, demoNowMin, fmtMin, num, type RequestState } from "@/lib/labels";
import type { DemoState } from "@/lib/types";
import type { DemoOverview, OverviewEvent, OverviewSlot, OverviewWaitRow } from "@/lib/demo-overview";
import type { CallRow, LiveData } from "./LiveSection";
import type { VoiceOverview } from "./VoiceSessionsCard";

export type Rule = DemoOverview["rule"];
type Run = (action: string, body?: Record<string, unknown>, success?: string) => void;

export type ControlCenterProps = {
  state: DemoState | null;
  now: number;
  busy: string;
  run: Run;
  overview: DemoOverview | null;
  live: LiveData | null;
  voice: VoiceOverview | null;
  publicQr?: { url: string; svg: string };
};

const NBSP = " ";
const RULE_TEXT: Record<Rule, { short: string; long: string }> = {
  ventana_prioridad: {
    short: "Mayor prioridad al cierre",
    long: "Al cerrar la ventana gana quien tiene mayor prioridad entre quienes aceptaron, no quien respondió primero.",
  },
  primero_acepta: { short: "Primero que acepta", long: "El cupo es para el primero que acepta (la variante de Mayo Clinic, para compararlas)." },
};

/** keeps the main view exactly one screen tall on wide screens (the header height is measured, not guessed) */
function useScreenTall(): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => el.style.setProperty("--cc-top", `${Math.round(el.getBoundingClientRect().top + window.scrollY)}px`);
    set();
    window.addEventListener("resize", set);
    return () => window.removeEventListener("resize", set);
  }, []);
  return ref;
}

/** how many fixed-height rows fit in a list on the one-screen layout (a fixed number when the page stacks) */
function useFit(row: number, rowWide: number, gap: number, stacked: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(stacked);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wide = window.matchMedia("(min-width: 1280px)");
    const big = window.matchMedia("(min-width: 1536px) and (min-height: 900px)");
    const ro = new ResizeObserver(([e]) => {
      if (!wide.matches) return setN(stacked);
      const h = big.matches ? rowWide : row;
      setN(Math.max(1, Math.floor((e.contentRect.height + gap) / (h + gap))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [row, rowWide, gap, stacked]);
  return [ref, n] as const;
}

const prefersReduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** a short outline when `k` changes after the first render (something new reached this place) */
function useFlash<T extends HTMLElement>(k: string | number | null | undefined) {
  const ref = useRef<T>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (k == null || !ref.current || prefersReduced()) return;
    const c = getComputedStyle(ref.current).getPropertyValue("--cc-accent").trim() || "#0b6459";
    ref.current.animate([{ outline: `3px solid ${c}`, outlineOffset: "1px" }, { outline: "3px solid transparent", outlineOffset: "1px" }], {
      duration: 1200,
      easing: "ease-out",
    });
  }, [k]);
  return ref;
}

// ------------------------------------------------------------------------------------------------ the screen

export function ControlCenter({ state, now, busy, run, overview, live, voice, publicQr }: ControlCenterProps) {
  const ref = useScreenTall();
  return (
    <div
      ref={ref}
      className="mx-auto flex max-w-[2200px] flex-col gap-2 px-4 pb-1.5 pt-3 xl:h-[max(560px,calc(100dvh-var(--cc-top,61px)))] xl:overflow-hidden 2xl:gap-3 2xl:px-6 2xl:pt-4"
    >
      <div className="grid min-h-0 flex-1 gap-3 [&>*]:min-w-0 xl:grid-cols-[clamp(270px,20vw,340px)_minmax(0,1fr)_minmax(0,1fr)_clamp(270px,21vw,420px)] xl:grid-rows-[auto_minmax(0,1fr)] 2xl:gap-4">
        <StepsRail state={state} now={now} busy={busy} run={run} day={overview?.stages.confirmacion.day ?? null} />
        <Journey overview={overview} remindersSent={state?.reminders_sent_min != null} qr={publicQr ? <JuryQr qr={publicQr} /> : null} />
        <CallsPanel live={live} voice={voice} now={now} busy={busy} run={run} />
        <SlotsPanel overview={overview} busy={busy} run={run} now={now} state={state} />
        <WaitlistPanel overview={overview} />
      </div>
      {/* the demo notice: one discreet line at the foot of the screen, always in view */}
      <p className="truncate text-[13px] text-(--cc-text-2) 2xl:text-[15px]">{DISCLAIMER}</p>
    </div>
  );
}

function Panel({ children, className = "", label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <section aria-label={label} className={`flex min-h-0 min-w-0 flex-col rounded-[6px] border border-(--cc-border) bg-(--cc-surface) p-3.5 2xl:p-5 ${className}`}>
      {children}
    </section>
  );
}

function PanelTitle({ icon, children, meta }: { icon: ReactNode; children: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-(--cc-border) pb-2">
      <h2 className="flex items-center gap-2 text-[18px] font-bold leading-tight 2xl:text-[22px]">
        {icon}
        {children}
      </h2>
      {meta && <p className="text-[14px] tabular-nums text-(--cc-text-2) 2xl:text-[16px]">{meta}</p>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ steps of DEMO.md

function StepsRail({ state, now, busy, run, day }: { state: DemoState | null; now: number; busy: string; run: Run; day: number | null }) {
  const started = Boolean(state?.clock_started_at);
  const nowMin = state ? demoNowMin(state, now) : null;
  const sent = state?.reminders_sent_min ?? null;
  const deadlineAt = sent != null && state ? sent + state.reply_deadline_min : null;
  const deadlinePassed = deadlineAt != null && nowMin != null && nowMin >= deadlineAt;
  return (
    <Panel label="Guion de la demo" className="gap-2 xl:row-span-2 2xl:gap-3">
      <div className="border-b border-(--cc-border) pb-1.5">
        <h2 className="text-[18px] font-bold leading-tight 2xl:text-[22px]">Guion de la demo</h2>
        <p className="mt-1 flex items-baseline gap-1.5 whitespace-nowrap text-[13px] text-(--cc-text-2) 2xl:text-[15px]">
          <Clock3 className="size-4 self-center text-(--cc-accent) 2xl:size-5" aria-hidden />
          <span className="sr-only">Hora de la demo:</span>
          <strong className="text-[24px] font-bold leading-none tabular-nums text-(--cc-text) 2xl:text-[30px]">{nowMin != null ? fmtMin(nowMin) : "--:--"}</strong>
          <span className="truncate">
            {state ? (started ? `avanza ×${state.speed}` : "reloj detenido") : ""} · {nowMin != null ? demoDayLabel(nowMin) : ""}
          </span>
        </p>
      </div>

      <ol className="flex flex-col gap-2 2xl:gap-3" aria-label="Pasos del guion de la demo">
        <StepLink n="0" title="Preparar" detail="Vincular el chat a Julio y probar llamadas" href="#herramientas" icon={<Wrench className="size-4" aria-hidden />} same />
        <StepLink n="1–2" title="Regulador" detail="Asigna P1 a P4 sin ver quién es" href="/regulador" icon={<ShieldCheck className="size-4" aria-hidden />} />
        <StepAction
          n="3"
          title={`Enviar recordatorios (72${NBSP}h)`}
          detail={day ? `Mensaje a las ${num(day)} citas del jueves. Arranca el reloj.` : "Mensaje a las citas del jueves. Arranca el reloj."}
          done={sent != null ? `Enviados a las ${fmtMin(sent)}` : null}
          primary={sent == null}
          busy={busy === "reminders"}
          disabled={!!busy}
          onClick={() => run("reminders", {}, "Recordatorios enviados a {n} citas")}
        />
        <StepAction
          n="4"
          title="Cerrar el plazo de respuesta"
          detail={`La cita se mantiene; el asistente llama al 10${NBSP}% de mayor riesgo.`}
          done={deadlinePassed && deadlineAt != null ? `Cerrado a las ${fmtMin(deadlineAt)}` : null}
          primary={sent != null && !deadlinePassed}
          busy={busy === "advance"}
          disabled={!!busy || !started}
          onClick={() => run("advance", { minutes: state?.reply_deadline_min ?? 180 }, "Plazo de respuesta cumplido")}
          extra={
            <button
              type="button"
              disabled={!!busy || !started}
              onClick={() => run("advance", { minutes: 30 }, "Reloj adelantado 30 minutos")}
              className={`cc-press inline-flex min-h-8 items-center gap-1.5 rounded-[4px] border border-(--cc-control) bg-(--cc-surface) px-2.5 text-[13px] font-semibold hover:bg-(--cc-subtle) disabled:opacity-50 2xl:min-h-10 2xl:text-[15px]`}
            >
              <FastForward className="size-3.5" aria-hidden /> Adelantar 30 min
            </button>
          }
        />
        <StepLink n="5–7" title="Por reasignar y validar" detail="Aprobar la oferta, validar, efecto dominó" href="/panel?vista=reasignar" icon={<ArrowRightLeft className="size-4" aria-hidden />} />
        <StepLink n="8" title="Tablero" detail="Equidad y consultas netas adicionales" href="/tablero" icon={<LayoutDashboard className="size-4" aria-hidden />} />
      </ol>

      <ResetButton busy={busy} run={run} />
    </Panel>
  );
}

function StepNumber({ n, done }: { n: string; done?: boolean }) {
  return (
    <span
      className={`grid h-7 min-w-7 shrink-0 place-items-center rounded-[3px] border px-1 text-[14px] font-bold tabular-nums 2xl:h-9 2xl:min-w-9 2xl:text-[16px] ${
        done ? "border-(--cc-ok) text-(--cc-ok)" : "border-current"
      }`}
      aria-hidden
    >
      {done ? <Check className="size-4 2xl:size-5" /> : n}
    </span>
  );
}

function StepLink({ n, title, detail, href, icon, same }: { n: string; title: string; detail: string; href: string; icon: ReactNode; same?: boolean }) {
  return (
    <li>
      <a
        href={href}
        target={same ? undefined : "_blank"}
        rel={same ? undefined : "noreferrer"}
        className={`cc-press flex items-center gap-2.5 rounded-[4px] border border-(--cc-border) px-2.5 py-1.5 hover:border-(--cc-control) hover:bg-(--cc-subtle) 2xl:gap-3 2xl:px-3 2xl:py-2.5`}
      >
        <StepNumber n={n} />
        <span className="min-w-0 flex-1">
          <span className="sr-only">Paso {n}: </span>
          <span className="flex items-center gap-1.5 text-[15px] font-semibold leading-tight text-(--cc-accent) underline decoration-1 underline-offset-[3px] 2xl:text-[18px]">
            {icon}
            {title}
          </span>
          <span className="block truncate text-[13px] leading-snug text-(--cc-text-2) [@media(max-height:760px)]:hidden 2xl:text-[15px]">{detail}</span>
        </span>
        {same ? null : <ExternalLink className="size-4 shrink-0 text-(--cc-accent)" aria-label="Se abre en otra pestaña" />}
      </a>
    </li>
  );
}

function StepAction(p: {
  n: string;
  title: string;
  detail: string;
  done: string | null;
  primary: boolean;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  extra?: ReactNode;
}) {
  return (
    <li className="rounded-[4px] border border-(--cc-border) p-2 2xl:p-3">
      <button
        type="button"
        disabled={p.disabled}
        onClick={p.onClick}
        className={`cc-press flex min-h-12 w-full items-center gap-2.5 rounded-[4px] border-2 px-2.5 text-left font-bold disabled:opacity-50 2xl:min-h-14 2xl:gap-3 ${
          p.primary
            ? "border-(--cc-primary) bg-(--cc-primary) text-(--cc-on-primary) active:bg-(--cc-primary-press)"
            : "border-(--cc-control) bg-(--cc-surface) text-(--cc-text) hover:bg-(--cc-subtle)"
        }`}
      >
        <span className="sr-only">Paso {p.n}: </span>
        <StepNumber n={p.n} done={!!p.done && !p.primary} />
        <span className="flex-1 text-[15px] leading-tight 2xl:text-[19px]">{p.busy ? "Un momento…" : p.title}</span>
      </button>
      <p className="mt-1.5 px-0.5 text-[13px] leading-snug text-(--cc-text-2) 2xl:text-[15px]">
        {p.done ? (
          <span className={`cc-swap mr-1 inline-flex items-center gap-1 font-semibold text-(--cc-ok)`}>
            <Check className="size-3.5" aria-hidden /> {p.done}.
          </span>
        ) : null}
        {p.detail}
      </p>
      {p.extra && <div className="mt-1.5">{p.extra}</div>}
    </li>
  );
}

/** destructive and separated: asks in place before resetting (no browser dialog on the projector) */
function ResetButton({ busy, run }: { busy: string; run: Run }) {
  const [ask, setAsk] = useState(false);
  return (
    <div className="relative mt-auto border-t border-(--cc-border) pt-2 2xl:pt-3">
      {ask && (
        <div
          role="alertdialog"
          aria-labelledby="reset-q"
          aria-describedby="reset-d"
          className={`cc-swap absolute inset-x-0 bottom-full mb-2 rounded-[4px] border-2 border-(--cc-danger) bg-(--cc-surface) p-3`}
        >
          <p id="reset-q" className="flex items-center gap-1.5 font-bold">
            <TriangleAlert className="size-4 text-(--cc-danger)" aria-hidden /> ¿Reiniciar la demo?
          </p>
          <p id="reset-d" className="mt-1 text-[13px] leading-snug text-(--cc-text-2)">
            Se borran mensajes, llamadas, ofertas, asignaciones, solicitudes nuevas y las sesiones de chat en vivo. Todo vuelve a los datos fijos.
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => {
                setAsk(false);
                run("reset", {}, "Demo reiniciada");
              }}
              className={`cc-press min-h-10 flex-1 rounded-[4px] bg-(--cc-danger) px-3 text-[14px] font-bold text-(--cc-on-danger) disabled:opacity-50`}
            >
              Sí, reiniciar
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => setAsk(false)}
              className={`cc-press min-h-10 flex-1 rounded-[4px] border border-(--cc-control) bg-(--cc-surface) px-3 text-[14px] font-semibold hover:bg-(--cc-subtle)`}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        disabled={!!busy}
        aria-expanded={ask}
        onClick={() => setAsk((v) => !v)}
        className={`cc-press inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[4px] border border-(--cc-danger) bg-(--cc-surface) px-3 text-[14px] font-semibold text-(--cc-danger) hover:bg-(--cc-danger-subtle) disabled:opacity-50 2xl:min-h-12 2xl:text-[16px]`}
      >
        <RotateCcw className="size-4" aria-hidden /> {busy === "reset" ? "Reiniciando…" : "Reiniciar demo"}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ patient journey

function Journey({ overview, remindersSent, qr }: { overview: DemoOverview | null; remindersSent: boolean; qr: ReactNode }) {
  const s = overview?.stages;
  const stations: StationProps[] = [
    { n: 1, title: "Registro de la demanda", value: s?.registro.total, unit: "solicitudes", sub: s ? `${num(s.registro.without_slot)} todavía sin cupo` : "", last: s?.registro.last },
    {
      n: 2,
      title: "Regulación ciega",
      value: s?.regulacion.pending,
      unit: "por regular",
      sub: s ? `${num(s.regulacion.regulated)} con categoría, sin ver nombre ni contacto` : "",
      last: s?.regulacion.last,
    },
    {
      n: 3,
      title: "Lista de espera",
      value: s?.espera.waiting,
      unit: "en espera",
      sub: s ? `${num(s.espera.over_deadline)} pasaron su plazo máximo` : "",
      last: s?.espera.last,
      lastLabel: "Primero",
    },
    {
      n: 4,
      title: "Confirmación escalonada",
      value: s?.confirmacion.confirmed,
      unit: s ? `confirmadas de ${num(s.confirmacion.day)}` : "confirmadas",
      sub: s ? `${num(s.confirmacion.released)} liberadas · ${num(s.confirmacion.unanswered)} sin respuesta · ${num(s.confirmacion.calls)} llamadas` : "",
      last: s?.confirmacion.last,
      empty: remindersSent ? "Esperando respuestas" : "Empieza con el paso 3",
    },
    {
      n: 5,
      title: "Reasignación por zonas",
      value: s?.reasignacion.filled,
      unit: s ? `llenados de ${num(s.reasignacion.freed)} liberados` : "cupos llenados",
      sub: s ? `${num(s.reasignacion.offers)} ofertas simultáneas · ${num(s.reasignacion.accepted)} aceptaron` : "",
      last: s?.reasignacion.last,
      empty: "Ninguna oferta aprobada",
    },
    {
      n: 6,
      title: "Validación y dominó",
      value: s?.validacion.confirmed,
      unit: "citas validadas",
      sub: s ? `${num(s.validacion.pending)} por validar · ${num(s.validacion.domino)} por dominó · ${num(s.validacion.reverted)} revertidas` : "",
      last: s?.validacion.last,
      empty: "Aún sin asignaciones",
    },
  ];
  return (
    <section
      aria-label="Recorrido del paciente"
      className="grid gap-3 rounded-[6px] border border-(--cc-border) bg-(--cc-surface) p-2.5 sm:grid-cols-[auto_minmax(0,1fr)] xl:col-span-3 2xl:gap-4 2xl:p-3"
    >
      <h2 className="sr-only">Recorrido del paciente</h2>
      {qr}
      <ol className="grid grid-cols-2 gap-y-3 sm:grid-cols-3 xl:grid-cols-6">
        {stations.map((st) => (
          <Station key={st.n} {...st} />
        ))}
      </ol>
    </section>
  );
}

type StationProps = {
  n: number;
  title: string;
  value: number | undefined;
  unit: string;
  sub: string;
  last: OverviewEvent | undefined;
  lastLabel?: string;
  empty?: string;
};

function Station({ n, title, value, unit, sub, last, lastLabel = "Último", empty = "Sin movimiento todavía" }: StationProps) {
  const ref = useFlash<HTMLLIElement>(last?.id);
  const active = (value ?? 0) > 0 || last != null;
  return (
    <li ref={ref} className="min-w-0 border-l border-(--cc-border) px-2 py-0.5 2xl:px-3.5 2xl:py-1">
      <h3 className="flex items-start gap-1.5 text-[14px] font-bold leading-tight 2xl:text-[17px]">
        <span
          aria-hidden
          className={`grid size-[22px] shrink-0 place-items-center rounded-[3px] text-[13px] 2xl:size-7 2xl:text-[15px] ${
            active ? "bg-(--cc-primary) text-(--cc-on-primary)" : "border border-(--cc-control) text-(--cc-text)"
          }`}
        >
          {n}
        </span>
        <span className="line-clamp-2 min-w-0">
          <span className="sr-only">Etapa {n}: </span>
          {title}
        </span>
      </h3>
      <p key={value} className={`cc-swap mt-1.5 text-[30px] font-bold leading-none tabular-nums 2xl:text-[42px]`}>
        {value == null ? "—" : num(value)}
      </p>
      <p className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-snug 2xl:text-[16px]">{unit}</p>
      <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-(--cc-text-2) [@media(max-height:760px)]:line-clamp-1 2xl:text-[15px]">{sub}</p>
      <p key={last?.id ?? "none"} className={`cc-swap mt-1.5 border-l-[3px] border-(--cc-accent) bg-(--cc-subtle) py-1 pl-2 pr-1 text-[13px] leading-snug 2xl:text-[15px]`}>
        <span className="line-clamp-2">
          {last ? (
            <>
              <span className="font-bold">{lastLabel}:</span> {last.text}
              {last.at_min != null && last.at_min >= 0 ? <span className="text-(--cc-text-2)"> · {fmtMin(last.at_min)}</span> : null}
            </>
          ) : (
            <span className="text-(--cc-text-2)">{empty}</span>
          )}
        </span>
      </p>
    </li>
  );
}

function JuryQr({ qr }: { qr: { url: string; svg: string } }) {
  return (
    <section aria-label="Código QR para el jurado" className="flex w-full flex-col items-center rounded-[4px] bg-(--cc-primary) px-2 py-2 sm:w-[132px] text-center text-(--cc-on-primary) 2xl:w-[196px] 2xl:py-3">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-(--cc-on-primary-2) 2xl:text-[15px]">
        <QrCode className="size-4" aria-hidden /> Para el jurado
      </p>
      <div
        className="mt-1 w-[104px] rounded-[2px] bg-(--cc-surface) p-1.5 2xl:mt-1.5 2xl:w-[150px] [&_svg]:h-auto [&_svg]:w-full"
        dangerouslySetInnerHTML={{ __html: qr.svg }}
        role="img"
        aria-label="Código QR de /pedir-cita"
      />
      <p className="mt-1 text-[14px] font-bold leading-tight 2xl:mt-1.5 2xl:text-[18px]">Pida una cita desde su celular</p>
      <a href={qr.url} target="_blank" rel="noreferrer" className="sr-only focus:not-sr-only">
        {qr.url}
      </a>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ calls and voice

const PURPOSE: Record<string, string> = {
  confirmacion: "Confirmación de cita",
  oferta: "Oferta de cupo",
  validacion: "Validación del cupo",
  registro: "Registro por voz",
  prueba: "Llamada de prueba",
};
const PROVIDER: Record<string, string> = { elevenlabs: "voz con IA", guion: "guion fijo", simulado: "simulada" };
type Tone = "ring" | "live" | "done" | "warn";
const TONE_TEXT: Record<Tone, string> = { ring: "text-(--cc-accent)", live: "text-(--cc-ok)", done: "text-(--cc-text-2)", warn: "text-(--cc-warn)" };
const TONE_EDGE: Record<Tone, string> = { ring: "border-l-(--cc-accent)", live: "border-l-(--cc-ok)", done: "border-l-(--cc-border)", warn: "border-l-(--cc-warn)" };

function callState(c: CallRow, voiceState: string | undefined): { label: string; tone: Tone } {
  if (voiceState === "en_cola") return { label: "En la fila", tone: "ring" };
  if (c.status === "sonando") return voiceState === "conectando" || voiceState === "solicitando" ? { label: "Conectando", tone: "ring" } : { label: "Sonando", tone: "ring" };
  if (c.status === "en_curso") return { label: "En llamada", tone: "live" };
  if (c.status === "finalizada") return { label: "Terminada", tone: "done" };
  if (c.status === "no_contesta") return { label: "No contestó", tone: "warn" };
  if (c.status === "rechazada") return { label: "Rechazada", tone: "warn" };
  if (c.status === "fallo") return { label: "Falló", tone: "warn" };
  return { label: c.status, tone: "done" };
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function CallsPanel({ live, voice, now, busy, run }: { live: LiveData | null; voice: VoiceOverview | null; now: number; busy: string; run: Run }) {
  const [listRef, fit] = useFit(62, 74, 6, 4);
  const calls = [...(live?.calls ?? [])].sort((a, b) => {
    const act = (c: CallRow) => Number(c.status === "sonando" || c.status === "en_curso");
    return act(b) - act(a) || b.id - a.id;
  });
  // the newest voice session of each call (the list arrives newest first)
  const voiceOf = new Map<number, { state: string; owner_kind: string }>();
  for (const v of voice?.sessions ?? []) if (!voiceOf.has(v.call_id)) voiceOf.set(v.call_id, v);
  const activeCalls = calls.filter((c) => c.status === "sonando" || c.status === "en_curso").length;
  const shown = calls.slice(0, fit);
  return (
    <Panel label="Llamadas en vivo">
      <PanelTitle
        icon={<AudioLines className="size-5 text-(--cc-accent) 2xl:size-6" aria-hidden />}
        meta={live ? `${activeCalls} activa${activeCalls === 1 ? "" : "s"}${voice ? ` · ${voice.queued} en la fila` : ""}` : "Cargando…"}
      >
        Llamadas en vivo
      </PanelTitle>
      <div ref={listRef} className="mt-2 min-h-0 flex-1 overflow-hidden">
        {live && !calls.length && (
          <p className="border-l-[3px] border-(--cc-border) bg-(--cc-subtle) px-3 py-2.5 text-[14px] leading-snug text-(--cc-text-2) 2xl:text-[16px]">
            Ninguna llamada todavía. En el paso 4 suena el teléfono de Rosa; en Preparar se prueban las llamadas.
          </p>
        )}
        <ul className="flex flex-col gap-1.5">
          {shown.map((c) => (
            <CallItem key={c.id} c={c} v={voiceOf.get(c.id)} now={now} busy={busy} run={run} />
          ))}
        </ul>
      </div>
      {calls.length > shown.length && <p className="mt-1 text-[13px] text-(--cc-text-2)">y {calls.length - shown.length} más en Preparar y herramientas</p>}
    </Panel>
  );
}

function CallItem({ c, v, now, busy, run }: { c: CallRow; v: { state: string; owner_kind: string } | undefined; now: number; busy: string; run: Run }) {
  const st = callState(c, v?.state);
  const ref = useFlash<HTMLLIElement>(st.label);
  const elapsed = st.tone === "live" && c.answered_at ? Math.max(0, (now - Date.parse(c.answered_at)) / 1000) : null;
  // the latency probe is a technical detail, not an event for the jury
  const last = [...(c.actions ?? [])].reverse().find((a) => a.tool !== "latencia")?.result ?? c.result ?? null;
  const where = v?.owner_kind === "chat" ? "en el chat" : "en el teléfono";
  const Icon = st.tone === "ring" ? PhoneIncoming : st.tone === "live" ? AudioLines : PhoneOff;
  const activeCall = c.status === "sonando" || c.status === "en_curso";
  return (
    <li ref={ref} className={`flex h-[62px] items-center gap-2.5 border border-l-4 border-(--cc-border) px-2.5 2xl:h-[74px] 2xl:gap-3 2xl:px-3 ${TONE_EDGE[st.tone]}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-bold leading-tight 2xl:text-[19px]">{c.name ?? "Participante"}</p>
        <p className="flex min-w-0 items-baseline gap-x-2 text-[13px] leading-snug text-(--cc-text-2) 2xl:text-[15px]">
          <span className={`inline-flex shrink-0 items-center gap-1 text-[14px] font-bold 2xl:text-[16px] ${TONE_TEXT[st.tone]}`}>
            {st.tone === "live" ? <span className={`cc-live inline-block size-2.5 rounded-[2px] bg-current`} aria-hidden /> : <Icon className="size-4 self-center" aria-hidden />}
            {st.label}
            {elapsed != null ? <span className="font-semibold tabular-nums">{clock(elapsed)}</span> : null}
            {st.tone === "done" && c.duration_s != null ? (
              <span className="font-normal tabular-nums">
                · {c.duration_s}
                {NBSP}s
              </span>
            ) : null}
          </span>
          <span className="min-w-0 truncate">
            {PURPOSE[c.purpose] ?? c.purpose}
            {c.provider ? ` · ${PROVIDER[c.provider] ?? c.provider}` : ""}
            {v ? ` · ${where}` : ""}
            {last ? ` · ${last}` : ""}
          </span>
        </p>
      </div>
      {activeCall && (
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run("end_call", { callId: c.id }, "Llamada terminada desde el panel")}
          className={`cc-press inline-flex min-h-10 shrink-0 items-center rounded-[4px] border border-(--cc-control) bg-(--cc-surface) px-2.5 text-[13px] font-semibold hover:bg-(--cc-subtle) disabled:opacity-50 2xl:text-[15px]`}
          title="Termina la llamada y sigue con los botones simulados"
          aria-label={`Terminar la llamada de ${c.name ?? "participante"} (usar simulado)`}
        >
          Terminar
        </button>
      )}
    </li>
  );
}

// ------------------------------------------------------------------------------------------------ freed slots

const ORIGIN: Record<string, string> = {
  liberado: "Liberado por el paciente",
  domino: "Liberado por efecto dominó",
  agenda_libre: "Cupo libre de la agenda",
  cupo_del_dia: "Cupo del día",
};
const ZONE: Record<string, string> = { cercana: "zona cercana", media: "zona media", lejana: "zona lejana" };
const WEEKDAY = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
function slotDate(iso: string, time: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")} · ${time}`;
}

function SlotsPanel({ overview, busy, run, now, state }: { overview: DemoOverview | null; busy: string; run: Run; now: number; state: DemoState | null }) {
  const [listRef, fit] = useFit(66, 78, 6, 4);
  const rule = overview?.rule ?? null;
  const slots = overview?.slots ?? [];
  const shown = slots.slice(0, fit);
  const nowMin = state ? demoNowMin(state, now) : null;
  return (
    <Panel label="Cupos liberados y regla de asignación">
      <PanelTitle
        icon={<CalendarClock className="size-5 text-(--cc-accent) 2xl:size-6" aria-hidden />}
        meta={overview ? `${num(overview.slot_counts.open)} abiertos · ${num(overview.slot_counts.filled)} llenados` : "Cargando…"}
      >
        Cupos liberados
      </PanelTitle>
      <fieldset className="mt-2">
        <legend className="text-[13px] font-semibold text-(--cc-text-2) 2xl:text-[15px]">Regla de asignación activa</legend>
        <div className="mt-1 grid grid-cols-2 overflow-hidden rounded-[4px] border border-(--cc-control)">
          {(Object.keys(RULE_TEXT) as Rule[]).map((r, i) => (
            <button
              key={r}
              type="button"
              aria-pressed={rule === r}
              disabled={!!busy || rule == null}
              onClick={() => rule !== r && run("assignment_rule", { rule: r }, r === "primero_acepta" ? "Regla: primero que acepta" : "Regla: mayor prioridad al cierre de la ventana")}
              className={`flex min-h-10 items-center justify-center gap-1.5 px-2 text-center text-[13px] font-bold leading-tight transition-[background-color,color] duration-150 disabled:opacity-60 2xl:min-h-12 2xl:text-[15px] ${
                i ? "border-l border-(--cc-control)" : ""
              } ${rule === r ? "bg-(--cc-primary) text-(--cc-on-primary)" : "bg-(--cc-surface) text-(--cc-text) hover:bg-(--cc-subtle)"}`}
            >
              {rule === r && <Check className="size-4 shrink-0" aria-hidden />}
              {RULE_TEXT[r].short}
            </button>
          ))}
        </div>
        <p key={rule ?? "x"} className={`cc-swap mt-1 text-[13px] leading-snug text-(--cc-text-2) 2xl:text-[15px]`}>
          {rule ? RULE_TEXT[rule].long : "Cargando la regla…"}
        </p>
      </fieldset>
      <div ref={listRef} className="mt-2 min-h-0 flex-1 overflow-hidden">
        {overview && !slots.length && (
          <p className="border-l-[3px] border-(--cc-border) bg-(--cc-subtle) px-3 py-2.5 text-[14px] text-(--cc-text-2)">
            Ningún cupo libre por ahora. Aparecen cuando un paciente avisa que no podrá asistir.
          </p>
        )}
        <ul className="flex flex-col gap-1.5">
          {shown.map((s) => (
            <SlotItem key={s.id} s={s} nowMin={nowMin} />
          ))}
        </ul>
      </div>
      {slots.length > shown.length && <p className="mt-1 text-[13px] text-(--cc-text-2)">y {slots.length - shown.length} más en el panel (Por reasignar)</p>}
    </Panel>
  );
}

function slotLine(s: OverviewSlot, nowMin: number | null): { text: string; tone: "ink" | "ring" | "ok" | "muted" } {
  switch (s.phase) {
    case "propuesta":
      return { text: `Lista para aprobar: ${s.candidates} candidato${s.candidates === 1 ? "" : "s"}`, tone: "ink" };
    case "sin_candidatos":
      return { text: "Sin candidatos en su zona todavía", tone: "muted" };
    case "oferta": {
      const left = s.closes_min != null && nowMin != null ? s.closes_min - nowMin : null;
      return {
        text: `Oferta a ${s.candidates} · ${s.accepted} aceptaron${s.declined ? ` · ${s.declined} no pueden` : ""}${s.closes_min != null ? ` · cierra ${fmtMin(s.closes_min)}` : ""}${left != null && left <= 0 ? " (lista para cerrar)" : ""}`,
        tone: "ring",
      };
    }
    case "por_validar":
      return { text: `Por validar con ${s.who ?? "el paciente"}`, tone: "ring" };
    case "asignado":
      return {
        text: `Asignado a ${s.who ?? "—"}${s.rule === "primero_acepta" ? " (primero que aceptó)" : s.rule === "ventana_prioridad" ? " (mayor prioridad)" : ""}`,
        tone: "ok",
      };
  }
}

function SlotItem({ s, nowMin }: { s: OverviewSlot; nowMin: number | null }) {
  const line = slotLine(s, nowMin);
  const ref = useFlash<HTMLLIElement>(`${s.phase}-${s.accepted}-${s.who}`);
  const text = { ink: "text-(--cc-text)", ring: "text-(--cc-accent)", ok: "text-(--cc-ok)", muted: "text-(--cc-text-2)" }[line.tone];
  const edge = { ink: "border-l-(--cc-primary)", ring: "border-l-(--cc-accent)", ok: "border-l-(--cc-ok)", muted: "border-l-(--cc-border)" }[line.tone];
  return (
    <li ref={ref} className={`flex h-[66px] flex-col justify-center border border-l-4 border-(--cc-border) px-2.5 2xl:h-[78px] 2xl:px-3 ${edge}`}>
      <p className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[15px] font-bold leading-tight 2xl:text-[18px]">{s.specialty}</span>
        <span className="shrink-0 text-[13px] tabular-nums text-(--cc-text-2) 2xl:text-[15px]">{slotDate(s.date, s.time)}</span>
      </p>
      <p key={line.text} className={`cc-swap flex items-center gap-1.5 truncate text-[14px] font-semibold leading-snug 2xl:text-[16px] ${text}`}>
        {s.phase === "asignado" ? <Check className="size-4 shrink-0" aria-hidden /> : s.phase === "oferta" ? <Users className="size-4 shrink-0" aria-hidden /> : null}
        <span className="truncate">{line.text}</span>
      </p>
      <p className="truncate text-[13px] leading-snug text-(--cc-text-2) 2xl:text-[15px]">
        {ORIGIN[s.origin] ?? s.origin} · {ZONE[s.zone] ?? s.zone}
      </p>
    </li>
  );
}

// ------------------------------------------------------------------------------------------------ waiting list v5.1

/** category edge colour: a second signal only, the row always says "P1"…"P4" in text */
const CAT_EDGE: Record<string, string> = {
  P1: "border-l-(--cc-danger)",
  P2: "border-l-(--cc-warn)",
  P3: "border-l-(--cc-accent)",
  P4: "border-l-(--cc-control)",
};
const SHORT_STATE: Partial<Record<RequestState, string>> = {
  con_oferta: "Con oferta",
  en_espera_prioritaria: "Primero al próximo cupo",
  asignada_por_validar: "Por validar",
  con_cita: "Con cita",
};

function WaitlistPanel({ overview }: { overview: DemoOverview | null }) {
  const [specialty, setSpecialty] = useState("");
  const [listRef, fit] = useFit(40, 46, 2, 8);
  const all = overview?.waitlist ?? [];
  const specialties = [...new Set(all.map((r) => r.specialty))].sort((a, b) => a.localeCompare(b, "es"));
  const rows = specialty ? all.filter((r) => r.specialty === specialty) : all;
  const newest = overview?.newest_request ?? null;
  // where the newest request of the demo stands (the jury's request), within its specialty
  const mine = newest ? all.find((r) => r.code === newest) : undefined;
  const mineList = mine ? all.filter((r) => r.specialty === mine.specialty) : [];
  const minePos = mine ? mineList.indexOf(mine) + 1 : 0;
  const shown = rows.slice(0, fit);
  return (
    <Panel label="Lista de espera">
      <PanelTitle icon={<ListOrdered className="size-5 text-(--cc-accent) 2xl:size-6" aria-hidden />} meta={overview ? `${num(rows.length)} en espera` : "Cargando…"}>
        Lista de espera
      </PanelTitle>
      <p className="mt-1.5 text-[13px] leading-snug text-(--cc-text-2) 2xl:text-[15px]">Primero la categoría (P1 a P4), luego el % del plazo ya consumido.</p>
      <select
        value={specialty}
        onChange={(e) => setSpecialty(e.target.value)}
        aria-label="Especialidad de la lista"
        className="mt-1.5 min-h-9 w-full rounded-[4px] border border-(--cc-control) bg-(--cc-surface) px-2 text-[14px] font-semibold 2xl:min-h-10 2xl:text-[16px]"
      >
        <option value="">Todas las especialidades</option>
        {specialties.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <div ref={listRef} className="mt-2 min-h-0 flex-1 overflow-hidden">
        <ol className="flex flex-col gap-0.5">
          {shown.map((r, i) => (
            <WaitItem key={r.id} r={r} pos={i + 1} fresh={r.code === newest} showSpecialty={!specialty} />
          ))}
        </ol>
      </div>
      {mine && (
        <p key={`${mine.code}-${minePos}`} className={`cc-swap mt-1.5 border-l-[3px] border-(--cc-accent) bg-(--cc-subtle) py-1 pl-2 pr-1 text-[13px] leading-snug 2xl:text-[15px]`}>
          <strong>{mine.code}</strong>, la más reciente: puesto <strong>{minePos}</strong> de {mineList.length} en {mine.specialty} ({mine.cat}, {mine.pct}
          {NBSP}% de su plazo).
        </p>
      )}
    </Panel>
  );
}

function WaitItem({ r, pos, fresh, showSpecialty }: { r: OverviewWaitRow; pos: number; fresh: boolean; showSpecialty: boolean }) {
  const state = SHORT_STATE[r.state as RequestState] ?? null;
  return (
    <li
      className={`flex h-10 items-center gap-2 border-b border-l-4 border-b-(--cc-border) pl-1.5 pr-0.5 2xl:h-[46px] 2xl:gap-2.5 ${CAT_EDGE[r.cat] ?? CAT_EDGE.P4} ${fresh ? "bg-(--cc-subtle)" : ""}`}
      title={REQUEST_STATE[r.state as RequestState]?.label}
    >
      <span className="w-6 shrink-0 text-right text-[13px] tabular-nums text-(--cc-text-2) 2xl:w-8 2xl:text-[15px]">{pos}</span>
      <span className="w-7 shrink-0 text-[14px] font-bold 2xl:w-8 2xl:text-[16px]">{r.category ?? `${r.cat}?`}</span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[14px] font-semibold 2xl:text-[16px]">
          {r.short_name}
          {fresh ? <span className="ml-1.5 text-[12px] font-bold text-(--cc-accent) 2xl:text-[14px]">· Nueva</span> : null}
        </span>
        <span className="block truncate text-[12px] text-(--cc-text-2) 2xl:text-[14px]">
          {showSpecialty ? r.specialty : r.code}
          {state ? ` · ${state}` : ""}
        </span>
      </span>
      <span className="flex w-[64px] shrink-0 flex-col items-end gap-0.5 2xl:w-24">
        <span className="text-[14px] font-bold tabular-nums leading-none 2xl:text-[16px]">
          {r.pct}
          {NBSP}%
        </span>
        <span className="h-1 w-full bg-(--cc-subtle)" aria-hidden>
          <span className={`cc-bar block h-full w-full bg-(--cc-accent)`} style={{ transform: `scaleX(${Math.min(1, Math.max(0, r.pct / 100))})` }} />
        </span>
      </span>
    </li>
  );
}
