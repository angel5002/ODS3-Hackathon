"use client";

// /demo presentation mode: one view per moment of the pitch script v7 (slides 5–9). One idea per view, huge type,
// no lists of text. Sizes are in em of the presentation root (theme.tsx), so each view fits 1280×720 and 1920×1080.
import { useEffect, type CSSProperties, type ReactNode, type RefObject } from "react";
import {
  CalendarCheck,
  Check,
  ClipboardList,
  Hourglass,
  MessageCircle,
  PhoneCall,
  PhoneOff,
  Repeat,
  Send,
  Stethoscope,
  UserCheck,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { num } from "@/lib/labels";
import type { DemoOverview } from "@/lib/demo-overview";
import type { JuryActivity, JuryActivityKind, JuryOverview } from "@/lib/demo/contract";
import { SCENE2, SCENE2_AT, SUMMARY_AT, summaryAt } from "./fixtures";
import { useCues, type JurySource } from "./hooks";
import { DoctorSummarySlot, PreconsultaChatSlot, SampleTag, Scene1CallSlot, SUMMARY_NOTE, type SceneController } from "./slots";

const i = (n: number) => ({ "--i": n }) as CSSProperties;

function Moment({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <section data-moment={id} aria-label={label} className="pr-fade flex h-full min-h-0 flex-col px-[2.4em] py-[1.2em] max-[900px]:px-[1em]">
      {children}
    </section>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[0.9em] font-semibold text-(--pr-muted)">{children}</p>;
}

function LiveDot({ source }: { source: JurySource }) {
  if (source === "ejemplo") return <SampleTag />;
  return (
    <span className="inline-flex items-center gap-[0.4em] text-[0.85em] font-semibold text-(--pr-accent)">
      <span className="pr-live inline-block size-[0.55em] rounded-full bg-current" aria-hidden />
      {source === "cargando" ? "Conectando" : "En vivo"}
    </span>
  );
}

// ------------------------------------------------------------------------------------------------ 1 · QR y cartillas

export function QrMoment({ qr, jury, source }: { qr: { url: string; svg: string } | null; jury: JuryOverview | null; source: JurySource }) {
  const opened = jury ? jury.cards.filter((c) => c.state !== "sin_abrir").length : null;
  const shortUrl = qr ? qr.url.replace(/^https?:\/\//, "") : null;
  return (
    <Moment id="qr" label="QR y cartillas">
      <div className="grid min-h-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-[2.6em] max-[900px]:grid-cols-1">
        <figure className="pr-in flex flex-col items-center gap-[0.6em]" style={i(0)}>
          <div
            className="aspect-square h-[min(21em,58vh)] rounded-[0.8em] border border-(--pr-line) bg-white p-[0.7em] [&_svg]:size-full max-[900px]:h-auto max-[900px]:w-full"
            role="img"
            aria-label="Código QR del chat para pedir una cita"
            dangerouslySetInnerHTML={{ __html: qr?.svg ?? "" }}
          />
          {shortUrl && <figcaption className="max-w-[21em] text-center text-[0.85em] text-(--pr-muted) [overflow-wrap:anywhere]">{shortUrl}</figcaption>}
        </figure>
        <div className="flex min-w-0 flex-col gap-[0.9em]">
          <h1 className="pr-title pr-in text-[3em]" style={i(1)}>
            Escanee y pida una cita
          </h1>
          <p className="pr-in text-[1.35em] leading-snug text-(--pr-muted)" style={i(2)}>
            Por chat, desde su celular. Sin instalar nada.
          </p>
          <p className="pr-in mt-[1.2em] flex flex-wrap items-center gap-x-[0.8em] gap-y-[0.3em] text-[1em]" style={i(3)}>
            <MessageCircle className="size-[1.1em] text-(--pr-accent)" aria-hidden />
            {opened == null ? (
              <span className="text-(--pr-muted)">Cartillas del jurado</span>
            ) : (
              <span key={opened} className="pr-fade">
                <strong className="tabular-nums">{num(opened)}</strong> de {num(jury!.cards.length)} cartillas abiertas
              </span>
            )}
            <LiveDot source={source} />
          </p>
        </div>
      </div>
    </Moment>
  );
}

// ------------------------------------------------------------------------------------------------ 2 · Escena 1

/** scene 1 cues (script v7): red band 9 s, first AI line 11 s, staff approval 15 s, second AI line 17 s, green band 18 s */
export const SCENE1_CUES = [9000, 11000, 15000, 17000, 18000] as const;

export function Scene1Moment({
  jury,
  source,
  controllerRef,
}: {
  jury: JuryOverview | null;
  source: JurySource;
  controllerRef: RefObject<SceneController | null>;
}) {
  const { elapsed, passed, next } = useCues(SCENE1_CUES);
  useEffect(() => {
    controllerRef.current = { next };
    return () => {
      controllerRef.current = null;
    };
  }, [controllerRef, next]);

  // the hand-off follows the real slot when track E's view is live (the staff approval is the trigger);
  // otherwise it follows the scene clock
  const live = source === "en_vivo" && jury?.carmenSlot ? jury.carmenSlot : null;
  const stage = live ? ({ libre: 0, ofrecido: 1, asignado: 2 } as const)[live.state] : passed >= 5 ? 2 : passed >= 3 ? 1 : 0;
  const slot = live ?? { specialty: "Oncología", when: "mañana 9:00", assignedTo: null };
  const to = live?.assignedTo ?? "Tito";
  const red = passed >= 1;
  const green = passed >= 5;

  return (
    <Moment id="escena1" label="Escena 1: Tito en el hospital">
      <div className="flex items-baseline justify-between gap-[1em]">
        <h1 className="pr-title text-[1.9em]">Cada cupo, a quien más lo necesita</h1>
        {source === "ejemplo" ? <SampleTag /> : null}
      </div>
      <div className="mt-[0.9em] grid min-h-0 flex-1 grid-cols-[minmax(0,0.85fr)_minmax(0,1.5fr)] gap-[1.6em] max-[900px]:grid-cols-1">
        <Scene1CallSlot elapsed={elapsed} passed={passed} />
        <div className="flex min-h-0 flex-col justify-center gap-[1.1em]">
          {/* who had the slot, who gets it */}
          <div className="grid grid-cols-2 gap-[1em]">
            <Person name="Carmen" note="Avisó que no podrá ir" done />
            <Person name={to} note={stage === 2 ? "Aceptó el cupo" : "Espera su cita"} done={stage === 2} />
          </div>
          {/* the freed slot: it moves from Carmen to Tito when the staff approves and he accepts */}
          <div className="relative h-[4.4em]">
            {/* where the slot was: stays as an empty outline once it moves */}
            <div className="absolute inset-y-0 left-0 w-1/2 rounded-[0.8em] border-2 border-dashed border-(--pr-line)" aria-hidden />
            <div
              className={`pr-move absolute inset-y-0 left-0 flex w-1/2 flex-col justify-center rounded-[0.8em] border-2 px-[0.9em] ${
                stage === 2 ? "border-(--pr-yes) bg-(--pr-yes-soft)" : "border-(--pr-ink) bg-(--pr-bg)"
              }`}
              style={{ transform: `translateX(${stage * 50}%)` }}
            >
              <p className="text-[1.15em] font-bold leading-tight">{slot.specialty}</p>
              <p key={stage} className="pr-fade text-[0.95em] text-(--pr-muted)">
                {slot.when} · {stage === 0 ? "Cupo liberado" : stage === 1 ? "Oferta aprobada" : "Reservado"}
              </p>
            </div>
          </div>
          {/* the trigger is a person: the staff approval */}
          <ol className="grid grid-cols-3 gap-[0.6em]" aria-label="Pasos del cupo">
            <Step icon={PhoneOff} text="Carmen avisa" state="done" />
            <Step icon={UserCheck} text="El personal aprueba" state={stage >= 1 ? "done" : "now"} strong />
            <Step icon={Check} text={`${to} acepta`} state={stage >= 2 ? "done" : stage === 1 ? "now" : "todo"} />
          </ol>
        </div>
      </div>
      <div className="mt-[1em] grid grid-cols-2 gap-[1em]">
        <Band on={red} tone="no" title="Sin AsistIA" text="Tito espera cinco semanas" />
        <Band on={green} tone="yes" title="Con AsistIA" text="Cita mañana a las 9:00" />
      </div>
    </Moment>
  );
}

function Person({ name, note, done }: { name: string; note: string; done: boolean }) {
  return (
    <div className="flex items-center gap-[0.6em]">
      <span className="grid size-[2.2em] shrink-0 place-items-center rounded-full border border-(--pr-line) bg-(--pr-soft)" aria-hidden>
        <UserRound className="size-[1.2em]" />
      </span>
      <span className="min-w-0">
        <span className="block text-[1.3em] font-bold leading-tight">{name}</span>
        <span key={note} className={`pr-fade block text-[0.9em] ${done ? "text-(--pr-ink)" : "text-(--pr-muted)"}`}>
          {note}
        </span>
      </span>
    </div>
  );
}

function Step({ icon: Icon, text, state, strong }: { icon: LucideIcon; text: string; state: "done" | "now" | "todo"; strong?: boolean }) {
  const tone = state === "done" ? "border-(--pr-accent) text-(--pr-ink)" : state === "now" ? "border-(--pr-ink) text-(--pr-ink)" : "border-(--pr-line) text-(--pr-muted)";
  return (
    <li className={`pr-swap flex items-center gap-[0.5em] border-t-[0.2em] pt-[0.5em] ${tone}`}>
      {state === "done" ? <Check className="size-[1.1em] shrink-0 text-(--pr-accent)" aria-label="hecho" /> : <Icon className="size-[1.1em] shrink-0" aria-hidden />}
      <span className={`text-[0.95em] leading-tight ${strong ? "font-bold" : "font-semibold"}`}>{text}</span>
    </li>
  );
}

function Band({ on, tone, title, text }: { on: boolean; tone: "no" | "yes"; title: string; text: string }) {
  const c = tone === "no" ? "border-(--pr-no) bg-(--pr-no-soft)" : "border-(--pr-yes) bg-(--pr-yes-soft)";
  const t = tone === "no" ? "text-(--pr-no)" : "text-(--pr-yes)";
  return (
    <div aria-hidden={!on} className={`flex items-baseline gap-[0.7em] border-l-[0.35em] px-[0.9em] py-[0.55em] ${c} ${on ? "pr-band" : "invisible"}`}>
      <span className={`shrink-0 text-[1.1em] font-bold ${t}`}>{title}</span>
      <span className="text-[1.1em] font-semibold">{text}</span>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ 3 · Interacción del jurado

const KIND: Record<JuryActivityKind, LucideIcon> = {
  abrio: MessageCircle,
  confirmo: Check,
  cancelo: X,
  pidio_cita: ClipboardList,
  categorizada: UserCheck,
  oferta: Send,
  acepto: Check,
  rechazo: X,
  llamada_inicio: PhoneCall,
  llamada_fin: PhoneOff,
  chat: MessageCircle,
};

const CAT_ORDER: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };

function ago(iso: string, now: number) {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  return min < 1 ? "ahora" : min === 1 ? "hace 1 min" : `hace ${min} min`;
}

export function JuryMoment({ jury, source, now }: { jury: JuryOverview | null; source: JurySource; now: number }) {
  // the waiting-list order: category first, then the share of the deadline already used (the server's position)
  const reqs = [...(jury?.newRequests ?? [])].sort(
    (a, b) => (CAT_ORDER[a.category ?? ""] ?? 9) - (CAT_ORDER[b.category ?? ""] ?? 9) || (a.position ?? 9999) - (b.position ?? 9999),
  );
  const shownReqs = reqs.slice(0, 4);
  const acts = (jury?.activity ?? []).slice(0, 4);
  const slot = jury?.carmenSlot ?? null;
  return (
    <Moment id="jurado" label="Interacción del jurado">
      <div className="flex flex-wrap items-baseline justify-between gap-[1em]">
        <h1 className="pr-title text-[2.2em]">Lo que hace el jurado</h1>
        <LiveDot source={source} />
      </div>
      <div className="mt-[1em] grid min-h-0 flex-1 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-[2em] max-[900px]:grid-cols-1">
        <div className="flex min-h-0 flex-col">
          <Eyebrow>Lista de espera</Eyebrow>
          <ol className="mt-[0.5em] flex flex-col">
            {shownReqs.map((r, n) => (
              <li key={r.code} className="pr-in flex items-center gap-[0.8em] border-b border-(--pr-line) py-[0.55em]" style={i(n)}>
                <span
                  className={`grid h-[1.9em] min-w-[2.6em] shrink-0 place-items-center rounded-[0.35em] text-[0.95em] font-bold ${
                    r.category ? "bg-(--pr-ink) text-(--pr-bg)" : "border border-(--pr-line) text-(--pr-muted)"
                  }`}
                >
                  {r.category ?? "—"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[1.2em] font-bold leading-tight">{r.character}</span>
                  <span className="block text-[0.9em] text-(--pr-muted)">{r.specialty}</span>
                </span>
                <span className="shrink-0 text-right text-[0.95em] tabular-nums">
                  {r.position != null ? `Puesto ${num(r.position)}` : <span className="text-(--pr-muted)">Por regular</span>}
                </span>
              </li>
            ))}
          </ol>
          {reqs.length > shownReqs.length && <p className="mt-[0.4em] text-[0.85em] text-(--pr-muted)">y {num(reqs.length - shownReqs.length)} más</p>}
          {!reqs.length && <p className="mt-[0.6em] text-[1em] text-(--pr-muted)">Aún sin solicitudes nuevas</p>}
        </div>
        <div className="flex min-h-0 flex-col">
          <Eyebrow>Ahora</Eyebrow>
          <ol className="mt-[0.5em] flex flex-col gap-[0.7em]" aria-live="polite">
            {acts.map((a: JuryActivity, n) => {
              const Icon = KIND[a.kind] ?? MessageCircle;
              return (
                <li key={`${a.token}-${a.kind}-${a.at}`} className={`pr-in flex items-start gap-[0.7em] ${n ? "opacity-70" : ""}`} style={i(n)}>
                  <span className="grid size-[1.9em] shrink-0 place-items-center rounded-full border border-(--pr-line)" aria-hidden>
                    <Icon className="size-[1em]" />
                  </span>
                  <span className="min-w-0">
                    <span className={`block leading-snug ${n ? "text-[1em]" : "text-[1.25em] font-semibold"}`}>{a.text}</span>
                    <span className="block text-[0.8em] text-(--pr-muted)">{ago(a.at, now)}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          {!acts.length && <p className="mt-[0.6em] text-[1em] text-(--pr-muted)">Esperando al jurado</p>}
        </div>
      </div>
      {slot && (
        <p key={`${slot.state}-${slot.assignedTo}`} className="pr-fade mt-[0.8em] flex flex-wrap items-baseline gap-x-[0.6em] border-t border-(--pr-line) pt-[0.6em] text-[1em]">
          <span className="font-semibold text-(--pr-muted)">Cupo de Carmen</span>
          <span className="font-bold">
            {slot.specialty} · {slot.when}
          </span>
          <span className={slot.state === "asignado" ? "font-semibold text-(--pr-yes)" : "text-(--pr-muted)"}>
            {slot.state === "libre" ? "Liberado" : slot.state === "ofrecido" ? "Oferta aprobada por el personal" : `Asignado a ${slot.assignedTo ?? "—"}`}
          </span>
        </p>
      )}
    </Moment>
  );
}

// ------------------------------------------------------------------------------------------------ 4 · Escena 2

/** one chat message every 2.4 s (SCENE2_AT) plus the summary steps; the scene closes at 26.4 s */
export const SCENE2_CUES = [...new Set([...SCENE2_AT, ...Object.values(SUMMARY_AT)])].sort((a, b) => a - b);

export function Scene2Moment({ controllerRef }: { controllerRef: RefObject<SceneController | null> }) {
  const { elapsed, next } = useCues(SCENE2_CUES);
  useEffect(() => {
    controllerRef.current = { next };
    return () => {
      controllerRef.current = null;
    };
  }, [controllerRef, next]);
  const lines = SCENE2.lines.filter((_, n) => elapsed >= SCENE2_AT[n]);
  const summary = summaryAt(elapsed);
  const w = summary.ventanaLlegada;
  return (
    <Moment id="escena2" label="Escena 2: preconsulta en la clínica">
      <h1 className="pr-title text-[1.9em]">Preconsulta: el médico llega con el resumen</h1>
      <div className="mt-[0.9em] grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-[1.6em] max-[900px]:grid-cols-1">
        <PreconsultaChatSlot lines={lines} />
        <div className="flex min-h-0 flex-col gap-[0.8em]">
          <div className="min-h-0 flex-1">
            <DoctorSummarySlot summary={summary} />
          </div>
          <div className={`flex flex-wrap items-baseline justify-between gap-x-[1em] rounded-[0.8em] border border-(--pr-line) px-[1em] py-[0.6em] ${w ? "pr-fade" : "invisible"}`} aria-hidden={!w}>
            <span className="text-[0.9em] font-semibold text-(--pr-muted)">Ventana de llegada</span>
            <span className="pr-title text-[1.7em] tabular-nums">{w ? `${w.desde} a ${w.hasta}` : "--:--"}</span>
            <span className="w-full text-[0.85em] text-(--pr-muted)">Estimación: el consultorio va con {w?.atrasoMin ?? 0} min de atraso</span>
          </div>
        </div>
      </div>
      <p className="mt-[0.6em] text-[0.85em] text-(--pr-muted)">{SUMMARY_NOTE}</p>
    </Moment>
  );
}

// ------------------------------------------------------------------------------------------------ 5 · Tablero de etapas

type Stage = { icon: LucideIcon; name: string; value: number | null; unit: string };

export function StagesMoment({ overview }: { overview: DemoOverview | null }) {
  const s = overview?.stages;
  const c = overview?.slot_counts;
  const stages: Stage[] = [
    s && s.confirmacion.confirmed > 0
      ? { icon: CalendarCheck, name: "Antes de la cita", value: s.confirmacion.confirmed, unit: `confirmadas de ${num(s.confirmacion.day)}` }
      : { icon: CalendarCheck, name: "Antes de la cita", value: s?.confirmacion.day ?? null, unit: "citas por confirmar" },
    { icon: ClipboardList, name: "Llegada y triaje", value: null, unit: "" },
    { icon: Hourglass, name: "Espera", value: s?.espera.waiting ?? null, unit: "en lista de espera" },
    { icon: Stethoscope, name: "Atención y alta", value: null, unit: "" },
    { icon: Repeat, name: "Cupos liberados", value: c ? c.filled : null, unit: c ? `reasignados de ${num(c.filled + c.open)}` : "reasignados" },
  ];
  return (
    <Moment id="etapas" label="Tablero de etapas">
      <h1 className="pr-title text-[2.2em]">Cada etapa, medida como un envío</h1>
      <ol className="relative mt-[1em] grid min-h-0 flex-1 grid-cols-5 content-center gap-x-[0.8em] gap-y-[1.2em] max-[900px]:grid-cols-1">
        {stages.map((st, n) => {
          const measured = st.value != null || st.unit !== "";
          return (
            <li key={st.name} className="pr-in relative flex flex-col items-center text-center" style={i(n)}>
              {/* the track to the next stop, drawn on entry like a parcel route */}
              {n < stages.length - 1 && (
                <span className="pr-draw pointer-events-none absolute left-1/2 top-[1.91em] h-[0.18em] w-[calc(100%+0.8em)] bg-(--pr-line) max-[900px]:hidden" style={i(n + 1)} aria-hidden />
              )}
              <span
                className={`relative grid size-[4em] place-items-center rounded-full bg-(--pr-bg) ${
                  measured ? "border-[0.15em] border-(--pr-ink)" : "border-[0.15em] border-dashed border-(--pr-line) text-(--pr-muted)"
                }`}
                aria-hidden
              >
                <st.icon className="size-[1.8em]" />
              </span>
              <span className="mt-[0.7em] text-[1.1em] font-bold leading-tight">{st.name}</span>
              {measured ? (
                <>
                  <span key={st.value ?? "x"} className="pr-title pr-fade mt-[0.2em] text-[3.2em] tabular-nums">
                    {st.value == null ? "—" : num(st.value)}
                  </span>
                  <span className="text-[0.95em] leading-snug text-(--pr-muted)">{st.unit}</span>
                </>
              ) : (
                <span className="mt-[0.6em] text-[1em] font-semibold text-(--pr-muted)">Se mide en el piloto</span>
              )}
            </li>
          );
        })}
      </ol>
    </Moment>
  );
}
