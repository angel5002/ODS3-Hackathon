// The projector's view of the jury (GET /api/staff/data?view=jurado). Pure: it turns the raw facts of
// public.jury_snapshot() into the JuryOverview of the contract (src/lib/demo/contract.ts). Unit-tested in
// tests/jury.test.ts. Every activity line is built only from rows that belong to ITS card (the SQL joins by
// card token), so one card's actions can never show up under another.
import type { JuryActivity, JuryActivityKind, JuryCard, JuryOverview } from "../demo/contract";

export type SnapshotCard = {
  token: string;
  character: string;
  story: string;
  tryLine: string;
  channel: JuryCard["channel"];
  kind: "cancela" | "confirma" | "pide_cita" | "acepta_oferta";
  specialty: string;
  scene: boolean;
  test: boolean;
  sort: number;
  appointment: { id: number; specialty: string; date: string; time: string; status: string } | null;
  firstVisit: string | null;
};

export type JurySnapshot = {
  epoch: string;
  cards: SnapshotCard[];
  requests: {
    token: string;
    id: number;
    code: string;
    specialty: string;
    category: string | null;
    state: string;
    source: string;
    seeded: boolean;
    createdAt: string;
    position: number | null;
  }[];
  apptEvents: { token: string; toStatus: string; channel: string; at: string }[];
  reqEvents: { token: string; requestId: number; specialty: string; type: string; payload: Record<string, unknown> | null; at: string }[];
  calls: { token: string; id: number; purpose: string; status: string; createdAt: string; answeredAt: string | null; endedAt: string | null }[];
  chats: { token: string; at: string }[];
  scene: {
    token: string;
    slotId: number;
    specialty: string;
    date: string;
    time: string;
    state: "libre" | "retenido" | "ocupado";
    openOffer: boolean;
    releasedAt: string;
    assignment: { name: string; state: string; at: string } | null;
  } | null;
};

export const cardPath = (token: string) => `/j/${token}`;

const CHANNEL_WORD: Record<string, string> = { mensaje: "por mensaje", chat: "por chat", voz: "en la llamada", panel: "con el personal" };
const SOURCE_WORD: Record<string, string> = { chat: "por chat", voz: "por voz", formulario: "con el formulario" };

/** Plain-language state of a request for the projector (never the index). */
export const REQUEST_STATE: Record<string, string> = {
  registrada: "En revisión",
  pendiente_regulacion: "Espera la revisión de un profesional",
  pendiente_informacion: "Un profesional pidió un dato más",
  priorizada_sin_cupo: "En lista de espera",
  en_espera_prioritaria: "Primera para el próximo cupo",
  con_oferta: "Con una oferta de cupo",
  asignada_por_validar: "Cupo asignado, falta confirmar",
  con_cita: "Con cita",
  atendida: "Atendida",
  derivada_emergencia: "Derivada a emergencia",
  cerrada_con_causal: "Cerrada",
};

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Every activity line of one snapshot, newest first. */
export function buildActivity(s: JurySnapshot): JuryActivity[] {
  const byToken = new Map(s.cards.map((c) => [c.token, c]));
  const out: JuryActivity[] = [];
  const add = (token: string, kind: JuryActivityKind, text: string, at: string | null | undefined) => {
    const card = byToken.get(token);
    if (!card || !at) return; // only cards of this view, only dated facts
    out.push({ token, character: card.character, kind, text, at });
  };

  for (const c of s.cards) add(c.token, "abrio", `${c.character} abrió su cartilla`, c.firstVisit);
  for (const x of s.chats) add(x.token, "chat", `${byToken.get(x.token)?.character} empezó a escribir al asistente`, x.at);

  for (const e of s.apptEvents) {
    const c = byToken.get(e.token);
    if (!c) continue;
    const how = CHANNEL_WORD[e.channel] ?? "";
    if (e.toStatus === "confirmada") add(e.token, "confirmo", `${c.character} confirmó su cita${how ? ` ${how}` : ""}`, e.at);
    else if (e.toStatus === "liberada")
      add(e.token, "cancelo", `${c.character} avisó${how ? ` ${how}` : ""} que no podrá ir: su cupo no se pierde`, e.at);
    else if (e.toStatus === "derivada_a_persona") add(e.token, "chat", `${c.character} pidió hablar con una persona`, e.at);
  }

  const seededRequest = new Set(s.requests.filter((r) => r.seeded).map((r) => r.id));
  for (const e of s.reqEvents) {
    const c = byToken.get(e.token);
    if (!c) continue;
    const p = e.payload ?? {};
    switch (e.type) {
      case "recepcion":
        if (seededRequest.has(e.requestId)) break;
        add(e.token, "pidio_cita", `${c.character} pidió una cita de ${lower(e.specialty)}${SOURCE_WORD[String(p.source)] ? ` ${SOURCE_WORD[String(p.source)]}` : ""}`, e.at);
        break;
      case "regulacion":
        add(e.token, "categorizada", `Un profesional revisó la solicitud de ${c.character}${p.category ? ` (${String(p.category)})` : ""}`, e.at);
        break;
      case "oferta":
        add(e.token, "oferta", `A ${c.character} le llegó la oferta de un cupo de ${lower(e.specialty)}`, e.at);
        break;
      case "respuesta_oferta":
        if (p.response === "acepta") add(e.token, "acepto", `${c.character} aceptó el cupo`, e.at);
        else if (p.response === "declina") add(e.token, "rechazo", `${c.character} no puede tomar el cupo y conserva su lugar`, e.at);
        break;
      case "espera_prioritaria":
        add(e.token, "oferta", `El cupo fue para alguien con mayor prioridad: ${c.character} queda primero para el próximo`, e.at);
        break;
      case "confirmacion":
        add(e.token, "confirmo", `${c.character} confirmó el cupo: ya tiene cita`, e.at);
        break;
      case "validacion_rechazada":
        add(e.token, "rechazo", `${c.character} ya no puede tomar el cupo y conserva su lugar`, e.at);
        break;
      case "cierre":
        if (p.reason === "derivada_emergencia") add(e.token, "chat", `El asistente indicó a ${c.character} acudir a emergencia`, e.at);
        break;
    }
  }

  for (const k of s.calls) {
    const c = byToken.get(k.token);
    if (!c) continue;
    if (k.answeredAt) add(k.token, "llamada_inicio", `${c.character} ${k.purpose === "registro" ? "empezó una llamada con" : "contestó la llamada de"} el asistente`, k.answeredAt);
    if (k.endedAt) {
      const text =
        k.status === "finalizada" ? `Terminó la llamada con ${c.character}` : k.status === "rechazada" ? `${c.character} rechazó la llamada` : `${c.character} no contestó la llamada`;
      add(k.token, "llamada_fin", text, k.endedAt);
    }
  }

  if (s.scene?.assignment) {
    const c = byToken.get(s.scene.token);
    if (c) {
      const done = s.scene.assignment.state === "confirmada";
      add(s.scene.token, "oferta", `El cupo que liberó ${c.character} ${done ? "es ahora de" : "se asignó a"} ${s.scene.assignment.name}`, s.scene.assignment.at);
    }
  }

  // newest first; same instant: a stable order by token and text
  return out.sort((a, b) => (a.at === b.at ? (a.token + a.text).localeCompare(b.token + b.text) : a.at < b.at ? 1 : -1));
}

/** Is the card's goal reached? */
function complete(card: SnapshotCard, s: JurySnapshot): boolean {
  const status = card.appointment?.status;
  if (card.kind === "cancela") return status === "liberada" || status === "reasignada";
  if (card.kind === "confirma") return status === "confirmada";
  return s.reqEvents.some((e) => e.token === card.token && e.type === "confirmacion");
}

/** What the operator can do next on each card (/demo OPERAR, one click each). */
export type JuryOp = {
  token: string;
  character: string;
  kind: SnapshotCard["kind"];
  /** the request to categorize, offer or close (pide_cita / acepta_oferta) */
  request: { code: string; specialty: string; category: string | null; state: string } | null;
  next: "categorizar" | "ofrecer" | "cerrar" | null;
  /** plain words for the operator */
  status: string;
};

const WAITING = ["priorizada_sin_cupo", "en_espera_prioritaria"];

export function buildJuryOps(s: JurySnapshot): JuryOp[] {
  return s.cards.map((c) => {
    const base = { token: c.token, character: c.character, kind: c.kind };
    if (c.kind === "cancela" || c.kind === "confirma") {
      const st = c.appointment?.status ?? null;
      const scene = c.scene ? s.scene : null;
      if (c.kind === "cancela" && scene) {
        if (scene.openOffer) return { ...base, request: null, next: "cerrar", status: "Su cupo está ofrecido" };
        if (scene.assignment) return { ...base, request: null, next: null, status: `Su cupo es de ${scene.assignment.name}` };
        if (scene.state === "libre") return { ...base, request: null, next: "ofrecer", status: "Liberó su cupo" };
      }
      const status =
        st === "confirmada" ? "Confirmó su cita" : st === "liberada" || st === "reasignada" ? "Liberó su cupo" : st === "en_llamada" ? "En llamada" : c.firstVisit ? "Abrió su cartilla" : "Sin abrir";
      return { ...base, request: null, next: null, status };
    }
    const mine = s.requests.filter((r) => r.token === c.token).sort((a, b) => b.id - a.id);
    const r = mine.find((x) => !["cerrada_con_causal", "atendida", "derivada_emergencia"].includes(x.state)) ?? mine[0] ?? null;
    if (!r) return { ...base, request: null, next: null, status: c.firstVisit ? "Abrió su cartilla" : "Sin abrir" };
    const request = { code: r.code, specialty: r.specialty, category: r.category, state: r.state };
    const next: JuryOp["next"] =
      r.state === "pendiente_regulacion" || r.state === "pendiente_informacion" || (!r.category && r.state === "registrada")
        ? "categorizar"
        : r.state === "con_oferta"
          ? "cerrar"
          : WAITING.includes(r.state) && r.category
            ? "ofrecer"
            : null;
    return { ...base, request, next, status: REQUEST_STATE[r.state] ?? r.state };
  });
}

export function buildJuryOverview(s: JurySnapshot): JuryOverview {
  const activity = buildActivity(s);
  const cards = s.cards.map((c) => {
    const mine = activity.filter((a) => a.token === c.token);
    const state: JuryOverview["cards"][number]["state"] = complete(c, s)
      ? "completo"
      : mine.some((a) => a.kind !== "abrio")
        ? "en_curso"
        : mine.length
          ? "abierta"
          : "sin_abrir";
    return {
      token: c.token,
      character: c.character,
      story: c.story,
      tryLine: c.tryLine,
      channel: c.channel,
      path: cardPath(c.token),
      state,
      lastAt: mine[0]?.at ?? null,
    };
  });

  const sc = s.scene;
  const carmenSlot: JuryOverview["carmenSlot"] = sc
    ? {
        slotId: sc.slotId,
        specialty: sc.specialty,
        when: sc.releasedAt,
        state: sc.assignment || sc.state === "ocupado" ? "asignado" : sc.state === "retenido" || sc.openOffer ? "ofrecido" : "libre",
        assignedTo: sc.assignment?.name ?? null,
      }
    : null;

  const characterOf = new Map(s.cards.map((c) => [c.token, c.character]));
  const newRequests = s.requests
    .filter((r) => !r.seeded && characterOf.has(r.token))
    .sort((a, b) => a.id - b.id)
    .map((r) => ({
      code: r.code,
      character: characterOf.get(r.token)!,
      specialty: r.specialty,
      category: r.category,
      position: r.position,
      state: REQUEST_STATE[r.state] ?? r.state,
    }));

  return { cards, activity: activity.slice(0, 60), carmenSlot, newRequests };
}
