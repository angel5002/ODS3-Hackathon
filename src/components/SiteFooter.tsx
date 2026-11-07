import { DISCLAIMER } from "@/lib/labels";

/** Site footer (E5 stoic): ONE discreet line with the demo notice and the data source (ODC-BY attribution). */
export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <p className="mx-auto max-w-[1500px] text-pretty px-4 py-3 text-[13px] leading-snug text-muted sm:px-6">
        {DISCLAIMER} Fuente: Plataforma Nacional de Datos Abiertos del Perú (ODC-BY).
      </p>
    </footer>
  );
}
