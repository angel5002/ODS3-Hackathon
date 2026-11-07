import type { Metadata, Viewport } from "next";
import { PreconsultaStart } from "@/components/preconsulta/PreconsultaStart";

export const metadata: Metadata = {
  title: "Preconsulta · AsistIA",
  description: "Demostración: tres preguntas cortas antes de su cita para preparar la consulta. No es una consulta médica.",
};
export const viewport: Viewport = { themeColor: "#ffffff" };

export default function PreconsultaStartPage() {
  return <PreconsultaStart />;
}
