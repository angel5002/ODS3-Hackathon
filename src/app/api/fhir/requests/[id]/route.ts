// RF-18 (P2): a request as a FHIR R4 Bundle. "FHIR R4 base; perfil peruano solo para Patient": the MINSA
// guide (https://dyaku.minsa.gob.pe/guides/, hl7.fhir.pe.CorePE 0.1) has no appointment profiles.
// Admisión only (src/proxy.ts). The Patient is pseudonymised: opaque id, no name, no document number.
import { NextResponse } from "next/server";
import { rpc, serverDb } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const PACIENTE_PE = "https://www.gob.pe/minsa/RENHICE/fhir/StructureDefinition/PacientePe";
const PRIORITY: Record<string, string> = { P1: "asap", P2: "urgent", P3: "routine", P4: "routine" };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await rpc<{ request: Record<string, unknown> | null; events: { type: string; at: string; actor: string; payload: Record<string, unknown> }[] }>(
    "staff_request_detail",
    { p_request: Number(id) },
  );
  const r = d.request;
  if (!r) return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });
  const patientRef = `Patient/${String(r.person_id).slice(0, 8)}`;
  const reg = d.events.find((e) => e.type === "regulacion");
  const entries: Record<string, unknown>[] = [
    {
      fullUrl: `urn:asistia:${patientRef}`,
      resource: {
        resourceType: "Patient",
        id: String(r.person_id).slice(0, 8),
        meta: { profile: [PACIENTE_PE] },
        // pseudonymised: no name, identifiers or contact data
        birthDate: `${2023 - Number(r.age)}`,
      },
    },
    {
      fullUrl: `urn:asistia:ServiceRequest/${r.code}`,
      resource: {
        resourceType: "ServiceRequest",
        id: r.code,
        status: ["cerrada_con_causal", "atendida", "derivada_emergencia"].includes(String(r.state)) ? "completed" : "active",
        intent: "order",
        priority: r.category ? PRIORITY[String(r.category)] : undefined,
        subject: { reference: patientRef },
        authoredOn: r.first_attempt_at,
        occurrencePeriod: { start: r.first_attempt_at, end: r.due_date ?? undefined },
        code: { text: `Consulta externa de ${r.specialty}` },
        reasonCode: r.reason_text ? [{ text: r.reason_text }] : undefined,
        note: [{ text: `Categoría ${r.category ?? "pendiente"} · índice ${r.idx} · ${r.reason}` }],
      },
    },
    {
      fullUrl: `urn:asistia:Task/regulacion-${r.code}`,
      resource: {
        resourceType: "Task",
        status: r.category ? "completed" : "requested",
        intent: "order",
        description: "Regulación clínica con vista ciega",
        focus: { reference: `ServiceRequest/${r.code}` },
        for: { reference: patientRef },
        authoredOn: r.first_attempt_at,
        output: r.category ? [{ type: { text: "categoría" }, valueString: String(r.category) }] : undefined,
        lastModified: reg?.at,
      },
    },
  ];
  if (r.current_appointment_id) {
    const { data: a } = await serverDb().from("appointments").select("id,specialty,date,time,status").eq("id", r.current_appointment_id).single();
    if (a) {
      entries.push({
        fullUrl: `urn:asistia:Appointment/${a.id}`,
        resource: {
          resourceType: "Appointment",
          id: String(a.id),
          status: a.status === "confirmada" ? "booked" : "pending",
          serviceType: [{ text: a.specialty }],
          start: `${a.date}T${a.time}:00-05:00`,
          basedOn: [{ reference: `ServiceRequest/${r.code}` }],
          participant: [{ actor: { reference: patientRef }, status: "accepted" }],
        },
      });
    }
  }
  return NextResponse.json(
    { resourceType: "Bundle", type: "collection", timestamp: new Date().toISOString(), entry: entries },
    { headers: { "Content-Type": "application/fhir+json" } },
  );
}
