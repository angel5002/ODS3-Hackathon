import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Pantallas } from "./Pantallas";
import { PANTALLAS, type Pantalla } from "./screens";

// Development-only page: the presentational pieces of /pedir-cita, the chat, the simulated phone and /demo
// with static fictitious props. No database, no server calls, no environment variables. Not in production.
export const metadata: Metadata = { title: "Pantallas (desarrollo)", robots: { index: false, follow: false } };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const qr = (url: string) => QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#16212c", light: "#ffffff" } });

export default async function DevScreensPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const p = one((await searchParams).p);
  const screen: Pantalla = PANTALLAS.includes(p as Pantalla) ? (p as Pantalla) : "inicio";
  const origin = "https://asistia.example";
  const tokens = ["rosa", "valeria", "carmen", "julio", "ana"];
  const qrs = Object.fromEntries(await Promise.all([...tokens.map(async (t) => [t, await qr(`${origin}/t/${t}`)] as const), ["pedir", await qr(`${origin}/pedir-cita`)] as const]));
  return <Pantallas screen={screen} origin={origin} qrs={qrs} />;
}
