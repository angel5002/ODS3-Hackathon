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
