"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Read-only client for the browser (publishable key). Writes always go through /api. */
export function browserDb() {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }
  return client;
}

/** PostgREST returns at most 1,000 rows per request; fetch in parallel pages. */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  total = 3000,
  page = 1000,
): Promise<T[]> {
  const ranges = [];
  for (let from = 0; from < total; from += page) ranges.push(build(from, from + page - 1));
  const results = await Promise.all(ranges);
  const out: T[] = [];
  for (const r of results) {
    if (r.error) throw new Error(r.error.message);
    out.push(...(r.data ?? []));
  }
  return out;
}
