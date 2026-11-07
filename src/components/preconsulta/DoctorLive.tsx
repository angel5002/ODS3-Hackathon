"use client";

// Live doctor's view of ONE pre-visit: polls the staff route every 1.5 s (short polling; the answers are few and
// the projector must not depend on a Realtime channel) and lets the doctor correct a field (recorded).
// Also a small desk for staff: create a pre-visit link for a fictitious patient and pick one to follow.
import { useCallback, useEffect, useState } from "react";
import { Copy, Plus } from "lucide-react";
import { DoctorSummary, type PreconsultaEdit } from "./DoctorSummary";
import type { PreconsultaDetail } from "@/lib/preconsulta/machine";

export type DoctorDetail = {
  id: string;
  status: string;
  version: number;
  summary: PreconsultaDetail;
  edits: PreconsultaEdit[];
  transcript: { id: number; who: "ia" | "persona"; text: string }[];
  path: string;
};

export type DoctorLiveProps = {
  sessionId: string;
  /** polling interval (ms), default 1500 */
  pollMs?: number;
  /** show "Corregir" on the text fields (default true) */
  editable?: boolean;
  /** show the conversation under the summary, to audit it (default false) */
  showTranscript?: boolean;
  compact?: boolean;
  className?: string;
};

export function DoctorLive({ sessionId, pollMs = 1500, editable = true, showTranscript = false, compact, className = "" }: DoctorLiveProps) {
  const [d, setD] = useState<DoctorDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = `/api/staff/preconsulta?id=${encodeURIComponent(sessionId)}`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar la preconsulta.");
      setD(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la preconsulta.");
    }
  }, [url]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, pollMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load, pollMs]);

  const onEdit = useCallback(
    async (field: string, value: string) => {
      const res = await fetch("/api/staff/preconsulta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", id: sessionId, field, value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar.");
      setD(data);
    },
    [sessionId],
  );

  return (
    <div className={className}>
      {error && !d && <p className="rounded-md border border-line bg-surface p-3 text-muted">{error}</p>}
      <DoctorSummary summary={d?.summary ?? null} edits={d?.edits} onEdit={editable ? onEdit : undefined} compact={compact} />
      {showTranscript && d && d.transcript.length > 0 && (
        <details className="mt-3 rounded-md border border-line bg-surface p-3">
          <summary className="cursor-pointer text-[15px] font-semibold">Conversación completa (para auditar el resumen)</summary>
          <ol className="mt-2 space-y-1 text-[15px]">
            {d.transcript.map((m) => (
              <li key={m.id}>
                <span className="font-semibold">{m.who === "ia" ? "Asistente" : "Paciente"}:</span> {m.text}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

type ListItem = { id: string; patient_alias: string; status: string; appointment_time: string | null; source: string; updated_at: string; path: string };

const STATUS: Record<string, string> = {
  pendiente: "Sin empezar",
  en_curso: "En curso",
  completa: "Completa",
  derivada_emergencia: "Derivada a emergencia",
  con_persona: "Pidió una persona",
};

export type PreconsultaDeskProps = { className?: string };

/** Staff desk: create a link for a fictitious patient, list the recent ones, follow one live. */
export function PreconsultaDesk({ className = "" }: PreconsultaDeskProps) {
  const [list, setList] = useState<ListItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [alias, setAlias] = useState("");
  const [time, setTime] = useState("10:15");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/staff/preconsulta", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setList(data.sessions ?? []);
    else setMsg(data.error ?? "No se pudo cargar la lista.");
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const id = setInterval(() => document.visibilityState === "visible" && void load(), 4000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load]);

  const create = async () => {
    const res = await fetch("/api/staff/preconsulta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", alias: alias || "Paciente", time }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg(data.error ?? "No se pudo crear.");
    setAlias("");
    setSelected(data.id);
    setMsg(`Enlace creado: ${location.origin}${data.path}`);
    void load();
  };

  return (
    <div className={`grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr] ${className}`}>
      <div>
        <form
          className="rounded-md border border-line bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <h2 className="text-[17px] font-bold">Nueva preconsulta</h2>
          <label className="mt-3 block text-[14px] font-semibold" htmlFor="pc-alias">
            Nombre ficticio del paciente
          </label>
          <input id="pc-alias" value={alias} maxLength={30} onChange={(e) => setAlias(e.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-line-strong px-3" />
          <label className="mt-3 block text-[14px] font-semibold" htmlFor="pc-time">
            Hora de la cita
          </label>
          <input id="pc-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-line-strong px-3" />
          <button type="submit" className="press mt-3 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 font-semibold text-white hover:bg-brand-hover">
            <Plus className="size-4" aria-hidden /> Crear enlace
          </button>
          {msg && (
            <p className="mt-2 flex items-start gap-2 break-all text-[14px] text-muted">
              {msg}
              {msg.startsWith("Enlace") && (
                <button type="button" onClick={() => void navigator.clipboard?.writeText(msg.replace("Enlace creado: ", ""))} className="shrink-0 text-brand">
                  <Copy className="size-4" aria-hidden />
                  <span className="sr-only">Copiar enlace</span>
                </button>
              )}
            </p>
          )}
        </form>
        <ul className="mt-4 divide-y divide-line rounded-md border border-line bg-surface">
          {list.length === 0 && <li className="p-3 text-muted">Todavía no hay preconsultas.</li>}
          {list.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSelected(s.id)}
                aria-current={selected === s.id}
                className={`press flex min-h-12 w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-sunken ${selected === s.id ? "bg-brand-soft" : ""}`}
              >
                <span className="font-semibold">{s.patient_alias}</span>
                <span className="text-[14px] text-muted">
                  {STATUS[s.status] ?? s.status}
                  {s.appointment_time ? ` · ${s.appointment_time}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div>{selected ? <DoctorLive key={selected} sessionId={selected} showTranscript /> : <p className="text-muted">Elija una preconsulta para ver su resumen.</p>}</div>
    </div>
  );
}
