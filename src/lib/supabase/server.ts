import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Server-only client with the secret key. Never import from a client component. */
export function serverDb() {
  if (typeof window !== "undefined") throw new Error("serverDb is server-only");
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
  }
  return client;
}

export async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await serverDb().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/**
 * Sends a Realtime hint straight from the server (REST broadcast). Used after bulk
 * actions: their in-transaction hint travels through the WAL with thousands of rows
 * and can arrive seconds late. Clients just refetch, so a duplicate hint is harmless.
 */
export async function broadcast(kind: "bulk" | "full") {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ topic: "demo", event: "change", payload: { kind, appts: [], patients: [] }, private: false }],
      }),
    });
  } catch {
    // the in-database hint and the clients' reconnect refresh still cover it
  }
}
