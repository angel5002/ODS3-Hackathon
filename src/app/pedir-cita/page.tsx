import type { Metadata, Viewport } from "next";
import { PedirCita } from "@/components/chat/PedirCita";

export const metadata: Metadata = {
  title: "Pedir una cita · AsistIA",
  description: "Demostración: pida una cita por chat, por llamada en el navegador o con un formulario. Sin instalar nada y sin dar su número.",
};
export const viewport: Viewport = { themeColor: "#ffffff" };

export default function PedirCitaPage() {
  return <PedirCita />;
}
