import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CallPlayground } from "./CallPlayground";
import { PLAYGROUND_STATES, type PlaygroundState } from "./states";

// Development-only page: the call screen with simulated audio and every state. No database, no voice
// provider, no environment variables. It does not exist in production builds.
export const metadata: Metadata = { title: "Llamada (desarrollo)", robots: { index: false, follow: false } };

type Search = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function DevCallPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const estado = one(sp.estado);
  const initial: PlaygroundState = PLAYGROUND_STATES.some((s) => s.id === estado) ? (estado as PlaygroundState) : "activa-auto";
  return (
    <CallPlayground
      initial={initial}
      frame={one(sp.marco) === "telefono" ? "telefono" : one(sp.marco) === "pedir" ? "pedir" : "pantalla"}
      panel={one(sp.panel) !== "0"}
      captions={one(sp.subtitulos) !== "0"}
      muted={one(sp.silencio) === "1"}
    />
  );
}
