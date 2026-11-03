import { DISCLAIMER } from "@/lib/labels";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface px-4 py-3 text-xs leading-relaxed text-muted sm:px-6">
      <p className="font-medium text-ink">{DISCLAIMER}</p>
      <p>
        Datos: «Citas médicas en el Hospital de Apoyo María Auxiliadora - [HMA]», Hospital de Apoyo María
        Auxiliadora, Plataforma Nacional de Datos Abiertos del Perú. Licencia Open Data Commons Attribution (ODC-BY).
      </p>
    </footer>
  );
}
