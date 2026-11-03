"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { browserDb } from "./supabase/browser";
import { isBroad, type DemoState, type Hint } from "./types";
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
    .on("broadcast", { event: "change" }, ({ payload }) => {
      console.debug("[tiempo real] aviso", (payload as Hint).kind);
      emit(payload as Hint);
    })
    .subscribe((status) => {
      console.debug("[tiempo real]", status);
      if (status === "SUBSCRIBED") {
        // first join included: a change may have happened between the initial fetch and the join
        emit({ kind: subscribedOnce ? "full" : "bulk", appts: [], patients: [] });
        subscribedOnce = true;
      }
    });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") emit({ kind: "full", appts: [], patients: [] });
  });
  // Safety net: bulk actions bump demo_state.version. If their Realtime hint is late
  // (a big transaction can delay it several seconds), this tiny poll catches it.
  let version: number | null = null;
  setInterval(async () => {
    if (document.visibilityState !== "visible") return;
    const { data } = await browserDb().from("demo_state").select("version").eq("id", 1).maybeSingle();
    if (data == null) return;
    if (version != null && data.version !== version) {
      console.debug("[tiempo real] versión nueva por consulta");
      emit({ kind: "bulk", appts: [], patients: [] });
    }
    version = data.version;
  }, 2000);
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
    if (isBroad(h)) load.current();
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

/**
 * Wraps a loader so that at most one run is in flight; calls that arrive meanwhile
 * collapse into a single follow-up run. Keeps bursts of hints from piling up requests.
 */
export function singleFlight(fn: () => Promise<void>) {
  let running = false;
  let again = false;
  const run = async (): Promise<void> => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      await fn();
    } finally {
      running = false;
      if (again) {
        again = false;
        void run();
      }
    }
  };
  return run;
}

/** Hook form of singleFlight; always runs the latest version of `fn`. */
export function useSingleFlight(fn: () => Promise<void>) {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  const flight = useRef<(() => Promise<void>) | null>(null);
  return useCallback(() => {
    flight.current ??= singleFlight(() => fnRef.current());
    return flight.current();
  }, []);
}
