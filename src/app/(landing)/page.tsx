import type { Viewport } from "next";
import Link from "next/link";
import { ArrowRight, BellRing, Bot, Brain, HandHeart, Repeat2, ShieldCheck, UserRoundCheck } from "lucide-react";
import { Brand } from "@/components/Brand";
import { SiteFooter } from "@/components/SiteFooter";
import { AgendaGrid } from "@/components/landing/AgendaGrid";
import { num, pct } from "@/lib/labels";
import { serverDb } from "@/lib/supabase/server";

export const revalidate = 3600;
export const viewport: Viewport = { themeColor: "#ffffff" };

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
  { icon: BellRing, title: "Recuerda a todos", text: "Un mensaje con cuatro opciones: confirmo, no podré asistir, reprogramar o hablar con una persona." },
  { icon: Bot, title: "Llama a quien no responde", text: "Un asistente automatizado, en el navegador, confirma la cita o, si el paciente avisa, libera el cupo." },
  { icon: Repeat2, title: "Ofrece el cupo", text: "El personal elige a quién de la lista de espera se le ofrece." },
];

const PRINCIPLES = [
  { icon: UserRoundCheck, title: "Una persona decide", text: "El sistema propone. Nunca cancela ni reasigna una cita por su cuenta." },
  { icon: HandHeart, title: "Más apoyo, no castigo", text: "Un riesgo alto significa un recordatorio y una llamada, nunca perder la cita." },
  { icon: ShieldCheck, title: "Listo para un piloto", text: "Mensajes y llamadas hoy son simulados; mañana se conectan a canales reales." },
];

// sober type scale (docs/estilo.md): headings by size and weight, never by a second typeface
const H2 = "text-[26px] font-bold leading-tight sm:text-[32px]";
const BTN = "press inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 text-[17px] font-semibold";
const PRIMARY = `${BTN} bg-brand text-white hover:bg-brand-hover`;
const SECONDARY = `${BTN} border border-line-strong bg-surface text-ink hover:bg-sunken`;

export default async function Landing() {
  const f = await loadFigures();
  const kids = f.byAge.find((g) => g.group.startsWith("0"));
  const maxAge = Math.max(...f.byAge.map((g) => g.tasa), 0.01);
  const noIns = f.byInsurance.find((g) => g.group === "Sin seguro");
  const withIns = f.byInsurance.find((g) => g.group === "Con seguro");

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-4 py-2 sm:px-8">
          <Brand />
          {/* no prefetch: /panel redirects to the PIN screen and the prefetch ended as an aborted request */}
          <Link
            href="/panel"
            prefetch={false}
            className="press inline-flex min-h-11 items-center rounded-md border border-line-strong px-4 text-[15px] font-semibold text-ink hover:bg-sunken"
          >
            Acceso del equipo
          </Link>
        </div>
      </header>

      {/* ---------- Hero: the problem ---------- */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 pb-14 pt-10 sm:px-8 md:grid-cols-[1.15fr_1fr] md:pb-20 md:pt-16">
          <div>
            <h1 className="max-w-[18ch] text-[34px] font-bold leading-[1.12] tracking-[-0.01em] [text-wrap:balance] sm:text-[48px]">
              Cada día, {num(f.perDay)} citas se quedan sin paciente.
            </h1>
            <p className="mt-5 max-w-[46ch] text-[18px] leading-relaxed text-muted">
              En 2023, en el Hospital María Auxiliadora, 1 de cada 4 citas de consulta externa no se atendió. Mientras
              tanto, otros pacientes hacían cola desde las 5 a. m. por un cupo.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link prefetch={false} href="/panel" className={PRIMARY}>
                Ver la demo
                <ArrowRight className="size-5" aria-hidden />
              </Link>
              <Link prefetch={false} href="/pedir-cita" className={SECONDARY}>
                Pedir una cita
              </Link>
              <a href="#como-funciona" className={`${BTN} px-1 text-brand underline decoration-1 underline-offset-4 hover:decoration-2`}>
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
      <section className="mx-auto w-full max-w-[1200px] px-4 py-14 sm:px-8 md:py-20">
        <h2 className={`max-w-[26ch] ${H2}`}>Un cupo vacío es una consulta que alguien necesitaba.</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            { v: num(f.noShows), t: "citas no atendidas en 2023" },
            { v: pct(f.rate, 1), t: "de todas las citas programadas" },
            { v: kids ? pct(kids.tasa) : "", t: "de las citas de niños de 0 a 11 años" },
          ].map((s) => (
            <div key={s.t} className="h-full rounded-2xl border border-line bg-surface p-5">
              <p className="text-[40px] font-bold leading-none tabular-nums text-brand">{s.v}</p>
              <p className="mt-2 text-muted">{s.t}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-8 rounded-2xl border border-line bg-surface p-5 md:grid-cols-[1.4fr_1fr] md:p-6">
          <div>
            <h3 className="text-[19px] font-semibold">Citas no atendidas por edad</h3>
            <ul className="mt-4 space-y-2.5">
              {f.byAge.map((g) => (
                <li key={g.group} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-3">
                  <span className="text-muted">{g.group} años</span>
                  <span className="h-3 bg-sunken">
                    <span className="block h-full bg-brand" style={{ width: `${(g.tasa / maxAge) * 100}%` }} />
                  </span>
                  <span className="text-right font-semibold tabular-nums">{pct(g.tasa)}</span>
                </li>
              ))}
            </ul>
          </div>
          {noIns && withIns && (
            <div className="flex flex-col justify-center gap-4 border-line md:border-l md:pl-8">
              <p className="text-muted">Sin seguro de salud se falta más</p>
              <div className="flex items-end gap-8">
                <div>
                  <p className="text-[34px] font-bold leading-none tabular-nums text-risk-alto">{pct(noIns.tasa)}</p>
                  <p className="mt-1 text-muted">sin seguro</p>
                </div>
                <div>
                  <p className="text-[34px] font-bold leading-none tabular-nums text-ink">{pct(withIns.tasa)}</p>
                  <p className="mt-1 text-muted">con seguro</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ---------- The proposal ---------- */}
      <section id="como-funciona" className="scroll-mt-6 border-y border-line bg-surface">
        <div className="mx-auto max-w-[1200px] px-4 py-14 sm:px-8 md:py-20">
          <h2 className={H2}>Cuatro pasos. Una persona decide.</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="border-t-4 border-brand pt-4">
                <p className="flex items-center gap-2 text-[15px] font-semibold text-brand">
                  <Icon className="size-5" aria-hidden /> Paso {i + 1}
                </p>
                <h3 className="mt-2 text-[19px] font-semibold">{title}</h3>
                <p className="mt-1 text-muted">{text}</p>
              </li>
            ))}
          </ol>

          <div className="mt-12 grid items-center gap-8 rounded-2xl border border-line border-l-4 border-l-brand bg-paper p-5 md:grid-cols-[1fr_1.1fr] md:p-8">
            <div>
              <p className="text-[22px] font-bold leading-snug">El 10 % de citas con más riesgo concentra casi el doble de inasistencias.</p>
              <p className="mt-2 text-muted">Prueba con citas reales de octubre a diciembre de 2023.</p>
            </div>
            <div className="space-y-4">
              <CompareBar label="Lista de llamadas (10 % de mayor riesgo)" value={f.listPrecision} tone="bg-brand" />
              <CompareBar label="Promedio de todas las citas" value={f.average} tone="bg-line-strong" />
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Principles ---------- */}
      <section className="mx-auto w-full max-w-[1200px] px-4 py-14 sm:px-8 md:py-20">
        <div className="grid gap-4 md:grid-cols-3">
          {PRINCIPLES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="h-full rounded-2xl border border-line bg-surface p-5">
              <Icon className="size-6 text-brand" aria-hidden />
              <h3 className="mt-3 text-[19px] font-semibold">{title}</h3>
              <p className="mt-1 text-muted">{text}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-6 rounded-2xl border border-line bg-surface p-5 md:flex-row md:items-center md:p-8">
          <div>
            <h2 className="text-[26px] font-bold leading-tight">Véalo funcionar en vivo</h2>
            <p className="mt-1 text-muted">Panel, tablero, teléfonos de pacientes y la página para pedir una cita, conectados en tiempo real.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link prefetch={false} href="/panel" className={PRIMARY}>
              Abrir el panel <ArrowRight className="size-5" aria-hidden />
            </Link>
            <Link prefetch={false} href="/pedir-cita" className={SECONDARY}>
              Pedir una cita
            </Link>
            <Link prefetch={false} href="/demo" className={SECONDARY}>
              Códigos QR
            </Link>
          </div>
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
        <span className="shrink-0 text-[24px] font-bold tabular-nums">{pct(value)}</span>
      </div>
      <div className="mt-1.5 h-3 bg-sunken">
        <div className={`h-full ${tone}`} style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}
