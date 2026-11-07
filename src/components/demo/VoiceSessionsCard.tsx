"use client";

// /demo · Voz en vivo (E5, hito 2): active voice sessions, the queue and the latest voice events
// (voice_events). States, codes and reasons only: no names, no transcripts. DemoControls loads the view and polls it.
import { AudioLines } from "lucide-react";
import { DemoCard } from "./DemoUi";

type Session = { id: string; call_id: number; owner_kind: string; state: string; agent: string | null; created_at: string; ended_reason: string | null; has_conversation: boolean };
type Event = { session: string | null; call_id: number | null; at: string; source: string; kind: string; detail: Record<string, unknown> };
export type VoiceOverview = { active: number; queued: number; sessions: Session[]; events: Event[] };

const STATE: Record<string, string> = {
  en_cola: "En la fila",
  solicitando: "Pidiendo línea",
  conectando: "Conectando",
  activa: "En llamada",
  finalizada: "Terminada",
  abandonada: "Cortada (sin señal)",
  rechazada: "Rechazada por el proveedor",
  error: "Error",
};

const time = (iso: string) => new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** "Voz en vivo", props only. */
export function VoiceSessionsView({ data }: { data: VoiceOverview | null }) {
  return (
    <DemoCard className="p-5">
      <h2 className="flex items-center gap-2 text-[19px] font-bold">
        <AudioLines className="size-5 text-(--cc-accent)" aria-hidden /> Voz en vivo
      </h2>
      <p className="mt-1 text-[14px] text-(--cc-text-2)">
        {data ? `${data.active} llamada${data.active === 1 ? "" : "s"} de voz activa${data.active === 1 ? "" : "s"} · ${data.queued} en la fila` : "Cargando"}
      </p>
      {!!data?.sessions.length && (
        <ul className="mt-3 divide-y divide-(--cc-border) rounded-md border border-(--cc-border) text-[14px]">
          {data.sessions.slice(0, 8).map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
              <span className="font-mono text-[12px] text-(--cc-text-2)">{s.id}</span>
              <span>Llamada {s.call_id}</span>
              <span className="text-[12px] text-(--cc-text-2)">{s.owner_kind === "chat" ? "chat" : "teléfono"}</span>
              <span className="font-semibold">{STATE[s.state] ?? s.state}</span>
              {s.ended_reason && <span className="text-[12px] text-(--cc-text-2)">{s.ended_reason}</span>}
              <span className="ml-auto text-[12px] tabular-nums text-(--cc-text-2)">{time(s.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
      {!!data?.events.length && (
        <details className="mt-3 text-[12px]">
          <summary className="cursor-pointer font-semibold text-(--cc-text-2)">Eventos de voz recientes ({data.events.length})</summary>
          <ol className="mt-1.5 max-h-56 space-y-0.5 overflow-y-auto overscroll-contain font-mono text-(--cc-text-2) [overflow-wrap:anywhere]">
            {data.events.map((e, i) => (
              <li key={i}>
                {time(e.at)} · {e.session ?? "—"} · {e.source} · {e.kind}
                {Object.keys(e.detail ?? {}).length ? ` · ${JSON.stringify(e.detail).slice(0, 120)}` : ""}
              </li>
            ))}
          </ol>
        </details>
      )}
    </DemoCard>
  );
}
