"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Headset } from "lucide-react";
import { Button } from "@/components/ui";
import { post } from "@/lib/post";
import { TASK_TYPE, fmtMin, num } from "@/lib/labels";
import { useServerView } from "@/components/panel/useStaffView";
import { Pill } from "@/components/panel/badges";

type Task = {
  id: number;
  type: keyof typeof TASK_TYPE;
  state: string;
  outcome: string | null;
  note: string | null;
  source: string;
  handled_by: string | null;
  created_min: number | null;
  open: boolean;
  request_code: string | null;
  name: string | null;
  specialty: string | null;
  appt_time: string | null;
  appt_date: string | null;
  appointment_id: number | null;
  assignment_id: number | null;
  chat_alias: string | null;
};
type Load = { total: number; closed: number; agent: number; byType: Record<string, number> };

// A short script per task type: what the person says on the phone.
const SCRIPT: Record<string, string> = {
  pide_persona: "Buenos días, le llamo del equipo de citas del hospital porque pidió hablar con una persona. ¿En qué le puedo ayudar con su cita?",
  derivacion_clinica: "Le llamo porque tenía una duda clínica que el asistente no puede responder. Voy a tomar nota para que la revise un profesional.",
  validacion_fallida: "Le llamo para confirmar el cupo que se le asignó. ¿Es usted el paciente o su cuidador? ¿Podrá asistir en la fecha indicada?",
  p1_no_contactable: "Le llamamos por su solicitud prioritaria: necesitamos confirmar sus datos de contacto para darle un cupo pronto.",
  alarma: "Le llamo porque mencionó signos de alarma. ¿Pudo acudir a emergencia? Si no, por favor acuda ahora o llame al 106.",
};

const SOURCE: Record<string, string> = { chat: "Chat", mensaje: "Mensaje", agente: "Agente de voz", regulador: "Regulador", sistema: "Sistema", telefono: "Teléfono" };
const OUTCOMES = [
  ["confirmo", "Confirmó"],
  ["rechazo", "Rechazó"],
  ["no_contesto", "No contestó"],
  ["pidio_otra_fecha", "Pidió otra fecha"],
] as const;

export function CallCenterApp() {
  const { data, error } = useServerView<{ tasks: Task[]; load: Load }>("/api/callcenter", ["full", "bulk", "task", "req", "slot"]);
  const [busy, setBusy] = useState(0);
  const [showClosed, setShowClosed] = useState(false);
  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const open = tasks.filter((t) => t.open);
  const closed = tasks.filter((t) => !t.open);
  const groups = useMemo(() => {
    const g = new Map<string, Task[]>();
    for (const t of open) g.set(t.type, [...(g.get(t.type) ?? []), t]);
    return [...g.entries()];
  }, [open]);

  async function close(t: Task, outcome: string) {
    setBusy(t.id);
    try {
      await post("/api/callcenter", { action: "close", taskId: t.id, outcome });
      toast.success(`Tarea cerrada: ${OUTCOMES.find((o) => o[0] === outcome)?.[1]}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(0);
    }
  }

  return (
    <main className="mx-auto max-w-[1200px] space-y-4 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Call center</h1>
          <p className="mt-1 max-w-[75ch] text-sm text-muted">
            El asistente hace las llamadas repetitivas. Aquí llegan solo los casos que necesitan a una persona: piden hablar con
            alguien, una duda clínica, una validación sin éxito, un paciente P1 sin contacto o signos de alarma.
          </p>
        </div>
        <div className="rounded-2xl bg-night px-4 py-3 text-white">
          <p className="text-xs text-white/60">Carga del personal hoy</p>
          <p className="font-display text-3xl font-bold tabular-nums text-mint">{num(data?.load.total ?? 0)}</p>
          <p className="text-xs text-white/60">
            {num(data?.load.closed ?? 0)} atendidas · {num(data?.load.agent ?? 0)} derivadas por el agente
          </p>
        </div>
      </div>
      {error && <p className="text-risk-alto">{error}</p>}
      {data && !open.length && <p className="rounded-2xl bg-surface p-8 text-center text-muted ring-1 ring-line">No hay tareas abiertas.</p>}

      {groups.map(([type, list]) => (
        <section key={type} className="rounded-2xl bg-surface p-4 ring-1 ring-line">
          <h2 className="flex items-center gap-2 font-semibold">
            <Headset className="size-4 text-brand" aria-hidden /> {TASK_TYPE[type]} <span className="text-sm font-normal text-muted">({list.length})</span>
          </h2>
          <p className="mt-1 rounded-lg bg-sunken px-3 py-2 text-sm italic text-muted">Guion: «{SCRIPT[type]}»</p>
          <ul className="mt-2 divide-y divide-line">
            {list.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {t.name ?? "Paciente"}
                    {t.request_code ? <span className="font-normal text-muted"> · {t.request_code}</span> : null}
                    {t.chat_alias ? <span className="font-normal text-muted"> · chat «{t.chat_alias}»</span> : null}
                  </p>
                  <p className="text-sm text-muted">
                    {t.specialty ?? ""}
                    {t.appt_time ? ` · cita ${t.appt_time}` : ""} · desde {SOURCE[t.source] ?? t.source}
                    {t.created_min != null ? ` · ${fmtMin(t.created_min)}` : ""}
                    {t.note ? ` · ${t.note}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {OUTCOMES.map(([id, label]) => (
                    <Button key={id} className="min-h-9 text-xs" variant={id === "confirmo" ? "primary" : "secondary"} disabled={busy === t.id} onClick={() => close(t, id)}>
                      {label}
                    </Button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {closed.length > 0 && (
        <section>
          <button onClick={() => setShowClosed(!showClosed)} className="text-sm font-semibold text-brand hover:underline">
            {showClosed ? "Ocultar" : "Ver"} tareas atendidas ({num(closed.length)})
          </button>
          {showClosed && (
            <ul className="mt-2 divide-y divide-line rounded-2xl bg-surface ring-1 ring-line">
              {closed.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                  <span className="font-semibold">{t.name ?? "Paciente"}</span>
                  <span className="text-muted">{TASK_TYPE[t.type]}</span>
                  <span className="ml-auto">
                    <Pill tone="done">{OUTCOMES.find((o) => o[0] === t.outcome)?.[1] ?? t.outcome}</Pill>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
