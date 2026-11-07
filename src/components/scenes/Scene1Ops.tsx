"use client";

// /demo operation mode, scene 1 (docs/escenas.md): the staff prepares Tito (P1 assigned by a professional,
// appointment in 5 weeks) and, once the jury card "Carmen" released her Oncología Médica slot, the STAFF approves
// the offer to Tito and closes it. The AI never prioritises: these are the panel's own actions.
import { UserCheck, UserPlus, CheckCheck } from "lucide-react";

type Run = (action: string, body?: Record<string, unknown>, success?: string) => Promise<boolean>;

export function Scene1Ops({ busy, run }: { busy: string; run: Run }) {
  const btn =
    "cc-press flex min-h-11 w-full items-center gap-2 rounded-lg border-2 border-(--cc-control) bg-(--cc-surface) px-2.5 text-left text-[14px] font-bold leading-tight text-(--cc-text) hover:bg-(--cc-subtle) disabled:opacity-50 2xl:text-[16px]";
  return (
    <section aria-label="Escena 1 del pitch" className="mt-2 rounded-lg border border-(--cc-border) p-2">
      <p className="text-[13px] font-semibold text-(--cc-text-2) 2xl:text-[15px]">Escena 1 · Tito</p>
      <div className="mt-1 grid gap-1.5">
        <button type="button" disabled={!!busy} className={btn} onClick={() => run("escena1_preparar", {}, "Tito listo: P1 asignada por un profesional, cita en 5 semanas")}>
          <UserPlus className="size-4 shrink-0" aria-hidden /> Escena 1: preparar a Tito
        </button>
        <button type="button" disabled={!!busy} className={btn} onClick={() => run("escena1_aprobar", {}, "El personal aprobó la oferta; Tito aceptó por llamada")}>
          <UserCheck className="size-4 shrink-0" aria-hidden /> Escena 1: el personal aprueba la oferta a Tito
        </button>
        <button type="button" disabled={!!busy} className={btn} onClick={() => run("escena1_cerrar", {}, "Oferta cerrada: el cupo es de Tito")}>
          <CheckCheck className="size-4 shrink-0" aria-hidden /> Escena 1: cerrar la oferta y asignar
        </button>
      </div>
    </section>
  );
}
