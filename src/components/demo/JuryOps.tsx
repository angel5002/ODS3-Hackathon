"use client";

// /demo OPERAR: the jury's cards (track E, docs/jurado.md). One click per step, always decided by the operator:
// categorize a request the jury registered (the regulator's regulate(), P1–P4), send the offer of its slot
// (approve_offer_v51: candidates in priority order) and close the window (close_offer_v51). Props only.
import { IdCard } from "lucide-react";
import type { JuryOp } from "@/lib/jury/overview";

type Run = (action: string, body?: Record<string, unknown>, success?: string) => Promise<boolean>;
const CATS = ["P1", "P2", "P3", "P4"] as const;

export function JuryOpsPanel({ ops, busy, run }: { ops: JuryOp[] | null; busy: string; run: Run }) {
  const pending = (ops ?? []).filter((o) => o.next);
  const opened = (ops ?? []).filter((o) => o.status !== "Sin abrir").length;
  return (
    <section aria-label="Cartillas del jurado" className="flex min-h-0 shrink-0 flex-col rounded-2xl border border-(--cc-border) bg-(--cc-surface) p-4 xl:max-h-[45%] 2xl:p-5">
      <div className="flex items-baseline gap-2">
        <IdCard className="size-5 shrink-0 self-center text-(--cc-accent) 2xl:size-6" aria-hidden />
        <h2 className="text-[17px] font-bold leading-tight 2xl:text-[20px]">Cartillas del jurado</h2>
        <span className="ml-auto text-[13px] text-(--cc-text-2) 2xl:text-[15px]">{ops ? `${opened} de ${ops.length} abiertas` : "Cargando"}</span>
      </div>
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {ops && !pending.length && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-(--cc-subtle) px-3 py-2 text-[14px] text-(--cc-text-2)">
            <span className="flex-1">Nada por decidir. Aquí aparecen las solicitudes del jurado para categorizar, ofrecer y cerrar.</span>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => run("jury_prepare", {}, "Cartillas listas")}
              className="min-h-10 rounded-lg border border-(--cc-control) bg-(--cc-surface) px-3 text-[13px] font-bold hover:bg-(--cc-subtle) disabled:opacity-60"
            >
              Preparar cartillas
            </button>
          </div>
        )}
        <ul className="flex flex-col gap-1.5">
          {pending.map((o) => (
            <li key={o.token} className="rounded-lg border border-(--cc-border) px-2.5 py-2">
              <p className="text-[14px] leading-tight 2xl:text-[16px]">
                <strong>{o.character}</strong>
                <span className="text-(--cc-text-2)">
                  {o.request ? ` · ${o.request.code} · ${o.request.specialty}${o.request.category ? ` · ${o.request.category}` : ""}` : ""} · {o.status}
                </span>
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {o.next === "categorizar" &&
                  CATS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      disabled={!!busy}
                      onClick={() => run("jury_categorize", { code: o.request!.code, category: c }, `${o.character}: categorizada ${c}`)}
                      aria-label={`Categorizar ${o.character} como ${c}`}
                      className="min-h-10 min-w-11 rounded-lg border border-(--cc-control) bg-(--cc-surface) px-2 text-[14px] font-bold hover:bg-(--cc-subtle) disabled:opacity-60"
                    >
                      {c}
                    </button>
                  ))}
                {o.next === "ofrecer" && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => run("jury_offer", { token: o.token }, `Oferta enviada (${o.character})`)}
                    className="min-h-10 rounded-lg bg-(--cc-primary) px-3 text-[14px] font-bold text-(--cc-on-primary) disabled:opacity-60"
                  >
                    {o.kind === "cancela" ? "Ofrecer su cupo" : "Ofrecer un cupo"}
                  </button>
                )}
                {o.next === "cerrar" && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => run("jury_close", { token: o.token }, `Oferta cerrada (${o.character})`)}
                    className="min-h-10 rounded-lg bg-(--cc-primary) px-3 text-[14px] font-bold text-(--cc-on-primary) disabled:opacity-60"
                  >
                    Cerrar y asignar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
