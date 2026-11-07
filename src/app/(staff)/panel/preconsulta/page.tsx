import type { Metadata } from "next";
import { PreconsultaDesk } from "@/components/preconsulta/DoctorLive";

export const metadata: Metadata = { title: "Preconsulta · vista del médico · AsistIA" };

// Staff only (src/proxy.ts matches /panel/*): create a pre-visit link and follow its summary live.
export default function PreconsultaStaffPage() {
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-8">
      <h1 className="text-[24px] font-bold">Preconsulta · vista del médico</h1>
      <p className="mt-1 max-w-[70ch] text-muted">
        El resumen ordena lo que el paciente refiere: no diagnostica ni sugiere exámenes. Los datos ausentes se muestran como «no informado».
      </p>
      <PreconsultaDesk className="mt-5" />
    </main>
  );
}
