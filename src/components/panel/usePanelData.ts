"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { browserDb, fetchAll } from "@/lib/supabase/browser";
import { useHints } from "@/lib/realtime";
import type { Appointment, Patient, Status } from "@/lib/types";

export type Row = Pick<
  Appointment,
  | "id"
  | "patient_id"
  | "specialty"
  | "time"
  | "risk"
  | "risk_rank"
  | "status"
  | "status_at"
  | "status_channel"
  | "origin"
  | "replaces_id"
  | "reassigned_to_id"
  | "remote"
  | "is_base"
> & {
  patient: Pick<Patient, "full_name" | "short_name" | "age" | "caregiver_name" | "caregiver_relation" | "demo_role" | "token">;
};

type Query<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export const ROW_SELECT =
  "id,patient_id,specialty,time,risk,risk_rank,status,status_at,status_channel,origin,replaces_id,reassigned_to_id,remote,is_base," +
  "patient:patients(full_name,short_name,age,caregiver_name,caregiver_relation,demo_role,token)";

type AnnounceEvent = {
  id: number;
  appointment_id: number;
  from_status: Status | null;
  to_status: Status | null;
  channel: string;
  patient: { short_name: string } | null;
  appointment: { specialty: string; time: string; origin: string } | null;
};

// RF-34: notices come from the log (events), so they never depend on which
// refetch won a race. Each event is announced once.
function announce(e: AnnounceEvent) {
  const who = e.patient?.short_name ?? "";
  const where = e.appointment ? `${e.appointment.specialty}, ${e.appointment.time}` : "";
  const by = e.channel === "voz" ? "en la llamada" : "por mensaje";
  if (e.appointment?.origin === "lista_espera" && e.to_status === "confirmada") {
    toast.success(`${who} tomó el cupo de ${where}`, { description: "Nueva cita registrada desde la lista de espera." });
    return;
  }
  const messages: Partial<Record<Status, () => void>> = {
    confirmada: () => toast.success(`${who} confirmó ${by}`, { description: where }),
    liberada: () => toast(`${who} liberó su cupo ${by}`, { description: `${where}. Puede ofrecerlo a la lista de espera.` }),
    derivada_a_persona: () => toast.warning(`${who} pide hablar con una persona`, { description: where }),
    sin_respuesta: () => (e.from_status === "en_llamada" ? toast(`${who} no contestó la llamada`, { description: where }) : undefined),
    reasignada: () => toast.success(`Cupo de ${where} reasignado`),
  };
  if (e.to_status) messages[e.to_status]?.();
}

export function usePanelData() {
  const [rows, setRows] = useState<Map<number, Row>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<Map<number, number>>(new Map());
  const [revision, setRevision] = useState(0);
  const rowsRef = useRef(rows);
  const lastEvent = useRef<number | null>(null);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // Only actions by patients, the voice agent or the waitlist (not simulated replies, not the panel itself)
  const announceNew = useCallback(async (ids: number[]) => {
    if (lastEvent.current == null) return;
    const { data } = await browserDb()
      .from("events")
      .select("id,appointment_id,from_status,to_status,channel,patient:patients(short_name),appointment:appointments(specialty,time,origin)")
      .in("appointment_id", ids)
      .gt("id", lastEvent.current)
      .in("channel", ["mensaje", "voz"])
      .eq("kind", "estado")
      .neq("actor", "Paciente (simulado)")
      .order("id");
    for (const e of (data ?? []) as unknown as AnnounceEvent[]) {
      if (e.id <= (lastEvent.current ?? 0)) continue;
      lastEvent.current = e.id;
      announce(e);
    }
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const data = await fetchAll<Row>((from, to) =>
        browserDb().from("appointments").select(ROW_SELECT).order("id").range(from, to) as unknown as Query<Row>,
      );
      const prev = rowsRef.current;
      const changed = new Map<number, number>();
      const stamp = Date.now();
      if (prev.size) for (const r of data) if (prev.get(r.id)?.status !== r.status) changed.set(r.id, stamp);
      setRows(new Map(data.map((r) => [r.id, r])));
      if (changed.size && changed.size < 200) setFlash((f) => new Map([...f, ...changed]));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setRevision((v) => v + 1);
    }
  }, []);

  const loadSome = useCallback(async (ids: number[]) => {
    const { data } = await (browserDb().from("appointments").select(ROW_SELECT).in("id", ids) as unknown as Query<Row>);
    if (!data) return;
    const stamp = Date.now();
    announceNew(ids);
    setRows((m) => {
      const next = new Map(m);
      for (const r of data) next.set(r.id, r);
      return next;
    });
    setFlash((f) => {
      const next = new Map(f);
      for (const r of data) next.set(r.id, stamp);
      return next;
    });
    setRevision((v) => v + 1);
  }, [announceNew]);


  useEffect(() => {
    browserDb()
      .from("events")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        lastEvent.current = data?.[0]?.id ?? 0;
      });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch from an external system
    loadAll();
  }, [loadAll]);

  useHints((h) => {
    if (h.kind === "bulk" || !h.appts.length) loadAll();
    else loadSome(h.appts);
  });

  return { rows, loading, error, flash, revision, reload: loadAll };
}
