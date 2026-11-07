"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { toast } from "sonner";
import { Eye, MessageCircle, Plus, Search, UserMinus, X } from "lucide-react";
import { Button } from "@/components/ui";
import { getJson, post } from "@/lib/post";
import { CATEGORY_TEXT, REQUEST_STATE, SPECIALTIES, WITHDRAW_REASONS, dateShort, num, type RequestState } from "@/lib/labels";
import { useServerView } from "./useStaffView";
import { RequestBadge } from "./badges";

export type RequestRow = {
  id: number;
  code: string;
  name: string;
  short_name: string;
  specialty: string;
  category: string | null;
  cat: string;
  days_waited: number;
  deadline: number;
  pct_deadline: number;
  first_visit: boolean;
  preferential: boolean;
  idx: number;
  reason: string;
  state: RequestState;
  preferred_channel: string;
  short_notice_ok: boolean;
  source: string;
  age: number;
  appt_date: string | null;
  appt_time: string | null;
  live_chat: boolean;
  phone_token: string | null;
};

const CHANNEL: Record<string, string> = { mensaje: "Mensaje", llamada: "Llamada", chat: "Chat" };
const GROUPS = [
  { id: "activas", label: "En espera" },
  { id: "regulacion", label: "Pendientes de regulación" },
  { id: "cerradas", label: "Cerradas" },
  { id: "todas", label: "Todas" },
] as const;

export function WaitlistTab() {
  const { data, error } = useServerView<{ requests: RequestRow[] }>("/api/staff/data?view=requests", ["full", "bulk", "req", "slot"]);
  const [group, setGroup] = useState<(typeof GROUPS)[number]["id"]>("activas");
  const [specialty, setSpecialty] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(100);
  const [registering, setRegistering] = useState(false);
  const [withdrawing, setWithdrawing] = useState<RequestRow | null>(null);
  const [detail, setDetail] = useState<RequestRow | null>(null);
  const q = useDeferredValue(query.trim().toLowerCase());
  const rows = useMemo(() => data?.requests ?? [], [data]);
  const specialties = useMemo(() => [...new Set(rows.map((r) => r.specialty))].sort((a, b) => a.localeCompare(b, "es")), [rows]);
  const counts = useMemo(() => {
    const c = { activas: 0, regulacion: 0, cerradas: 0, todas: rows.length };
    for (const r of rows) c[groupOf(r.state)]++;
    return c;
  }, [rows]);
  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          (group === "todas" || groupOf(r.state) === group) &&
          (!specialty || r.specialty === specialty) &&
          (!q || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)),
      ),
    [rows, group, specialty, q],
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Lista de espera</h1>
          <p className="mt-1 max-w-[80ch] text-sm text-muted">
            Toda la demanda, aunque no haya cupo. Orden: primero la categoría clínica que asignó un profesional (P1, P2, P3,
            P4) y, dentro de ella, la parte del plazo máximo ya consumida desde el primer intento. Sin puntos extra. Nunca se
            usan el seguro, el sexo ni las faltas anteriores.
          </p>
        </div>
        <Button variant="primary" className="min-h-11 rounded-full px-5" onClick={() => setRegistering(true)}>
          <Plus className="size-4" aria-hidden /> Registrar solicitud
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-3">
          <div role="tablist" className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-sunken p-1 [scrollbar-width:none]">
            {GROUPS.map((g) => (
              <button
                key={g.id}
                role="tab"
                aria-selected={group === g.id}
                onClick={() => setGroup(g.id)}
                className={`flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ${group === g.id ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
              >
                {g.label}
                <span className="rounded-full bg-line/70 px-1.5 text-xs tabular-nums text-muted">{num(counts[g.id])}</span>
              </button>
            ))}
          </div>
          <select value={specialty} onChange={(e) => setSpecialty(e.target.value)} aria-label="Especialidad" className={`rounded-full border bg-surface px-3 py-1.5 text-sm ${specialty ? "border-brand text-brand" : "border-line"}`}>
            <option value="">Todas las especialidades</option>
            {specialties.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <label className="relative ml-auto min-w-48 flex-1 sm:max-w-72">
            <span className="sr-only">Buscar por código o nombre</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Código o nombre…"
              className="w-full rounded-full border border-line bg-sunken py-2 pl-9 pr-3 text-sm focus:bg-surface"
            />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-faint">
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">Código · paciente</th>
                <th className="px-3 py-2 font-semibold">Especialidad</th>
                <th className="px-3 py-2 font-semibold">Categoría</th>
                <th className="px-3 py-2 text-right font-semibold">Días esperados</th>
                <th className="px-3 py-2 text-right font-semibold">% del plazo</th>
                <th className="px-3 py-2 font-semibold">Razón</th>
                <th className="px-3 py-2 font-semibold">Estado</th>
                <th className="px-3 py-2 font-semibold">Canal</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {!data && !error && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-muted">Cargando la lista…</td>
                </tr>
              )}
              {error && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-risk-alto">{error}</td>
                </tr>
              )}
              {data && !visible.length && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-muted">Ninguna solicitud coincide.</td>
                </tr>
              )}
              {visible.slice(0, limit).map((r, i) => (
                <tr key={r.id} className="row-cv border-b border-line last:border-0 hover:bg-sunken">
                  <td className="px-3 py-2 tabular-nums text-faint">{i + 1}</td>
                  <td className="px-3 py-2">
                    <span className="font-semibold tabular-nums">{r.code}</span>
                    <span className="block max-w-[14rem] truncate text-xs text-muted">
                      {r.name} · {r.age} {r.age === 1 ? "año" : "años"}
                    </span>
                  </td>
                  <td className="px-3 py-2">{r.specialty}</td>
                  <td className="px-3 py-2" title={r.category ? CATEGORY_TEXT[r.category] : "Pendiente de regulación: se ordena como P3"}>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${CAT_TONE[r.cat]} ${r.category ? "" : "opacity-60"}`}>
                      {r.category ?? "P3?"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.days_waited}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.pct_deadline} %</td>
                  <td className="max-w-[18rem] px-3 py-2 text-xs text-muted">{r.reason}</td>
                  <td className="px-3 py-2">
                    <RequestBadge state={r.state} />
                    {r.appt_date && r.state === "con_cita" && (
                      <span className="mt-0.5 block text-xs text-muted">
                        Cita {dateShort(r.appt_date)} {r.appt_time}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {CHANNEL[r.preferred_channel] ?? r.preferred_channel}
                    {r.live_chat && (
                      <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-st-sent-soft px-1 text-st-sent" title="Tiene un chat en vivo vinculado">
                        <MessageCircle className="size-3" aria-hidden /> en vivo
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button onClick={() => setDetail(r)} className="press rounded-full p-1.5 text-muted hover:bg-line/60 hover:text-ink" aria-label={`Ver ${r.code}`} title="Ver detalle y fechas">
                      <Eye className="size-4" />
                    </button>
                    {!["cerrada_con_causal", "atendida", "con_oferta", "asignada_por_validar"].includes(r.state) && (
                      <button onClick={() => setWithdrawing(r)} className="press rounded-full p-1.5 text-muted hover:bg-risk-alto-soft hover:text-risk-alto" aria-label={`Retirar ${r.code}`} title="Retirar de la lista (con motivo)">
                        <UserMinus className="size-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visible.length > limit && (
          <button onClick={() => setLimit(limit + 150)} className="block w-full px-4 py-4 text-center text-sm font-medium text-muted hover:bg-sunken hover:text-ink">
            Mostrando {num(limit)} de {num(visible.length)} · ver más
          </button>
        )}
      </div>

      {registering && <RegisterDialog onClose={() => setRegistering(false)} />}
      {withdrawing && <WithdrawDialog row={withdrawing} onClose={() => setWithdrawing(null)} />}
      {detail && <RequestDetail row={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function groupOf(s: RequestState): "activas" | "regulacion" | "cerradas" {
  if (s === "pendiente_regulacion" || s === "pendiente_informacion") return "regulacion";
  if (s === "cerrada_con_causal" || s === "atendida" || s === "derivada_emergencia") return "cerradas";
  return "activas";
}

export const CAT_TONE: Record<string, string> = {
  P1: "bg-risk-alto-soft text-risk-alto",
  P2: "bg-risk-medio-soft text-risk-medio",
  P3: "bg-st-sent-soft text-st-sent",
  P4: "bg-st-neutral-soft text-st-neutral",
};

export function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 p-3" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="rise max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-2xl bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="press -mr-1 rounded-full p-1.5 hover:bg-sunken">
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

const DOCS = [
  ["dni", "DNI"],
  ["ce", "Carné de extranjería"],
  ["pasaporte", "Pasaporte"],
  ["otro", "Otro"],
  ["sin_documento", "Sin documento"],
];

/** RF-01: front-desk registration in under 20 seconds (sensible defaults, only name, age and specialty required). */
export function RegisterForm({ onDone, endpoint = "/api/staff", compact }: { onDone: (code: string) => void; endpoint?: string; compact?: boolean }) {
  const [f, setF] = useState({
    display_name: "",
    doc_type: "dni",
    age: "",
    specialty: "",
    referral: true,
    reason_text: "",
    pregnant: false,
    disability: false,
    first_visit: true,
    preferred_channel: "mensaje",
    short_notice_ok: false,
    insurance: true,
    district: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: unknown) => setF({ ...f, [k]: v });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = endpoint === "/api/staff" ? { action: "register", request: { ...f, age: Number(f.age) } } : { ...f, age: Number(f.age) };
      const r = await post<{ code: string }>(endpoint, body);
      onDone(r.code);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const input = "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm";
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm sm:col-span-2">
        <span className="font-semibold">Nombre del paciente</span> <span className="text-muted">(ficticio en la demo)</span>
        <input required autoFocus={!compact} value={f.display_name} onChange={(e) => set("display_name", e.target.value)} className={`${input} mt-1`} maxLength={80} />
      </label>
      <label className="text-sm">
        <span className="font-semibold">Documento</span>
        <select value={f.doc_type} onChange={(e) => set("doc_type", e.target.value)} className={`${input} mt-1`}>
          {DOCS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <span className="mt-0.5 block text-xs text-muted">No se pide el número.</span>
      </label>
      <label className="text-sm">
        <span className="font-semibold">Edad</span>
        <input required type="number" min={0} max={120} inputMode="numeric" value={f.age} onChange={(e) => set("age", e.target.value)} className={`${input} mt-1`} />
      </label>
      <label className="text-sm sm:col-span-2">
        <span className="font-semibold">Especialidad</span>
        <select required value={f.specialty} onChange={(e) => set("specialty", e.target.value)} className={`${input} mt-1`}>
          <option value="">Elegir…</option>
          {SPECIALTIES.map((s) => (
            <option key={s}>{s}</option>
          ))}
          <option>Por definir</option>
        </select>
      </label>
      <label className="text-sm sm:col-span-2">
        <span className="font-semibold">Motivo</span> <span className="text-muted">(una o dos frases, sin datos que identifiquen)</span>
        <textarea value={f.reason_text} onChange={(e) => set("reason_text", e.target.value)} rows={2} maxLength={400} className={`${input} mt-1`} />
      </label>
      <label className="text-sm">
        <span className="font-semibold">Aviso preferido</span>
        <select value={f.preferred_channel} onChange={(e) => set("preferred_channel", e.target.value)} className={`${input} mt-1`}>
          <option value="mensaje">Mensaje</option>
          <option value="llamada">Llamada</option>
        </select>
      </label>
      <label className="text-sm">
        <span className="font-semibold">Distrito</span> <span className="text-muted">(solo para auditar equidad)</span>
        <input value={f.district} onChange={(e) => set("district", e.target.value)} className={`${input} mt-1`} maxLength={60} />
      </label>
      <fieldset className="grid gap-1.5 text-sm sm:col-span-2 sm:grid-cols-2">
        {(
          [
            ["referral", "Tiene hoja de referencia"],
            ["first_visit", "Primera consulta en esta especialidad"],
            ["short_notice_ok", "Puede asistir con 2 días de aviso"],
            ["insurance", "Tiene seguro de salud"],
            ["pregnant", "Gestante"],
            ["disability", "Tiene alguna discapacidad"],
          ] as const
        ).map(([k, l]) => (
          <label key={k} className="flex items-center gap-2">
            <input type="checkbox" checked={f[k] as boolean} onChange={(e) => set(k, e.target.checked)} className="size-4 accent-brand" />
            {l}
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-muted sm:col-span-2">
        La solicitud entra como <strong>pendiente de regulación</strong> (se ordena como P3 hasta que un profesional la revise). La
        fecha de hoy queda como primer intento y no se reinicia nunca.
      </p>
      <Button type="submit" variant="primary" disabled={busy} className="min-h-11 rounded-full sm:col-span-2">
        {busy ? "Registrando…" : "Registrar solicitud"}
      </Button>
    </form>
  );
}

function RegisterDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Registrar solicitud" onClose={onClose}>
      <RegisterForm
        onDone={(code) => {
          toast.success(`Solicitud ${code} registrada`, { description: "Ya aparece en la cola del regulador, sin datos de identidad." });
          onClose();
        }}
      />
    </Dialog>
  );
}

function WithdrawDialog({ row, onClose }: { row: RequestRow; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title={`Retirar ${row.code} de la lista`} onClose={onClose}>
      <p className="text-sm text-muted">
        Solo una persona puede retirar una solicitud y siempre con un motivo. <strong>No responder nunca es un motivo.</strong> El
        retiro queda en el tablero como «retiro sin atención».
      </p>
      <form
        className="mt-3 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await post("/api/staff", { action: "withdraw", requestId: row.id, reason, text });
            toast.success(`${row.code} retirada: ${WITHDRAW_REASONS.find((r) => r.id === reason)?.label}`);
            onClose();
          } catch (err) {
            toast.error((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset className="grid gap-1.5 text-sm">
          {WITHDRAW_REASONS.map((r) => (
            <label key={r.id} className="flex items-center gap-2">
              <input type="radio" name="reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} className="size-4 accent-brand" />
              {r.label}
            </label>
          ))}
        </fieldset>
        {reason === "otro" && (
          <textarea required value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Escriba el motivo" className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm" />
        )}
        <Button type="submit" variant="danger" disabled={busy || !reason}>
          Retirar con este motivo
        </Button>
      </form>
    </Dialog>
  );
}

type Detail = {
  request: Record<string, unknown> | null;
  person: { name: string; doc: string; insurance: boolean | null; district: string | null; origin_facility: string | null } | null;
  events: { id: number; type: string; actor: string; demo_min: number | null; at: string; payload: Record<string, unknown> }[];
  withdrawal: { reason: string; reason_text: string | null; user: string } | null;
};

const EVENT_LABEL: Record<string, string> = {
  indicacion: "Indicación original",
  recepcion: "Recepción",
  pedido_informacion: "Pedido de información",
  regulacion: "Regulación",
  fecha_limite: "Fecha límite",
  primera_oferta: "Primera oferta",
  oferta: "Oferta",
  respuesta_oferta: "Respuesta a la oferta",
  asignacion: "Asignación",
  espera_prioritaria: "Espera prioritaria",
  confirmacion: "Confirmación",
  validacion_rechazada: "No pudo tomar el cupo",
  validacion_vencida: "Venció la validación",
  llamada: "Llamada del asistente",
  reversion: "Asignación revertida",
  atencion: "Atención",
  cierre: "Cierre",
};

function RequestDetail({ row, onClose }: { row: RequestRow; onClose: () => void }) {
  const { data } = useServerView<Detail>(`/api/staff/data?view=request&id=${row.id}`, ["full", "req", "slot"]);
  const [fhir, setFhir] = useState<string | null>(null);
  return (
    <Dialog title={`${row.code} · ${row.name}`} onClose={onClose}>
      <p className="text-sm text-muted">
        {row.specialty} · {row.category ? CATEGORY_TEXT[row.category] : "pendiente de regulación"} · {row.pct_deadline} % de su plazo
      </p>
      <p className="mt-1 text-sm">{row.reason}</p>
      {data?.person && (
        <dl className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-sunken p-3 text-xs">
          <div>
            <dt className="text-muted">Documento</dt>
            <dd className="font-medium">{data.person.doc === "sin_documento" ? "Sin documento" : `${data.person.doc?.toUpperCase()} (sin número)`}</dd>
          </div>
          <div>
            <dt className="text-muted">Seguro · distrito (solo auditoría)</dt>
            <dd className="font-medium">
              {data.person.insurance == null ? "—" : data.person.insurance ? "Con seguro" : "Sin seguro"} · {data.person.district ?? "—"}
            </dd>
          </div>
        </dl>
      )}
      <h3 className="mt-4 text-sm font-semibold">Fechas que se acumulan (no se reemplazan)</h3>
      <ol className="mt-1.5 space-y-1 text-sm">
        {[...(data?.events ?? [])].reverse().map((e) => (
          <li key={e.id} className="flex gap-2">
            <span className="w-40 shrink-0 font-medium">{EVENT_LABEL[e.type] ?? e.type}</span>
            <span className="text-muted">
              {typeof e.payload?.date === "string" ? dateShort(e.payload.date as string) : typeof e.payload?.due_date === "string" ? dateShort(e.payload.due_date as string) : ""}
              {e.payload?.category ? ` ${e.payload.category}` : ""} · {e.actor}
            </span>
          </li>
        ))}
      </ol>
      {data?.withdrawal && (
        <p className="mt-3 rounded-lg bg-st-neutral-soft p-2 text-sm">
          Retirada por {data.withdrawal.user}: {WITHDRAW_REASONS.find((r) => r.id === data.withdrawal!.reason)?.label}
          {data.withdrawal.reason_text ? ` (${data.withdrawal.reason_text})` : ""}
        </p>
      )}
      <div className="mt-4 border-t border-line pt-3">
        <Button
          onClick={async () => {
            try {
              setFhir(JSON.stringify(await getJson(`/api/fhir/requests/${row.id}`), null, 2));
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          Ver como FHIR
        </Button>
        <p className="mt-1 text-xs text-muted">FHIR R4 base; perfil peruano solo para Patient (la guía del MINSA no tiene perfiles de citas).</p>
        {fhir && <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-night p-3 text-[11px] text-white/90">{fhir}</pre>}
      </div>
    </Dialog>
  );
}

export { REQUEST_STATE };
