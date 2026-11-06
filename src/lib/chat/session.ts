// Anonymous chat sessions (RF-13): no phone, no e-mail. The browser only holds a signed, httpOnly
// cookie with the session id; a tampered or foreign cookie fails the HMAC check and gets 401.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { serverDb } from "@/lib/supabase/server";

export const CHAT_COOKIE = "asistia_chat";
const MAX_AGE = 60 * 60 * 24; // sessions live 24 h at most

function secret() {
  const s = process.env.CHAT_SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("CHAT_SESSION_SECRET missing");
  return s;
}

export function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function cookieValue(sessionId: string) {
  return `${sessionId}.${sign(sessionId)}`;
}

export function verifyCookie(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const i = raw.lastIndexOf(".");
  if (i < 1) return null;
  const id = raw.slice(0, i);
  const sig = Buffer.from(raw.slice(i + 1));
  const expected = Buffer.from(sign(id));
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  return /^[0-9a-f-]{36}$/.test(id) ? id : null;
}

export function readCookie(req: Request) {
  const m = new RegExp(`(?:^|;\s*)${CHAT_COOKIE}=([^;]+)`).exec(req.headers.get("cookie") ?? "");
  return verifyCookie(m ? decodeURIComponent(m[1]) : null);
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE,
};

const ALIASES = ["Colibrí", "Cóndor", "Vicuña", "Alpaca", "Picaflor", "Zorzal", "Gaviota", "Pelícano", "Tucán", "Jaguar", "Puma", "Oso andino"];

export async function createSession() {
  const alias = `${ALIASES[randomBytes(1)[0] % ALIASES.length]} ${100 + (randomBytes(1)[0] % 900)}`;
  const topic = `chat-${randomBytes(12).toString("hex")}`;
  const { data, error } = await serverDb().from("chat_sessions").insert({ alias, topic }).select("id,alias,topic").single();
  if (error || !data) throw new Error(error?.message ?? "session");
  await serverDb().from("conversations").insert({ session_id: data.id });
  return data as { id: string; alias: string; topic: string };
}

export async function loadSession(id: string) {
  const { data } = await serverDb()
    .from("chat_sessions")
    .select("id,alias,topic,consent_at,linked_patient_id,linked_request_id,bot,expires_at,sound_ready")
    .eq("id", id)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return data as null | {
    id: string;
    alias: string;
    topic: string;
    consent_at: string | null;
    linked_patient_id: string | null;
    linked_request_id: number | null;
    bot: Record<string, unknown>;
    expires_at: string;
    sound_ready: boolean;
  };
}
