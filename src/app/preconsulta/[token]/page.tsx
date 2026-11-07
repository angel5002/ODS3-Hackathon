import type { Metadata, Viewport } from "next";
import { PreconsultaChat } from "@/components/preconsulta/PreconsultaChat";

export const metadata: Metadata = { title: "Preconsulta · AsistIA", robots: { index: false } };
export const viewport: Viewport = { themeColor: "#ffffff" };

export default async function PreconsultaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PreconsultaChat token={token} />;
}
