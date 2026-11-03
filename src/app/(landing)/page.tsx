import type { Viewport } from "next";
import Link from "next/link";
import { ArrowRight, BellRing, Bot, Brain, HandHeart, Repeat2, ShieldCheck, Sparkles, UserRoundCheck } from "lucide-react";
import { Brand } from "@/components/Brand";
import { SiteFooter } from "@/components/SiteFooter";
import { AgendaGrid } from "@/components/landing/AgendaGrid";
import { Reveal } from "@/components/landing/Reveal";
import { num, pct } from "@/lib/labels";
import { serverDb } from "@/lib/supabase/server";

export const revalidate = 3600;
export const viewport: Viewport = { themeColor: "#0f2a2c" };

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

const STEPS = [
  { icon: Brain, title: "Estima el riesgo", text: "Ordena las citas de mañana por probabilidad de inasistencia y dice por qué." },
  { icon: BellRing, title: "Recuerda a todos", text: "Un mensaje con tres botones: confirmo, no podré ir, hablar con alguien." },
  { icon: Bot, title: "Llama a quien no responde", text: "Un asistente automático confirma la cita o libera el cupo." },
  { icon: Repeat2, title: "Ofrece el cupo", text: "El personal elige a quién de la lista de espera se le ofrece." },
];

const PRINCIPLES = [
  { icon: UserRoundCheck, title: "Una persona decide", text: "El sistema propone. Nunca cancela ni reasigna una cita por su cuenta." },
  { icon: HandHeart, title: "Más apoyo, no castigo", text: "Un riesgo alto significa un recordatorio y una llamada, nunca perder la cita." },
  { icon: ShieldCheck, title: "Listo para un piloto", text: "Mensajes y llamadas hoy son simulados; mañana se conectan a canales reales." },
];

export default async function Landing() {
  const f = await loadFigures();
  const kids = f.byAge.find((g) => g.group.startsWith("0"));
  const maxAge = Math.max(...f.byAge.map((g) => g.tasa), 0.01);
  const noIns = f.byInsurance.find((g) => g.group === "Sin seguro");
  const withIns = f.byInsurance.find((g) => g.group === "Con seguro");

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      {/* ---------- Hero: the problem ---------- */}
      <section className="relative overflow-hidden bg-night text-white">
        <div
          className="pointer-events-none absolute -right-40 -top-40 size-[560px] rounded-full bg-mint/10 blur-3xl"
          aria-hidden
        />
        <header className="relative mx-auto flex max-w-[1200px] items-center justify-between px-5 py-5 sm:px-8">
          <Brand tone="light" />
          <Link
            href="/panel"
            className="press rounded-full bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/15 hover:bg-white/15"
          >
            Entrar al prototipo
          </Link>
        </header>
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 px-5 pb-20 pt-8 sm:px-8 md:grid-cols-[1.15fr_1fr] md:pb-28 md:pt-14">
          <div>
            <h1 className="rise font-display text-[clamp(2.4rem,5.6vw,4.4rem)] font-extrabold leading-[1.02] tracking-[-0.03em] [text-wrap:balance]">
              Cada día, {num(f.perDay)} citas se quedan sin paciente.
            </h1>
            <p className="rise mt-6 max-w-[46ch] text-lg leading-relaxed text-white/75" style={{ "--d": "120ms" } as React.CSSProperties}>
              En 2023, en el Hospital María Auxiliadora, 1 de cada 4 citas de consulta externa no se atendió. Mientras
              tanto, otros pacientes hacían cola desde las 5 a. m. por un cupo.
            </p>
            <div className="rise mt-9 flex flex-wrap gap-3" style={{ "--d": "240ms" } as React.CSSProperties}>
              <Link href="/panel" className="press group inline-flex items-center gap-2 rounded-full bg-mint px-6 py-3 font-semibold text-night hover:bg-[#7adcc3]">
                Ver la demo
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
              </Link>
              <a href="#como-funciona" className="press rounded-full px-6 py-3 font-semibold text-white ring-1 ring-white/25 hover:bg-white/10">
                Cómo funciona
              </a>
            </div>
          </div>
          <div className="flex justify-center md:justify-end">
            <AgendaGrid emptyShare={f.rate} recoveredShare={0.21} />
          </div>
        </div>
      </section>

      {/* ---------- The problem in numbers ---------- */}
      <section className="mx-auto w-full max-w-[1200px] px-5 py-20 sm:px-8">
        <Reveal>
          <h2 className="max-w-[22ch] font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-bold leading-tight tracking-tight">
            Un cupo vacío es una consulta que alguien necesitaba.
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { v: num(f.noShows), t: "citas no atendidas en 2023" },
            { v: pct(f.rate, 1), t: "de todas las citas programadas" },
            { v: kids ? pct(kids.tasa) : "", t: "de las citas de niños de 0 a 11 años" },
          ].map((s, i) => (
            <Reveal key={s.t} delay={i * 90}>
              <div className="h-full rounded-2xl bg-surface p-6 ring-1 ring-line">
                <p className="font-display text-5xl font-extrabold tracking-tight text-brand">{s.v}</p>
                <p className="mt-2 text-muted">{s.t}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={120}>
          <div className="mt-4 grid gap-8 rounded-2xl bg-surface p-6 ring-1 ring-line md:grid-cols-[1.4fr_1fr]">
            <div>
              <h3 className="font-semibold">Citas no atendidas por edad</h3>
              <ul className="mt-4 space-y-2.5">
                {f.byAge.map((g) => (
                  <li key={g.group} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-3 text-sm">
                    <span className="text-muted">{g.group} años</span>
                    <span className="h-2.5 rounded-full bg-sunken">
                      <span className="block h-full rounded-full bg-brand" style={{ width: `${(g.tasa / maxAge) * 100}%` }} />
                    </span>
                    <span className="text-right font-semibold tabular-nums">{pct(g.tasa)}</span>
                  </li>
                ))}
              </ul>
            </div>
            {noIns && withIns && (
              <div className="flex flex-col justify-center gap-4 border-line md:border-l md:pl-8">
                <p className="text-sm text-muted">Sin seguro de salud se falta más</p>
                <div className="flex items-end gap-6">
                  <div>
                    <p className="font-display text-4xl font-extrabold text-risk-alto">{pct(noIns.tasa)}</p>
                    <p className="text-sm text-muted">sin seguro</p>
                  </div>
                  <div>
                    <p className="font-display text-4xl font-extrabold text-ink">{pct(withIns.tasa)}</p>
                    <p className="text-sm text-muted">con seguro</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Reveal>
      </section>

      {/* ---------- The proposal ---------- */}
      <section id="como-funciona" className="scroll-mt-6 bg-surface">
        <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8">
          <Reveal>
            <h2 className="font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-bold leading-tight tracking-tight">
              Cuatro pasos. Una persona decide.
            </h2>
          </Reveal>
          <ol className="relative mt-12 grid gap-6 md:grid-cols-4">
            <span className="absolute left-6 right-6 top-6 hidden h-px bg-gradient-to-r from-brand/0 via-brand/40 to-brand/0 md:block" aria-hidden />
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title}>
                <Reveal delay={i * 110}>
                  <span className="relative grid size-12 place-items-center rounded-2xl bg-brand text-white shadow-[0_8px_24px_-8px_rgba(14,90,87,0.6)]">
                    <Icon className="size-6" aria-hidden />
                    <span className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-mint text-xs font-bold text-night">
                      {i + 1}
                    </span>
                  </span>
                  <h3 className="mt-5 font-display text-xl font-bold">{title}</h3>
                  <p className="mt-1.5 text-muted">{text}</p>
                </Reveal>
              </li>
            ))}
          </ol>

          <Reveal delay={100}>
            <div className="mt-14 grid items-center gap-8 rounded-3xl bg-night p-8 text-white md:grid-cols-[1fr_1.1fr] md:p-10">
              <div>
                <Sparkles className="size-6 text-mint" aria-hidden />
                <p className="mt-3 font-display text-2xl font-bold leading-snug">
                  El 10 % de citas con más riesgo concentra casi el doble de inasistencias.
                </p>
                <p className="mt-2 text-sm text-white/60">Prueba con citas reales de octubre a diciembre de 2023.</p>
              </div>
              <div className="space-y-4">
                <CompareBar label="Lista de llamadas (10 % de mayor riesgo)" value={f.listPrecision} tone="bg-mint" />
                <CompareBar label="Promedio de todas las citas" value={f.average} tone="bg-white/35" />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- Principles ---------- */}
      <section className="mx-auto w-full max-w-[1200px] px-5 py-20 sm:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {PRINCIPLES.map(({ icon: Icon, title, text }, i) => (
            <Reveal key={title} delay={i * 90}>
              <div className="h-full rounded-2xl bg-surface p-6 ring-1 ring-line">
                <Icon className="size-7 text-brand" aria-hidden />
                <h3 className="mt-4 font-display text-lg font-bold">{title}</h3>
                <p className="mt-1 text-muted">{text}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={80}>
          <div className="mt-16 flex flex-col items-start justify-between gap-6 rounded-3xl bg-brand p-8 text-white md:flex-row md:items-center md:p-10">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight">Véalo funcionar en vivo</h2>
              <p className="mt-1 text-white/75">Panel, tablero y teléfonos de pacientes, conectados en tiempo real.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/panel" className="press inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 font-semibold text-brand hover:bg-mint-soft">
                Abrir el panel <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link href="/demo" className="press rounded-full px-5 py-3 font-semibold ring-1 ring-white/40 hover:bg-white/10">
                Códigos QR
              </Link>
            </div>
          </div>
        </Reveal>
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
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-white/75">{label}</span>
        <span className="shrink-0 font-display text-2xl font-bold tabular-nums">{pct(value)}</span>
      </div>
      <div className="mt-1.5 h-3 rounded-full bg-white/10">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}
