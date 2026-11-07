"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Check, PhoneCall, Undo2, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui";
import { post } from "@/lib/post";
import { useDemoState, useNow } from "@/lib/realtime";
import { dateEs, demoNowMin, fmtMin } from "@/lib/labels";
import { useServerView } from "./useStaffView";
import { Pill } from "./badges";

type Pending = {
  id: number;
  name: string;
  code: string;
  specialty: string;
  date: string;
  time: string;
  deadline_min: number;
  attempts: number;
  channel: string;
  origin: string;
  simulated: boolean;
  phone_token: string | null;
};
type Recent = { id: number; name: string; code: string; specialty: string; date: string; time: string; state: string; validated_by: string | null; validated_role: string | null; reverted: boolean; revert_reason: string | null; origin: string };
type Reschedule = { appointment_id: number; name: string; specialty: string; date: string; time: string; to: { label: string } };

const VALIDATED_BY: Record<string, string> = { mensaje: "por mensaje", agente: "con el agente de voz", persona: "por una persona" };
const STATE: Record<string, { label: string; tone: string }> = {
  confirmada: { label: "Confirmada", tone: "ok" },
  fallida: { label: "No pudo", tone: "neutral" },
  vencida: { label: "Venció el plazo", tone: "warn" },
};

export function ValidateTab() {
  const { data, error, reload } = useServerView<{ assignments: Pending[]; recent: Recent[]; reschedules: Reschedule[] }>("/api/staff/data?view=validations", [
    "full",
    "bulk",
    "slot",
    "appt",
    "call",
  ]);
  const state = useDemoState();
  const now = useNow(1000);
  const nowMin = demoNowMin(state, now);
  const [busy, setBusy] = useState("");

  async function act(key: string, body: Record<string, unknown>, success?: string) {
    setBusy(key);
    try {
      await post("/api/staff", body);
      reload(); // do not wait for the Realtime hint
      if (success) toast.success(success);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 sm:px-6">
      <div>
        <h1 className="font-display text-[40px] leading-tight">Por validar</h1>
        <p className="mt-1 max-w-[70ch] text-muted">Confirme con el paciente antes de registrar la cita. Todo se puede revertir, con un motivo.</p>
      </div>
      {error && <p className="text-risk-alto">{error}</p>}

      <section className="rounded-3xl bg-surface p-5 ring-1 ring-line">
        <h2 className="font-semibold">Asignaciones por validar</h2>
        {data && !data.assignments.length && <p className="mt-1 text-sm text-muted">Ninguna asignación espera validación.</p>}
        <ul className="mt-2 divide-y divide-line">
          {data?.assignments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {a.name} <span className="font-normal text-muted">· {a.code}</span>
                </p>
                <p className="text-sm text-muted">
                  {a.specialty}, {dateEs(a.date)} a las {a.time} · {a.origin === "domino" ? "cupo liberado en cadena" : "cupo liberado"} · aviso por{" "}
                  {a.channel} · {a.attempts ? `${a.attempts} intento(s) del agente · ` : ""}vence a las {fmtMin(a.deadline_min)} (
                  {Math.max(0, a.deadline_min - nowMin)} min)
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button className="min-h-9 text-xs" disabled={!!busy} onClick={() => act(`l${a.id}`, { action: "validation_call", assignmentId: a.id }, "Llamando con el agente de validación")}>
                  <PhoneCall className="size-3.5" aria-hidden /> Llamar con el agente
                </Button>
                <Button className="min-h-9 text-xs" disabled={!!busy} onClick={() => act(`p${a.id}`, { action: "validate", assignmentId: a.id, ok: true, by: "persona" }, "Validada por una persona")}>
                  <UserCheck className="size-3.5" aria-hidden /> Validé con el paciente
                </Button>
                <Button
                  variant="primary"
                  className="min-h-9 text-xs"
                  disabled={!!busy}
                  title="Usar simulado: el paciente responde SÍ en su mensaje"
                  onClick={() => act(`s${a.id}`, { action: "validate", assignmentId: a.id, ok: true }, `${a.name.split(" ")[0]} confirmó (simulado)`)}
                >
                  <Check className="size-3.5" aria-hidden /> Usar simulado: confirma
                </Button>
                <Button className="min-h-9 text-xs" disabled={!!busy} onClick={() => act(`n${a.id}`, { action: "validate", assignmentId: a.id, ok: false }, "No puede: el cupo pasa al siguiente que aceptó")}>
                  <X className="size-3.5" aria-hidden /> No puede
                </Button>
                <RevertButton id={a.id} busy={busy} act={act} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl bg-surface p-5 ring-1 ring-line">
        <h2 className="flex items-center gap-2 font-semibold">
          <CalendarClock className="size-4 text-st-human" aria-hidden /> Reprogramaciones por aprobar
        </h2>
        {data && !data.reschedules.length && <p className="mt-1 text-sm text-muted">Ninguna reprogramación pendiente.</p>}
        <ul className="mt-2 divide-y divide-line">
          {data?.reschedules.map((r) => (
            <li key={r.appointment_id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{r.name}</p>
                <p className="text-sm text-muted">
                  {r.specialty}: del {dateEs(r.date)} {r.time} al <strong className="text-ink">{r.to?.label}</strong>. Conserva su antigüedad.
                </p>
              </div>
              <Button variant="primary" className="min-h-9 text-xs" disabled={!!busy} onClick={() => act(`r${r.appointment_id}`, { action: "review_reschedule", appointmentId: r.appointment_id, approve: true }, "Reprogramación aprobada: el cupo original queda libre")}>
                Aprobar
              </Button>
              <Button className="min-h-9 text-xs" disabled={!!busy} onClick={() => act(`r${r.appointment_id}`, { action: "review_reschedule", appointmentId: r.appointment_id, approve: false }, "Reprogramación rechazada: se mantiene la cita")}>
                Rechazar
              </Button>
            </li>
          ))}
        </ul>
      </section>

      {data && data.recent.length > 0 && (
        <section className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <h2 className="font-semibold">Asignaciones recientes</h2>
          <ul className="mt-2 divide-y divide-line">
            {data.recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="font-semibold">{r.name}</span>
                <span className="text-muted">
                  {r.specialty}, {dateEs(r.date)} {r.time}
                </span>
                {r.reverted ? (
                  <Pill tone="warn">Revertida: {r.revert_reason}</Pill>
                ) : (
                  <Pill tone={STATE[r.state]?.tone}>
                    {STATE[r.state]?.label ?? r.state} {r.validated_by ? VALIDATED_BY[r.validated_by] : ""}
                    {r.validated_role === "cuidador" ? " (cuidador)" : ""}
                  </Pill>
                )}
                {!r.reverted && r.state === "confirmada" && (
                  <span className="ml-auto">
                    <RevertButton id={r.id} busy={busy} act={act} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function RevertButton({ id, busy, act }: { id: number; busy: string; act: (k: string, b: Record<string, unknown>, ok?: string) => Promise<void> }) {
  return (
    <Button
      variant="danger"
      className="min-h-9 text-xs"
      disabled={!!busy}
      onClick={() => {
        const reason = window.prompt("Motivo para revertir la asignación (obligatorio):");
        if (reason && reason.trim()) act(`v${id}`, { action: "revert", assignmentId: id, reason }, "Asignación revertida");
      }}
    >
      <Undo2 className="size-3.5" aria-hidden /> Revertir
    </Button>
  );
}
