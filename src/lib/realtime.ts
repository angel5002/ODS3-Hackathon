"use client";

import { useEffect, useRef, useState } from "react";
import { browserDb } from "./supabase/browser";
import type { DemoState, Hint } from "./types";
import { post } from "./post";

// One Realtime subscription per tab, shared by every component. The database
// broadcasts a small hint per action ("appointment 12 changed", "bulk"); each
// screen refetches what it shows. A reconnect or a tab coming back to the
// foreground counts as "bulk" so nothing is missed.
type Listener = (h: Hint) => void;
const listeners = new Set<Listener>();
let started = false;

function emit(h: Hint) {
  for (const l of listeners) l(h);
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  let subscribedOnce = false;
  browserDb()
    .channel("demo")
    .on("broadcast", { event: "change" }, ({ payload }) => emit(payload as Hint))
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (subscribedOnce) emit({ kind: "bulk", appts: [], patients: [] });
        subscribedOnce = true;
      }
    });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") emit({ kind: "bulk", appts: [], patients: [] });
  });
}

export function useHints(onHint: Listener) {
  const ref = useRef(onHint);
  useEffect(() => {
    ref.current = onHint;
  });
  useEffect(() => {
    start();
    const l: Listener = (h) => ref.current(h);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
}

export function useDemoState() {
  const [state, setState] = useState<DemoState | null>(null);
  const load = useRef(async () => {
    const { data } = await browserDb().from("demo_state").select("*").eq("id", 1).single<DemoState>();
    if (data) setState(data);
  });
  useEffect(() => {
    load.current();
  }, []);
  useHints((h) => {
    if (h.kind === "bulk") load.current();
  });
  return state;
}

/** Re-render every `ms` (for the demo clock and countdowns). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Staff screens advance the demo clock rules (no-reply deadlines, simulated replies, offer expiry). */
export function useStaffTick(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let busy = false;
    const id = setInterval(async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        await post("/api/staff", { action: "tick" });
      } catch {
        // next tick retries
      } finally {
        busy = false;
      }
    }, 3000);
    return () => clearInterval(id);
  }, [active]);
}
