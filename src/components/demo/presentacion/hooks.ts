"use client";

// /demo presentation mode: the jury read (with its fixture fallback) and the scene clock.
import { useCallback, useEffect, useRef, useState } from "react";
import { useHints } from "@/lib/realtime";
import type { JuryOverview } from "@/lib/demo/contract";
import { juryFixture } from "./fixtures";

export type JurySource = "en_vivo" | "ejemplo" | "cargando";

/**
 * GET /api/staff/data?view=jurado (track E). While that view does not exist (any 4xx) the screens use the fixture
 * and say "Datos de ejemplo"; the probe is not repeated, so the console gets at most one failed request.
 * Live: reloads on every Realtime hint and every 3 s while the tab is visible.
 */
export function useJuryOverview(active: boolean): { data: JuryOverview | null; source: JurySource } {
  const [data, setData] = useState<JuryOverview | null>(null);
  const [source, setSource] = useState<JurySource>("cargando");
  const missing = useRef(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (missing.current || inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/staff/data?view=jurado", { cache: "no-store" });
      if (res.status >= 400 && res.status < 500) {
        missing.current = true;
        setData(juryFixture(Date.now()));
        setSource("ejemplo");
        return;
      }
      if (!res.ok) return; // 5xx: keep what is on screen, the next poll retries
      const json = (await res.json()) as JuryOverview;
      if (!Array.isArray(json?.cards) || !Array.isArray(json?.activity)) {
        missing.current = true;
        setData(juryFixture(Date.now()));
        setSource("ejemplo");
        return;
      }
      setData(json);
      setSource("en_vivo");
    } catch {
      // network hiccup: the next poll retries
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const first = setTimeout(load, 0);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 3000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active, load]);

  useHints(() => {
    if (active) load();
  });

  return { data, source };
}

/**
 * A scene clock: `elapsed` ms since the moment opened and how many `cues` have passed. `next()` jumps to the next cue
 * (Space on the projector laptop, when the actors are ahead of the clock). The moment is keyed by its run, so pressing
 * its number again remounts it and the clock starts over.
 */
export function useCues(cues: readonly number[]) {
  const start = useRef(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    start.current = performance.now();
    const last = cues.at(-1) ?? 0;
    const id = setInterval(() => {
      const e = performance.now() - start.current;
      setElapsed(e);
      if (e > last + 1000) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  }, [cues]);

  const next = useCallback(() => {
    const e = performance.now() - start.current;
    const cue = cues.find((c) => c > e + 1);
    if (cue == null) return;
    start.current -= cue - e;
    setElapsed(cue);
  }, [cues]);

  const passed = cues.filter((c) => elapsed >= c).length;
  return { elapsed, passed, next };
}
