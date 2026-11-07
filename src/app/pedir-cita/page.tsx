import type { Metadata, Viewport } from "next";
import { PedirCita } from "@/components/chat/PedirCita";

export const metadata: Metadata = {
  title: "Pedir una cita · AsistIA",
  description: "Demostración: pida una cita por chat, por llamada en el navegador o con un formulario. Sin instalar nada y sin dar su número.",
};
export const viewport: Viewport = { themeColor: "#ffffff" };

type Search = Record<string, string | string[] | undefined>;

// E5 final: /pedir-cita?canal=chat is the QR shown to the audience on the big screen. It enters only by chat
// (no voice: the voice lines are kept for the jury's cards) and opens the conversation directly.
export default async function PedirCitaPage({ searchParams }: { searchParams: Promise<Search> }) {
  const canal = (await searchParams).canal;
  if ((Array.isArray(canal) ? canal[0] : canal) === "chat") return <PedirCita channels={["chat"]} start="chat" />;
  return <PedirCita />;
}
