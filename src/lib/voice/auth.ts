// Who may act on a call: the simulated phone that receives it (token) or the chat session (signed cookie)
// that receives it, directly or through a persona it is linked to.
import { readCookie } from "@/lib/chat/session";
import { serverDb } from "@/lib/supabase/server";

export async function ownsCall(req: Request, call: { patient_id: string | null; chat_session_id: string | null }, token: unknown) {
  if (token && call.patient_id) {
    const { data } = await serverDb().from("patients").select("id").eq("token", String(token)).maybeSingle();
    if (data?.id === call.patient_id) return true;
  }
  const session = readCookie(req);
  if (!session) return false;
  if (call.chat_session_id === session) return true;
  if (call.patient_id) {
    const { data } = await serverDb().from("chat_sessions").select("linked_patient_id").eq("id", session).maybeSingle();
    return data?.linked_patient_id === call.patient_id;
  }
  return false;
}
