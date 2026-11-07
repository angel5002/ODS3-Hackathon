"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { MessageCircle, Phone, PhoneCall, Radio, Send, Smartphone, Volume2 } from "lucide-react";
import { post } from "@/lib/post";
import { useNow } from "@/lib/realtime";
import { DemoButton, DemoCard, demoSelect } from "./DemoUi";

export type Session = {
  id: string;
  alias: string;
  consent: boolean;
  linked_patient: string | null;
  linked_name: string | null;
  request_code: string | null;
  sound_ready: boolean;
  last_seen_at: string;
  created_at: string;
  messages: number;
};
export type PhoneRow = { id: string; name: string; token: string; role: string; label: string; order: number; last_seen_at: string | null; sound_ready: boolean };
export type CallRow = {
  id: number;
  status: string;
  purpose: string;
  agent: string;
  provider: string | null;
  name: string | null;
  summary: string | null;
  result: string | null;
  actions: { at: string; tool: string; result: string }[];
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_s: number | null;
};
export type LiveData = { sessions: Session[]; phones: PhoneRow[]; calls: CallRow[] };

type Tone = "ok" | "info" | "warn" | "muted";
const CALL_STATUS: Record<string, { label: string; tone: Tone }> = {
  sonando: { label: "Sonando", tone: "info" },
  en_curso: { label: "En curso", tone: "ok" },
  finalizada: { label: "Finalizada", tone: "muted" },
  no_contesta: { label: "No contestó", tone: "warn" },
  rechazada: { label: "Rechazada", tone: "muted" },
  fallo: { label: "Falló", tone: "warn" },
};
const PROVIDER: Record<string, string> = { elevenlabs: "voz IA", guion: "guion fijo", simulado: "simulada" };
const PERSONAS = ["libera_cupo", "espera_1", "espera_2", "alto_riesgo"];
const TONE_TEXT: Record<Tone, string> = { ok: "text-(--cc-ok)", info: "text-(--cc-accent)", warn: "text-(--cc-warn)", muted: "text-(--cc-text-2)" };

/** a state in words, with a plain colour as the second signal (no pill tags) */
function Status({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-bold ${TONE_TEXT[tone]}`}>{children}</span>;
}

/** "En vivo" with its actions; the data comes from DemoControls (the control center reads the same view). */
export function LiveSection({ data }: { data: LiveData | null }) {
  const now = useNow(5000);
  const [busy, setBusy] = useState("");
  const online = (iso: string | null) => Boolean(iso && now - Date.parse(iso) < 60000);
  const personas = (data?.phones ?? []).filter((p) => PERSONAS.includes(p.role));

  async function act(key: string, body: Record<string, unknown>, success: string) {
    setBusy(key);
    try {
      await post("/api/staff", body);
      toast.success(success);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return <LiveSectionView data={data} busy={busy} online={online} personas={personas} act={act} />;
}

type LiveSectionViewProps = {
  data: LiveData | null;
  busy: string;
  online: (iso: string | null) => boolean;
  personas: PhoneRow[];
  act: (key: string, body: Record<string, unknown>, success: string) => void;
};

/** "En vivo", props only (LiveSection owns the data and the actions). */
export function LiveSectionView({ data, busy, online, personas, act }: LiveSectionViewProps) {
  return (
    <DemoCard className="p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-[20px] font-bold">
        <Radio className="size-5 text-(--cc-danger)" aria-hidden /> En vivo
      </h2>
      <p className="mt-1 max-w-[90ch] text-[14px] leading-snug text-(--cc-text-2)">
        Sesiones de chat abiertas en <strong className="text-(--cc-text)">/pedir-cita</strong> y teléfonos simulados abiertos en celulares reales. Vincule una sesión a
        un personaje para que reciba sus mensajes, ofertas y llamadas. Ninguna sesión pide ni guarda un número de teléfono.
      </p>

      <div className="mt-4 grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <section className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-[15px] font-bold">
            <MessageCircle className="size-4 text-(--cc-accent)" aria-hidden /> Sesiones de chat ({data?.sessions.length ?? 0})
          </h3>
          {!data?.sessions.length && (
            <p className="mt-2 border-l-[3px] border-(--cc-border) bg-(--cc-subtle) px-3 py-2.5 text-[14px] text-(--cc-text-2)">Ninguna todavía. Abra /pedir-cita en un celular.</p>
          )}
          <ul className="mt-2 space-y-2">
            {data?.sessions.map((s) => (
              <li key={s.id} className="min-w-0 rounded-[4px] border border-(--cc-border) p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-bold">{s.alias}</span>
                  {s.request_code && <Status tone="info">{s.request_code}</Status>}
                  {!s.consent && <Status tone="warn">Sin ACEPTO</Status>}
                  {online(s.last_seen_at) ? <Status tone="ok">Conectada</Status> : <Status>Inactiva</Status>}
                  {s.sound_ready && (
                    <Status tone="info">
                      <Volume2 className="size-3.5" aria-hidden /> Sonido listo
                    </Status>
                  )}
                  <span className="ml-auto text-[13px] text-(--cc-text-2)">{s.messages} mensajes</span>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <label className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5 text-[13px] text-(--cc-text-2)">
                    Vincular a
                    <select
                      value={s.linked_patient ?? ""}
                      disabled={!!busy}
                      onChange={(e) =>
                        act(`l${s.id}`, { action: "link_session", sessionId: s.id, patientId: e.target.value || null }, e.target.value ? "Sesión vinculada al personaje" : "Sesión como participante libre")
                      }
                      className={`${demoSelect} max-w-full`}
                    >
                      <option value="">Participante libre</option>
                      {personas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name.split(" ")[0]} ({p.label})
                        </option>
                      ))}
                    </select>
                  </label>
                  <DemoButton size="sm" disabled={!!busy} onClick={() => act(`m${s.id}`, { action: "test_message", sessionId: s.id }, "Mensaje de prueba enviado")}>
                    <Send className="size-3.5" aria-hidden /> Probar mensaje
                  </DemoButton>
                  <DemoButton size="sm" disabled={!!busy} onClick={() => act(`c${s.id}`, { action: "test_call", sessionId: s.id }, "Llamada de prueba: debe sonar en ese celular")}>
                    <PhoneCall className="size-3.5" aria-hidden /> Probar llamada
                  </DemoButton>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-[15px] font-bold">
            <Smartphone className="size-4 text-(--cc-accent)" aria-hidden /> Teléfonos simulados
          </h3>
          <ul className="mt-2 divide-y divide-(--cc-border) rounded-[4px] border border-(--cc-border)">
            {data?.phones.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[14px]">
                <span className="font-bold">{p.name.split(" ")[0]}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-(--cc-text-2)">{p.label}</span>
                {online(p.last_seen_at) ? <Status tone="ok">Abierto</Status> : <Status>Cerrado</Status>}
                {p.sound_ready && <Status tone="info">Sonido</Status>}
                <button
                  type="button"
                  disabled={!!busy}
                  title="Probar llamada en este teléfono"
                  aria-label={`Probar llamada en el teléfono de ${p.name}`}
                  onClick={() => act(`p${p.id}`, { action: "test_call", patientId: p.id }, "Llamada de prueba enviada")}
                  className="grid size-10 place-items-center rounded-[4px] border border-(--cc-control) text-(--cc-accent) hover:bg-(--cc-subtle) disabled:opacity-50"
                >
                  <Phone className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-5 min-w-0">
        <h3 className="text-[15px] font-bold">Llamadas recientes del asistente</h3>
        {!data?.calls.length && <p className="mt-2 border-l-[3px] border-(--cc-border) bg-(--cc-subtle) px-3 py-2.5 text-[14px] text-(--cc-text-2)">Ninguna llamada en vivo todavía.</p>}
        <ul className="mt-2 space-y-2">
          {data?.calls.map((c) => (
            <li key={c.id} className="min-w-0 rounded-[4px] border border-(--cc-border) p-3 text-[14px]">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-bold">{c.name ?? "—"}</span>
                <span className="text-[13px] text-(--cc-text-2)">{c.agent}</span>
                <Status tone={CALL_STATUS[c.status]?.tone}>{CALL_STATUS[c.status]?.label ?? c.status}</Status>
                {c.provider && <span className="text-[13px] text-(--cc-text-2)">{PROVIDER[c.provider] ?? c.provider}</span>}
                {c.duration_s != null && <span className="text-[13px] tabular-nums text-(--cc-text-2)">{c.duration_s} s</span>}
                {(c.status === "sonando" || c.status === "en_curso") && (
                  <DemoButton size="sm" className="ml-auto" disabled={!!busy} onClick={() => act(`e${c.id}`, { action: "end_call", callId: c.id }, "Llamada terminada desde el panel")}>
                    Terminar (usar simulado)
                  </DemoButton>
                )}
              </div>
              {(c.actions?.length ?? 0) > 0 && (
                <ol className="mt-1.5 space-y-0.5 break-words text-[13px] text-(--cc-text-2)">
                  {c.actions.map((a, i) => (
                    <li key={i}>
                      <span className="font-semibold text-(--cc-text)">{a.tool}</span> · {a.result}
                    </li>
                  ))}
                </ol>
              )}
              {(c.summary || c.result) && <p className="mt-1 break-words text-[13px]">{c.summary ?? c.result}</p>}
            </li>
          ))}
        </ul>
      </section>
    </DemoCard>
  );
}
