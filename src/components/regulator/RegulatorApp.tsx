"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EyeOff, HelpCircle, Siren } from "lucide-react";
import { Button } from "@/components/ui";
import { post } from "@/lib/post";
import { CATEGORY_TEXT, REQUEST_STATE, dateShort, num, type RequestState } from "@/lib/labels";
import { useServerView } from "@/components/panel/useStaffView";
import { RequestBadge } from "@/components/panel/badges";
import { CAT_TONE } from "@/components/panel/WaitlistTab";

type Row = {
  request_id: number;
  code: string;
  specialty: string;
  reason_text: string | null;
  age: number;
  pregnant: boolean | null;
  referral: boolean;
  first_attempt_at: string;
  state: RequestState;
  category: string | null;
  info_question: string | null;
  hours_waiting: number;
};

const DUE_HOURS = 72;

export function RegulatorApp() {
  const { data, error } = useServerView<{ rows: Row[] }>("/api/regulator", ["full", "bulk", "req"]);
  const [tab, setTab] = useState<"pendientes" | "reguladas">("pendientes");
  const [busy, setBusy] = useState("");
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const pending = rows.filter((r) => r.state === "pendiente_regulacion" || r.state === "pendiente_informacion");
  const done = rows.filter((r) => !(r.state === "pendiente_regulacion" || r.state === "pendiente_informacion"));

  async function act(r: Row, body: Record<string, unknown>, success: string) {
    setBusy(`${r.request_id}`);
    try {
      await post("/api/regulator", { requestId: r.request_id, ...body });
      toast.success(success);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="mx-auto max-w-[1200px] space-y-4 px-4 py-6 sm:px-6">
      <div>
        <h1 className="font-display text-[40px] leading-tight">Asignar prioridad</h1>
        <p className="mt-1 flex items-start gap-2 text-muted"><EyeOff className="mt-1 size-4 shrink-0 text-accent" aria-hidden />Sin nombre, documento, seguro ni distrito: solo cuenta la necesidad clínica.</p>
      </div>

      <div role="tablist" className="flex gap-1 rounded-full bg-sunken p-1 sm:inline-flex">
        {(
          [
            ["pendientes", `Pendientes (${num(pending.length)})`],
            ["reguladas", `Asignadas (${num(done.length)})`],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`min-h-10 rounded-full px-4 py-1.5 text-sm font-semibold ${tab === id ? "bg-surface shadow-sm" : "text-muted"}`}>
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-risk-alto">{error}</p>}
      {!data && !error && <p className="text-muted">Cargando…</p>}

      {tab === "pendientes" && (
        <ul className="grid gap-3 lg:grid-cols-2">
          {data && !pending.length && <li className="rounded-2xl bg-surface p-8 text-center text-muted ring-1 ring-line lg:col-span-2">No hay solicitudes pendientes.</li>}
          {pending.map((r) => {
            const late = r.hours_waiting > DUE_HOURS;
            const pct = Math.min(100, Math.round((r.hours_waiting / DUE_HOURS) * 100));
            return (
              <li key={r.request_id} className="rise rounded-3xl bg-surface p-5 ring-1 ring-line">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-[22px] tabular-nums">{r.code}</span>
                  <RequestBadge state={r.state} />
                  <span className={`ml-auto text-xs font-semibold ${late ? "text-risk-alto" : "text-muted"}`}>
                    {r.hours_waiting} h de {DUE_HOURS} h
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-md bg-sunken" role="img" aria-label={`${pct} % del plazo de regulación`}>
                  <div className={`h-full ${late ? "bg-risk-alto" : pct > 66 ? "bg-risk-medio" : "bg-accent"}`} style={{ width: `${pct}%` }} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <Info k="Especialidad" v={r.specialty} />
                  <Info k="Edad" v={`${r.age} ${r.age === 1 ? "año" : "años"}`} />
                  <Info k="Referencia" v={r.referral ? "Sí" : "No"} />
                  <Info k="Primer intento" v={dateShort(r.first_attempt_at)} />
                  {r.pregnant && <Info k="Gestación" v="Sí" />}
                </dl>
                <p className="mt-2 rounded-lg bg-sunken p-3 text-sm">
                  <span className="text-xs font-semibold text-muted">Motivo</span>
                  <span className="block">{r.reason_text || "Sin motivo escrito."}</span>
                </p>
                {r.info_question && (
                  <p className="mt-2 text-xs text-st-warn">Se pidió información: «{r.info_question}». La fecha del primer intento no cambia.</p>
                )}
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {(["P1", "P2", "P3", "P4"] as const).map((c) => (
                    <button
                      key={c}
                      disabled={busy === `${r.request_id}`}
                      onClick={() => act(r, { action: "regulate", category: c }, `${r.code} clasificada ${CATEGORY_TEXT[c]}`)}
                      className={`press flex min-h-14 flex-col items-center justify-center rounded-xl border border-line text-sm font-bold disabled:opacity-50 ${CAT_TONE[c]}`}
                      title={CATEGORY_TEXT[c]}
                    >
                      {c}
                      <span className="text-[11px] font-medium">{CATEGORY_TEXT[c].split("· ")[1]}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    className="min-h-11 rounded-full text-sm"
                    disabled={busy === `${r.request_id}`}
                    onClick={() => {
                      const q = window.prompt("¿Qué información necesita? (se le envía al paciente; su fecha no cambia)", "¿Desde cuándo tiene las molestias?");
                      if (q != null) act(r, { action: "info", question: q }, `Se pidió información sobre ${r.code}`);
                    }}
                  >
                    <HelpCircle className="size-3.5" aria-hidden /> Pedir más información
                  </Button>
                  <Button
                    variant="danger"
                    className="min-h-11 rounded-full text-sm"
                    disabled={busy === `${r.request_id}`}
                    onClick={() => {
                      if (window.confirm(`¿Derivar ${r.code} a emergencia? Se le indicará acudir a emergencia o llamar al 106 y se avisará a la central de llamadas.`)) {
                        act(r, { action: "emergency" }, `${r.code} derivada a emergencia`);
                      }
                    }}
                  >
                    <Siren className="size-3.5" aria-hidden /> Derivar a emergencia
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {tab === "reguladas" && (
        <div className="overflow-x-auto rounded-2xl bg-surface ring-1 ring-line">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-faint">
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Especialidad</th>
                <th className="px-3 py-2">Edad</th>
                <th className="px-3 py-2">Categoría</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {done.slice(0, 300).map((r) => (
                <tr key={r.request_id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 font-semibold tabular-nums">{r.code}</td>
                  <td className="px-3 py-2">{r.specialty}</td>
                  <td className="px-3 py-2">{r.age}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 text-xs font-bold ${CAT_TONE[r.category ?? "P3"]}`}>{r.category ?? "—"}</span>
                  </td>
                  <td className="px-3 py-2">{REQUEST_STATE[r.state]?.label}</td>
                  <td className="max-w-[24rem] px-3 py-2 text-muted">{r.reason_text ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
