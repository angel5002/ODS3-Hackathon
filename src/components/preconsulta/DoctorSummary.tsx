"use client";

// The doctor's view of a pre-visit (proposal v5.1 §3.1 template and §4.2 controls). Presentational: it receives
// the summary and draws it. "Referido por el paciente · pendiente de verificación profesional" on top; every
// required field shows its value or "No informado"; negations say how they were verified; each medicine says if
// the patient confirmed it; the alarm signs not asked are "No evaluado" (never "sin signos de alarma"); no
// diagnosis and no suggested test, ever. A field that just filled in flashes once (the scene's "se llena Motivo").
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Check, CircleDashed, Clock, HelpCircle, Pencil, ShieldAlert, X } from "lucide-react";
import { shown, type PreconsultaDetail, type Sign } from "@/lib/preconsulta/machine";

export type PreconsultaEdit = { field: string; before: unknown; after: unknown; actor: string; at: string };
export type EditableField = "motivo" | "inicio" | "alergias";

export type DoctorSummaryProps = {
  summary: PreconsultaDetail | null;
  /** corrections already made by the doctor (shown under the field) */
  edits?: PreconsultaEdit[];
  /** when given, each text field shows "Corregir" (the correction is recorded) */
  onEdit?: (field: EditableField, value: string) => Promise<void> | void;
  /** tighter spacing for the projector's side panel */
  compact?: boolean;
  className?: string;
};

const STATE_TEXT: Record<PreconsultaDetail["estado"], string> = {
  en_curso: "En curso",
  completa: "Completa",
  derivada_emergencia: "Interrumpida: signo de alarma",
  con_persona: "Pidió hablar con una persona",
};

const SIGN_TEXT: Record<Sign["estado"], { text: string; tone: string; Icon: typeof Check }> = {
  no: { text: "No · negación verificada (pregunta directa)", tone: "text-st-ok", Icon: Check },
  si: { text: "Sí · referido por el paciente", tone: "text-risk-alto", Icon: AlertTriangle },
  por_verificar: { text: "Lo negó en una respuesta libre · por verificar", tone: "text-risk-medio", Icon: HelpCircle },
  no_evaluado: { text: "No evaluado", tone: "text-faint", Icon: CircleDashed },
};

/** flashes its children once when `value` changes from what it was (not on the first render) */
function Fill({ value, children }: { value: string; children: ReactNode }) {
  const prev = useRef(value);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (prev.current !== value) setFlash((n) => n + 1);
    prev.current = value;
  }, [value]);
  return (
    <div key={flash} className={flash ? "flash -mx-1 rounded-sm px-1" : undefined}>
      {children}
    </div>
  );
}

function Row({ label, children, value, edit }: { label: string; children: ReactNode; value: string; edit?: ReactNode }) {
  return (
    <div className="grid gap-0.5 border-t border-line py-2.5 first:border-t-0 sm:grid-cols-[9.5rem_1fr] sm:gap-3">
      <dt className="text-[13px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="min-w-0 text-[16px] leading-snug text-ink">
        <Fill value={value}>{children}</Fill>
        {edit}
      </dd>
    </div>
  );
}

function Missing() {
  return <span className="italic text-faint">No informado</span>;
}

function Literal({ text }: { text: string | null }) {
  if (text == null) return <Missing />;
  return <span>«{text}»</span>;
}

function EditBox({ field, current, onEdit }: { field: EditableField; current: string | null; onEdit: NonNullable<DoctorSummaryProps["onEdit"]> }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <button
        type="button"
        onClick={() => {
          setValue(current ?? "");
          setOpen(true);
        }}
        className="press mt-1 inline-flex min-h-9 items-center gap-1 rounded-md px-1.5 text-[14px] font-semibold text-brand underline underline-offset-4 hover:bg-brand-soft"
      >
        <Pencil className="size-3.5" aria-hidden /> Corregir
      </button>
    );
  return (
    <form
      className="mt-1.5 flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!value.trim()) return;
        setBusy(true);
        try {
          await onEdit(field, value.trim());
          setOpen(false);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="sr-only" htmlFor={`edit-${field}`}>
        Corrección
      </label>
      <input
        id={`edit-${field}`}
        value={value}
        maxLength={200}
        onChange={(e) => setValue(e.target.value)}
        className="min-h-10 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2 text-[16px]"
      />
      <button type="submit" disabled={busy} className="press min-h-10 rounded-md bg-brand px-3 text-[14px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
        Guardar
      </button>
      <button type="button" onClick={() => setOpen(false)} className="press inline-flex min-h-10 items-center rounded-md px-2 text-[14px] text-muted hover:bg-sunken">
        <X className="size-4" aria-hidden />
        <span className="sr-only">Cancelar</span>
      </button>
    </form>
  );
}

function EditTrail({ edits, field }: { edits: PreconsultaEdit[]; field: string }) {
  const mine = edits.filter((e) => e.field === field);
  if (!mine.length) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-[13px] text-muted">
      {mine.map((e, i) => (
        <li key={i}>
          Corregido por {e.actor}: antes «{String((e.before as string | null) ?? "No informado")}»
        </li>
      ))}
    </ul>
  );
}

export function DoctorSummary({ summary, edits = [], onEdit, compact, className = "" }: DoctorSummaryProps) {
  if (!summary) {
    return (
      <section className={`rounded-md border border-line bg-surface p-4 text-muted ${className}`} aria-label="Resumen de preconsulta">
        Esperando las respuestas del paciente…
      </section>
    );
  }
  const s = summary;
  const meds =
    s.medicamentos.length > 0 ? (
      <ul className="space-y-1">
        {s.medicamentos.map((m) => (
          <li key={m.nombre} className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold">{m.nombre}</span>
            {m.confirmado ? (
              <span className="inline-flex items-center gap-1 text-[14px] text-st-ok">
                <Check className="size-3.5" aria-hidden /> Confirmado por el paciente
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[14px] text-risk-medio">
                <HelpCircle className="size-3.5" aria-hidden /> Sin confirmar
              </span>
            )}
          </li>
        ))}
      </ul>
    ) : s.medicamentosEstado === "ninguno" ? (
      <span>Ninguno · negación verificada (pregunta directa)</span>
    ) : s.medicamentosEstado === "no_sabe" ? (
      <span>No sabe</span>
    ) : s.medicamentosEstado === "prefiere_consulta" ? (
      <span>Prefiere decirlo en la consulta</span>
    ) : (
      <Missing />
    );
  const allergy =
    s.alergias === "ninguna" ? <span>Ninguna · negación verificada (pregunta directa)</span> : s.alergias == null ? <Missing /> : <span>{s.alergias}</span>;

  return (
    <section
      aria-label="Resumen de preconsulta para el médico"
      className={`rounded-md border border-line bg-surface ${compact ? "p-3" : "p-4 sm:p-5"} ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[19px] font-bold leading-tight text-ink">Preconsulta de {s.patient}</h2>
          <p className="mt-1 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm bg-st-sent-soft px-2 py-1 text-[14px] font-semibold text-st-sent">
            Referido por el paciente · pendiente de verificación profesional
          </p>
        </div>
        <p className="shrink-0 text-[14px] text-muted">
          {STATE_TEXT[s.estado]}
          {s.respondio ? ` · respondió ${s.respondio === "paciente" ? "el paciente" : "un acompañante"}` : ""} · {s.canal === "voz" ? "Llamada" : "Chat"}
        </p>
      </header>

      {s.derivadoAEmergencia && (
        <div role="alert" className="mt-3 flex gap-2 rounded-md border border-risk-alto bg-risk-alto-soft p-3 text-[15px] text-risk-alto">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>
            <strong>Signo de alarma referido{s.alarma.detalle ? `: ${s.alarma.detalle.toLowerCase()}` : ""}.</strong> Se interrumpió la entrevista, se le
            indicó acudir a emergencia o llamar al 106 y se creó una tarea para el personal.
          </p>
        </div>
      )}

      <dl className="mt-2">
        <Row label="Motivo" value={s.motivo ?? ""} edit={<>{onEdit && <EditBox field="motivo" current={s.motivo} onEdit={onEdit} />}<EditTrail edits={edits} field="motivo" /></>}>
          {s.motivoEstado && s.motivoEstado !== "informado" ? <span>{shown(s.motivo)}</span> : <Literal text={s.motivo} />}
        </Row>
        <Row label="Desde cuándo" value={s.inicio ?? ""} edit={<>{onEdit && <EditBox field="inicio" current={s.inicio} onEdit={onEdit} />}<EditTrail edits={edits} field="inicio" /></>}>
          {s.inicio == null ? <Missing /> : <span>{s.inicio}</span>}
        </Row>
        <Row label="Medicamentos" value={JSON.stringify([s.medicamentos, s.medicamentosEstado])}>
          {meds}
        </Row>
        <Row label="Alergias" value={s.alergias ?? ""} edit={<>{onEdit && <EditBox field="alergias" current={s.alergias} onEdit={onEdit} />}<EditTrail edits={edits} field="alergias" /></>}>
          {allergy}
        </Row>
        <Row label="Signos de alarma" value={JSON.stringify(s.signos.map((x) => x.estado))}>
          <ul className="space-y-1">
            {s.signos.map((x) => {
              const t = SIGN_TEXT[x.estado];
              return (
                <li key={x.id + x.label} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">{x.label}</span>
                  <span className={`inline-flex items-center gap-1 text-[14px] ${t.tone}`}>
                    <t.Icon className="size-3.5 self-center" aria-hidden />
                    {t.text}
                  </span>
                </li>
              );
            })}
            <li className="text-[14px] text-faint">Otros signos de alarma: no evaluado</li>
          </ul>
        </Row>
        {s.ventanaLlegada && (
          <Row label="Llegada" value={`${s.ventanaLlegada.desde}-${s.ventanaLlegada.hasta}`}>
            <span className="inline-flex items-start gap-1.5">
              <Clock className="mt-1 size-4 shrink-0 text-muted" aria-hidden />
              <span>
                Se le indicó llegar entre {s.ventanaLlegada.desde} y {s.ventanaLlegada.hasta}
                {s.ventanaLlegada.atrasoMin > 0 ? ` (consultorio con ${s.ventanaLlegada.atrasoMin} min de atraso)` : ""}.{" "}
                <span className="text-[14px] text-muted">Estimación con duraciones simuladas: no es una hora garantizada.</span>
              </span>
            </span>
          </Row>
        )}
        {s.pendientes.length > 0 && (
          <Row label="Pendientes" value={s.pendientes.join("|")}>
            <ul className="list-disc space-y-0.5 pl-5 text-[15px]">
              {s.pendientes.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Row>
        )}
      </dl>

      <p className="mt-2 border-t border-line pt-2 text-[13px] leading-snug text-muted">
        Ordena lo que el paciente refiere: no incluye diagnósticos ni sugiere exámenes. El médico lo verifica y cada corrección queda registrada.
      </p>
    </section>
  );
}
