"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FastForward, RotateCcw, Send, Smartphone } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { post } from "@/lib/post";
import { demoNowMin, fmtMin, num, pct, years } from "@/lib/labels";
import { useDemoState, useNow, useStaffTick } from "@/lib/realtime";
import type { DemoState } from "@/lib/types";

type QrCard = {
  id: string;
  full_name: string;
  age: number;
  demo_label: string;
  demo_order: number;
  caregiver_name: string | null;
  caregiver_relation: string | null;
  url: string;
  svg: string;
  detail: string;
};
type Assumptions = Record<string, number> | null;

export function DemoControls({ cards, assumptions }: { cards: QrCard[]; assumptions: Assumptions }) {
  const state = useDemoState();
  const now = useNow(1000);
  const [busy, setBusy] = useState("");
  useStaffTick(Boolean(state?.clock_started_at));

  async function run(action: string, body: Record<string, unknown> = {}, success?: string) {
    setBusy(action);
    try {
      const res = await post<{ sent?: number }>("/api/staff", { action, ...body });
      if (success) toast.success(success.replace("{n}", num(res.sent ?? 0)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="mx-auto max-w-[1300px] space-y-5 px-4 py-5 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Demo y códigos QR</h1>
        <p className="text-sm text-muted">
          Cada código abre el teléfono simulado de un paciente preparado. Escanéelo con un celular real; ningún mensaje ni
          llamada sale a números reales.
        </p>
      </div>

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((c) => (
          <li key={c.id}>
            <Card className="flex h-full flex-col p-3">
              <p className="text-sm font-semibold text-brand">Teléfono {c.demo_order}</p>
              <p className="mt-0.5 font-bold leading-tight">{c.full_name}</p>
              <p className="text-xs text-muted">
                {years(c.age)}{c.caregiver_name ? ` · responde ${c.caregiver_name} (${c.caregiver_relation})` : ""}
              </p>
              <p className="mt-1 text-sm">{c.demo_label}</p>
              <p className="mt-0.5 text-xs text-muted">{c.detail}</p>
              <div className="mx-auto mt-3 w-full max-w-[180px] [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: c.svg }} role="img" aria-label={`Código QR del teléfono de ${c.full_name}`} />
              <a href={c.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-brand underline-offset-2 hover:underline">
                <Smartphone className="size-4" aria-hidden /> Abrir aquí
              </a>
              <p className="mt-1 break-all text-center text-[11px] text-faint">{c.url}</p>
            </Card>
          </li>
        ))}
      </ol>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="p-4">
          <h2 className="font-semibold">Reloj y etapas de la demo</h2>
          <p className="mt-1 text-sm text-muted">
            Hora de la demo: <strong className="tabular-nums text-ink">{state ? fmtMin(demoNowMin(state, now)) : "--:--"}</strong>{" "}
            {state?.clock_started_at ? `(avanza ${state.speed} veces más rápido que el reloj real)` : "(arranca al enviar los recordatorios)"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" disabled={!!busy} onClick={() => run("reminders", {}, "Recordatorios enviados a {n} citas")}>
              <Send className="size-4" aria-hidden /> 1. Enviar recordatorios
            </Button>
            <Button disabled={!!busy || !state?.clock_started_at} onClick={() => run("advance", { minutes: 30 }, "Reloj adelantado 30 minutos")}>
              <FastForward className="size-4" aria-hidden /> Adelantar 30 min
            </Button>
            <Button
              disabled={!!busy || !state?.clock_started_at}
              onClick={() => run("advance", { minutes: state?.reply_deadline_min ?? 180 }, "Plazo de respuesta cumplido")}
            >
              <FastForward className="size-4" aria-hidden /> 2. Cerrar el plazo de respuesta
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">
            Al cerrar el plazo, las citas que no respondieron pasan a «Sin respuesta» y el panel propone llamarlas.
          </p>
          <div className="mt-5 border-t border-line pt-4">
            <Button
              variant="danger"
              disabled={!!busy}
              onClick={() => {
                if (window.confirm("¿Reiniciar la demo? Se borran mensajes, llamadas, ofertas y reasignaciones, y todas las citas vuelven a «Pendiente».")) {
                  run("reset", {}, "Demo reiniciada");
                }
              }}
            >
              <RotateCcw className="size-4" aria-hidden /> Reiniciar demo
            </Button>
          </div>
        </Card>

        {state && <Settings key={state.version} state={state} busy={!!busy} onSave={(s) => run("settings", { settings: s }, "Ajustes guardados")} />}
      </div>

      {assumptions && (
        <Card className="p-4">
          <h2 className="font-semibold">Supuestos de la simulación</h2>
          <p className="mt-1 max-w-[80ch] text-sm text-muted">
            Los pacientes sin código QR responden solos para que el tablero se mueva como en un día real. Son supuestos, no
            datos: la probabilidad de no responder es {pct(assumptions.no_reply_base)} + {pct(assumptions.no_reply_per_risk)} × riesgo;
            entre quienes responden, la de liberar el cupo es {pct(assumptions.release_base)} + {pct(assumptions.release_per_risk)} × riesgo,
            y {pct(assumptions.talk_to_person)} pide hablar con una persona. Responden entre 3 y {assumptions.max_delay_min} minutos
            después del recordatorio.
          </p>
        </Card>
      )}
    </main>
  );
}

function Settings({ state, busy, onSave }: { state: DemoState; busy: boolean; onSave: (s: Record<string, unknown>) => void }) {
  const [v, setV] = useState({
    threshold_high: Math.round(state.threshold_high * 100),
    threshold_mid: Math.round(state.threshold_mid * 100),
    call_list_pct: Math.round(state.call_list_pct * 100),
    reply_deadline_min: state.reply_deadline_min,
    offer_deadline_min: state.offer_deadline_min,
    speed: state.speed,
    simulate_others: state.simulate_others,
  });
  const field = (k: keyof typeof v, label: string, unit: string, min: number, max: number) => (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          min={min}
          max={max}
          value={v[k] as number}
          onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })}
          className="w-20 rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-right tabular-nums"
        />
        <span className="w-14 text-muted">{unit}</span>
      </span>
    </label>
  );
  return (
    <Card className="p-4">
      <h2 className="font-semibold">Ajustes (supuestos editables)</h2>
      <form
        className="mt-3 space-y-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            ...v,
            threshold_high: v.threshold_high / 100,
            threshold_mid: v.threshold_mid / 100,
            call_list_pct: v.call_list_pct / 100,
          });
        }}
      >
        {field("threshold_high", "Riesgo alto desde", "%", 5, 99)}
        {field("threshold_mid", "Riesgo medio desde", "%", 1, 98)}
        {field("call_list_pct", "Tamaño de la lista de llamadas", "% citas", 1, 50)}
        {field("reply_deadline_min", "Plazo para responder el recordatorio", "min", 10, 600)}
        {field("offer_deadline_min", "Plazo para aceptar un cupo ofrecido", "min", 5, 240)}
        {field("speed", "Velocidad del reloj de la demo", "× real", 1, 600)}
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Simular respuestas de los pacientes sin QR</span>
          <input type="checkbox" checked={v.simulate_others} onChange={(e) => setV({ ...v, simulate_others: e.target.checked })} className="size-5 accent-brand" />
        </label>
        <p className="text-xs text-muted">
          Umbrales por defecto: el 10 % de mayor riesgo y el 35 % siguiente en octubre a diciembre de 2023.
        </p>
        <Button type="submit" disabled={busy}>
          Guardar ajustes
        </Button>
      </form>
    </Card>
  );
}
