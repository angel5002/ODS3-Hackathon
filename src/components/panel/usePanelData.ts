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

function announce(prev: Row | undefined, next: Row) {
  if (!prev || prev.status === next.status) {
    if (!prev && next.origin === "lista_espera") {
      toast.success(`${next.patient.short_name} tomó el cupo de ${next.specialty} de las ${next.time}`, {
        description: "Nueva cita registrada desde la lista de espera.",
      });
    }
    return;
  }
  const who = next.patient.short_name;
  const by = next.status_channel === "voz" ? "en la llamada" : next.status_channel === "mensaje" ? "por mensaje" : "";
  if (next.status_channel === "panel") return; // the staff member just did it
  const messages: Partial<Record<Status, () => void>> = {
    confirmada: () => toast.success(`${who} confirmó ${by}`.trim(), { description: `${next.specialty}, ${next.time}` }),
    liberada: () =>
      toast(`${who} liberó su cupo ${by}`.trim(), {
        description: `${next.specialty}, ${next.time}. Puede ofrecerlo a la lista de espera.`,
      }),
    derivada_a_persona: () => toast.warning(`${who} pide hablar con una persona`, { description: next.specialty }),
    sin_respuesta: () =>
      prev.status === "en_llamada" ? toast(`${who} no contestó la llamada`, { description: next.specialty }) : undefined,
    reasignada: () => toast.success(`Cupo de ${next.specialty} de las ${next.time} reasignado`),
  };
  messages[next.status]?.();
}

export function usePanelData() {
  const [rows, setRows] = useState<Map<number, Row>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<Map<number, number>>(new Map());
  const [revision, setRevision] = useState(0);
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

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
    const prev = rowsRef.current;
    const stamp = Date.now();
    for (const r of data) announce(prev.get(r.id), r);
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
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch from an external system
    loadAll();
  }, [loadAll]);

  useHints((h) => {
    if (h.kind === "bulk" || !h.appts.length) loadAll();
    else loadSome(h.appts);
  });

  return { rows, loading, error, flash, revision, reload: loadAll };
}
