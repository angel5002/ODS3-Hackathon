import type { Viewport } from "next";
import Link from "next/link";
import { BellRing, Bot, Brain, HandHeart, Repeat2, ShieldCheck, UserRoundCheck } from "lucide-react";
import { Brand } from "@/components/Brand";
import { SiteFooter } from "@/components/SiteFooter";
import { AgendaGrid } from "@/components/landing/AgendaGrid";
import { num, pct } from "@/lib/labels";
import { serverDb } from "@/lib/supabase/server";

export const revalidate = 3600;
export const viewport: Viewport = { themeColor: "#f6f7f6" };

type Group = { group: string; citas: number; tasa: number };

async function loadFigures() {
  const { data } = await serverDb().from("metrics").select("key,value").in("key", ["historical", "model_card"]);
  const m = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  const s = m.historical?.summary ?? {};
  return {
    noShows: s.no_shows as number,
    rate: s.no_show_rate as number,
    perDay: Math.round(s.no_shows_per_day as number),
    patients: s.patients as number,
    byAge: (m.historical?.by_age ?? []) as Group[],
    byInsurance: (m.historical?.by_insurance ?? []) as Group[],
    listPrecision: m.model_card?.call_list_precision as number,
    average: m.model_card?.test_no_show_rate as number,
  };
}

// E5 stoic: one line per step, one line per principle (docs/estilo.md, text rules)
const STEPS = [
  { icon: Brain, title: "Estima el riesgo", text: "Ordena las citas por probabilidad de inasistencia." },
  { icon: BellRing, title: "Recuerda a todos", text: "Un mensaje: confirmo, no podré ir, otra fecha o una persona." },
  { icon: Bot, title: "Llama a quien no responde", text: "Un asistente automatizado confirma o libera el cupo." },
  { icon: Repeat2, title: "Ofrece el cupo", text: "El personal elige a quién de la lista de espera." },
];

const PRINCIPLES = [
  { icon: UserRoundCheck, title: "Una persona decide", text: "El sistema propone; nunca cancela ni reasigna solo." },
  { icon: HandHeart, title: "Más apoyo, no castigo", text: "Más riesgo significa más ayuda, nunca perder la cita." },
  { icon: ShieldCheck, title: "Listo para un piloto", text: "Hoy simulado; mañana, canales reales." },
];

// calm type scale: serif titles and big numbers (DM Serif Display), DM Sans for everything else
const H2 = "font-display text-[32px] leading-[1.1] sm:text-[44px]";
const BTN = "press inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[17px] font-semibold";
const PRIMARY = `${BTN} bg-brand text-white hover:bg-brand-hover`;
const SECONDARY = `${BTN} border border-line bg-surface text-ink hover:bg-sunken`;

export default async function Landing() {
  const f = await loadFigures();
  const kids = f.byAge.find((g) => g.group.startsWith("0"));

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header>
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <Brand />
          {/* no prefetch: /panel redirects to the PIN screen and the prefetch ended as an aborted request */}
          <Link
            href="/panel"
            prefetch={false}
            className="press inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-[15px] font-semibold text-ink hover:bg-sunken"
          >
            Acceso del equipo
          </Link>
        </div>
      </header>

      {/* ---------- Hero: the problem, in one sentence and one figure ---------- */}
      <section>
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-5 pb-16 pt-10 sm:px-8 md:grid-cols-[1.2fr_1fr] md:pb-24 md:pt-20">
          <div>
            <h1 className="max-w-[16ch] text-balance font-display text-[44px] leading-[1.02] sm:text-[68px]">
              Cada día, {num(f.perDay)} citas se quedan sin paciente.
            </h1>
            <p className="mt-6 max-w-[40ch] text-pretty text-[19px] leading-relaxed text-muted">
              Hospital María Auxiliadora, 2023. AsistIA devuelve esos cupos a quien espera.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link prefetch={false} href="/panel" className={PRIMARY}>
                Ver la demo
              </Link>
              <Link prefetch={false} href="/pedir-cita" className={SECONDARY}>
                Pedir una cita
              </Link>
            </div>
          </div>
          <div className="flex justify-center md:justify-end">
            <AgendaGrid emptyShare={f.rate} recoveredShare={0.21} />
          </div>
        </div>
      </section>

      {/* ---------- The problem in three numbers ---------- */}
      <section className="mx-auto w-full max-w-[1200px] px-5 pb-16 sm:px-8 md:pb-24">
        <h2 className={`max-w-[22ch] ${H2}`}>Un cupo vacío es una consulta que alguien necesitaba.</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { v: num(f.noShows), t: "citas no atendidas en 2023" },
            { v: pct(f.rate, 1), t: "de todas las citas programadas" },
            { v: kids ? pct(kids.tasa) : "", t: "de las citas de niños de 0 a 11 años" },
          ].map((s) => (
            <div key={s.t} className="h-full rounded-3xl border border-line bg-surface p-6">
              <p className="font-display text-[52px] leading-none tabular-nums">{s.v}</p>
              <p className="mt-3 text-muted">{s.t}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="como-funciona" className="scroll-mt-6 bg-surface">
        <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 md:py-24">
          <h2 className={H2}>Cuatro pasos. Una persona decide.</h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title}>
                <span className="grid size-11 place-items-center rounded-full bg-sunken text-ink">
                  <Icon className="size-5" aria-hidden strokeWidth={1.75} />
                </span>
                <h3 className="mt-4 text-[19px] font-semibold">
                  <span className="text-muted">{i + 1}. </span>
                  {title}
                </h3>
                <p className="mt-1 text-muted">{text}</p>
              </li>
            ))}
          </ol>

          <div className="mt-14 grid items-center gap-8 rounded-3xl bg-paper p-6 md:grid-cols-[1fr_1.1fr] md:p-10">
            <p className="font-display text-[28px] leading-snug">El 10 % de citas con más riesgo concentra casi el doble de inasistencias.</p>
            <div className="space-y-5">
              <CompareBar label="Lista de llamadas (10 % de mayor riesgo)" value={f.listPrecision} tone="bg-accent" />
              <CompareBar label="Promedio de todas las citas" value={f.average} tone="bg-line-strong" />
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Principles ---------- */}
      <section className="mx-auto w-full max-w-[1200px] px-5 py-16 sm:px-8 md:py-24">
        <div className="grid gap-4 md:grid-cols-3">
          {PRINCIPLES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="h-full rounded-3xl border border-line bg-surface p-6">
              <Icon className="size-6 text-ink" aria-hidden strokeWidth={1.5} />
              <h3 className="mt-4 text-[19px] font-semibold">{title}</h3>
              <p className="mt-1 text-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-auto">
        <SiteFooter />
      </div>
    </div>
  );
}

function CompareBar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-muted">{label}</span>
        <span className="shrink-0 font-display text-[30px] leading-none tabular-nums">{pct(value)}</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-sunken">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}
