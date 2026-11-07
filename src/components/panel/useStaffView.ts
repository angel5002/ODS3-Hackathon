"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getJson } from "@/lib/post";
import { useHints, useSingleFlight } from "@/lib/realtime";
import type { Hint } from "@/lib/types";

/**
 * Loads one server view (/api/staff/data?view=... or another GET route) and reloads it when a
 * Realtime hint of the given kinds arrives. Bursts of hints collapse into one request.
 */
export function useServerView<T>(url: string, kinds: Hint["kind"][] = ["full", "bulk"]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const load = useSingleFlight(async () => {
    try {
      setData(await getJson<T>(url));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  });
  useEffect(() => {
    load();
  }, [load, url]);
  const kindsKey = kinds.join(",");
  useHints(
    useCallback(
      (h: Hint) => {
        if (!kindsKey.split(",").includes(h.kind)) return;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(load, 200);
      },
      [kindsKey, load],
    ),
  );
  return { data, error, reload: load };
}
