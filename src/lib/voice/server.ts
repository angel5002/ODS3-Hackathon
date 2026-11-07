// Server side of the ElevenLabs agents: agent registry, per-call tool tokens, signed URLs.
// The API key and the tool secret never leave the server.
import { createHmac, timingSafeEqual } from "node:crypto";
import agents from "../../../voice/agents.lock.json";

export type AgentKey = "asistia-confirmacion" | "asistia-oferta" | "asistia-validacion" | "asistia-registro";
export const AGENT_FOR_PURPOSE: Record<string, AgentKey> = {
  confirmacion: "asistia-confirmacion",
  oferta: "asistia-oferta",
  validacion: "asistia-validacion",
  registro: "asistia-registro",
  prueba: "asistia-confirmacion",
};

export function agentId(key: AgentKey): string | null {
  return (agents as Record<string, { agent_id?: string }>)[key]?.agent_id ?? null;
}

/** Per-call token the agent sends back with every tool call (dynamic variable `token`). */
export function toolToken(callId: number) {
  const secret = process.env.ELEVENLABS_TOOL_SECRET;
  if (!secret) throw new Error("ELEVENLABS_TOOL_SECRET missing");
  return createHmac("sha256", secret).update(`call:${callId}`).digest("base64url").slice(0, 32);
}

export function sameSecret(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function signedUrl(key: AgentKey, diag = "-") {
  const id = agentId(key);
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!id || !apiKey) return null;
  const t = Date.now();
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(id)}`, {
    headers: { "xi-api-key": apiKey },
    cache: "no-store",
  });
  // diagnostics (E5, hito 1): ElevenLabs status code and latency, never the URL or the key
  console.info(`[voz ${diag}] servidor elevenlabs.signed_url agent=${key} http=${res.status} ms=${Date.now() - t}`);
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
    console.warn(`[voz ${diag}] servidor elevenlabs.signed_url_error http=${res.status} ${detail}`);
    throw Object.assign(new Error(`ElevenLabs ${res.status}`), { status: res.status, detail });
  }
  const data = (await res.json()) as { signed_url?: string };
  return data.signed_url ?? null;
}

/** ElevenLabs post-call webhook signature: header "t=<unix>,v0=<hex>", HMAC-SHA256 of `${t}.${body}`. */
export function verifyWebhook(raw: string, header: string | null, secret: string | undefined, toleranceSec = 30 * 60) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Date.now() / 1000 - t > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${raw}`).digest("hex");
  return sameSecret(expected, parts.v0);
}
