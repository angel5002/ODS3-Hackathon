"use client";

// /demo · Voz en vivo (E5, hito 2): active voice sessions, the queue and the latest voice events
// (voice_events). States, codes and reasons only: no names, no transcripts.
import { useEffect } from "react";
import { AudioLines } from "lucide-react";
import { Card } from "@/components/ui";
import { useServerView } from "@/components/panel/useStaffView";

type Session = { id: string; call_id: number; owner_kind: string; state: string; agent: string | null; created_at: string; ended_reason: string | null; has_conversation: boolean };
type Event = { session: string | null; call_id: number | null; at: string; source: string; kind: string; detail: Record<string, unknown> };
type Overview = { active: number; queued: number; sessions: Session[]; events: Event[] };

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

export function VoiceSessionsCard() {
  const { data, reload } = useServerView<Overview>("/api/staff/data?view=voice", ["full", "live", "call", "bulk"]);
  // voice sessions change without a database hint (heartbeats): refresh every 5 s while visible
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === "visible" && reload(), 5000);
    return () => clearInterval(id);
  }, [reload]);

  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <AudioLines className="size-4" aria-hidden /> Voz en vivo
      </h2>
      <p className="mt-1 text-sm text-muted">
        {data ? `${data.active} llamada${data.active === 1 ? "" : "s"} de voz activa${data.active === 1 ? "" : "s"} · ${data.queued} en la fila` : "Cargando…"}
      </p>
      {!!data?.sessions.length && (
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line text-sm">
          {data.sessions.slice(0, 8).map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1.5">
              <span className="font-mono text-xs text-faint">{s.id}</span>
              <span>Llamada {s.call_id}</span>
              <span className="text-xs text-muted">{s.owner_kind === "chat" ? "chat" : "teléfono"}</span>
              <span className="font-semibold">{STATE[s.state] ?? s.state}</span>
              {s.ended_reason && <span className="text-xs text-muted">{s.ended_reason}</span>}
              <span className="ml-auto text-xs tabular-nums text-faint">{time(s.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
      {!!data?.events.length && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted">Eventos de voz recientes ({data.events.length})</summary>
          <ol className="mt-1 max-h-56 space-y-0.5 overflow-y-auto font-mono">
            {data.events.map((e, i) => (
              <li key={i}>
                {time(e.at)} · {e.session ?? "—"} · {e.source} · {e.kind}
                {Object.keys(e.detail ?? {}).length ? ` · ${JSON.stringify(e.detail).slice(0, 120)}` : ""}
              </li>
            ))}
          </ol>
        </details>
      )}
    </Card>
  );
}
