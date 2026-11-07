// Opens THE voice session of one call (RF-15, E5 hito 2), only for the phone or chat session that owns it.
//   1. claims the session atomically in Postgres (voice_claim): one live session per call, a capacity limit
//      (VOICE_MAX_CONCURRENT) and a FIFO queue when it is full;
//   2. only then asks ElevenLabs for this session's credentials (per request, never cached): a WebRTC
//      conversation token and a WebSocket signed URL as the fallback;
//   3. returns the URL with the call's dynamic variables, all present (neutral phrase if one is missing).
// Answers { session: null, busy } when another device has the call or every line is taken, and
// { session: null, reason } when voice is unavailable (the call screen then falls back to the fixed script).
// Final day (pitch v7):
//   - pushToTalk (boolean, every answer): the noisy-room mode, settings_v51 'sala_ruidosa' (ON if missing);
//   - the last VOICE_RESERVED_FOR_CARDS lines (default 3) are kept for the printed jury cards (patient token
//     "j-…", directly or through the linked chat session); anyone else then gets
//     { session: null, busy: "capacidad", chatInstead: true }: continue by chat, no queue, no error.
import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { readCookie } from "@/lib/chat/session";
import { rpc, serverDb } from "@/lib/supabase/server";
import { ownsCall } from "@/lib/voice/auth";
import { AGENT_FOR_PURPOSE, conversationToken, signedUrl, toolToken } from "@/lib/voice/server";
import { pickTransport } from "@/lib/voice/transport";
import { reservedForCards, voiceLimit } from "@/lib/voice/capacity";
import {
  UUID,
  claimSession,
  completeVariables,
  endSession,
  isCardCall,
  liveSessionCount,
  logEvent,
  maxConcurrent,
  noisyRoom,
  updateSession,
} from "@/lib/voice/sessions";
import { callContext, loadCall } from "@/lib/voice/tools";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  let callId = Number(body.callId);
  const diag = typeof body.diag === "string" && /^[a-z0-9]{4,16}$/.test(body.diag) ? body.diag : "-";
  const queueId = typeof body.queueId === "string" && UUID.test(body.queueId) ? body.queueId : null;
  const log = (msg: string) => console.info(`[voz ${diag}] servidor session ${msg}`);

  // registration by voice from /pedir-cita: the chat session starts its own call (a retry reuses it)
  if (body.mode === "registro" && !callId) {
    const session = readCookie(req);
    if (!session) {
      log("registro sin_sesion_de_chat -> 401");
      await logEvent(null, null, "servidor", "sesion.sin_chat", {});
      return fail("Todavía no está lista la conversación. Espere un momento y vuelva a intentar.", 401);
    }
    const { data: s } = await serverDb().from("chat_sessions").select("id").eq("id", session).maybeSingle();
    if (!s) {
      log("registro sesion_de_chat_inexistente -> 401");
      return fail("Su sesión de chat venció. Recargue la página.", 401);
    }
    const { data: c, error } = await serverDb()
      .from("calls")
      .insert({ chat_session_id: session, purpose: "registro", agent: "asistia-registro", status: "en_curso", answered_at: new Date().toISOString() })
      .select("id")
      .single();
    if (error || !c) {
      log("registro insert_error -> 500");
      return fail(error?.message ?? "call", 500);
    }
    callId = c.id;
    log(`registro nueva llamada call=${callId}`);
    await rpc("hint", { p_kind: "call" });
  }

  const call = await loadCall(callId);
  if (!call || !(await ownsCall(req, call, body.token))) {
    log(`call=${callId} sin_dueño -> 404`);
    return fail("unknown call", 404);
  }
  if (!["sonando", "en_curso"].includes(call.status)) {
    log(`call=${callId} estado=${call.status} -> 409`);
    return fail("call ended", 409);
  }

  // final day: noisy-room mode (push-to-talk on the phones) and the lines reserved for the jury cards
  const [pushToTalk, card] = await Promise.all([noisyRoom().catch(() => true), isCardCall(call).catch(() => false)]);
  const max = maxConcurrent();
  const limit = voiceLimit(card, max, reservedForCards(process.env.VOICE_RESERVED_FOR_CARDS, max));
  // a person without a card, when only the reserved lines are left: chat instead (the fixed script on the
  // phone), no queue and no error on screen
  const chatInstead = async (live: number) => {
    log(`call=${callId} lineas_reservadas_para_tarjetas activas=${live} limite=${limit} -> chat`);
    await logEvent(null, call.id, "servidor", "sesion.reservada_tarjetas", { activas: live, limite: limit, maximo: max });
    return NextResponse.json({ callId, session: null, busy: "capacidad", chatInstead: true, queueId: null, position: null, pushToTalk });
  };
  if (!card && limit < max) {
    const live = await liveSessionCount(call.id);
    if (live >= limit) return chatInstead(live);
  }

  // 1. one live session per call, capacity and queue (atomic in Postgres)
  const claim = await claimSession(call.id, body.token ? "telefono" : "chat", queueId, limit);
  if (!claim.ok) {
    log(`call=${callId} reclamo=${claim.reason}`);
    if (claim.reason === "terminada") return fail("call ended", 409);
    if (claim.reason === "en_otro_dispositivo") return NextResponse.json({ callId, session: null, busy: "otro_dispositivo" });
    if (!card && limit < max) {
      // lost the race for the last free line: leave the queue at once, it is for the cards
      await endSession(claim.queue_id, "líneas reservadas para las tarjetas", false).catch(() => {});
      return chatInstead(claim.active);
    }
    return NextResponse.json({ callId, session: null, busy: "capacidad", queueId: claim.queue_id, position: claim.position, pushToTalk });
  }
  const sessionId = claim.session_id;

  // 2. credentials for this session only (never cached): a WebRTC conversation token and, as the fallback the
  //    client uses if WebRTC cannot connect, a WebSocket signed URL. Both are requested in parallel.
  const key = AGENT_FOR_PURPOSE[call.purpose];
  const transport = pickTransport(process.env.VOICE_TRANSPORT, body.transport);
  let url: string | null = null;
  let token: string | null = null;
  try {
    const [u, t] = await Promise.all([
      signedUrl(key, diag),
      transport === "webrtc"
        ? conversationToken(key, diag).catch(async (e) => {
            await logEvent(sessionId, call.id, "elevenlabs", "token.error", { http: (e as { status?: number }).status ?? 0 });
            return null;
          })
        : Promise.resolve(null),
    ]);
    url = u;
    token = t;
  } catch (e) {
    const status = (e as { status?: number }).status ?? 0;
    await logEvent(sessionId, call.id, "elevenlabs", "url_firmada.error", { http: status });
    await updateSession(sessionId, "rechazada", { reason: `ElevenLabs ${status}` }).catch(() => {});
    log(`call=${callId} elevenlabs http=${status}`);
    // 429: ElevenLabs is at its concurrency limit → same answer as our own capacity limit
    if (status === 429) return NextResponse.json({ callId, session: null, busy: "capacidad", queueId: null, position: null });
    return NextResponse.json({ callId, session: null, reason: (e as Error).message });
  }
  if (!url) {
    await endSession(sessionId, "agentes no configurados", false);
    log(`call=${callId} sin_agentes -> 200 session=null`);
    return NextResponse.json({ callId, session: null, reason: "Los agentes de voz no están configurados" });
  }

  // 3. every dynamic variable present (neutral phrase when one is missing)
  const { vars, missing } = completeVariables(call.purpose, await callContext(call));
  if (missing.length) await logEvent(sessionId, call.id, "servidor", "variables.faltantes", { faltan: missing.join(",") });
  await updateSession(sessionId, "conectando", { agent: key });
  log(`call=${callId} purpose=${call.purpose} -> 200 ${token ? "token_webrtc+" : ""}url_firmada sesion=${sessionId.slice(0, 8)}${missing.length ? ` faltan=${missing.join(",")}` : ""}`);
  return NextResponse.json({
    callId,
    voiceSessionId: sessionId,
    pushToTalk,
    session: {
      signedUrl: url,
      ...(token ? { conversationToken: token } : {}),
      agent: key,
      dynamicVariables: { ...vars, call_id: String(call.id), token: toolToken(call.id) },
    },
  });
}
