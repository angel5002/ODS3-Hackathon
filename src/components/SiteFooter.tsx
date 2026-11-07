import Link from "next/link";
import { DISCLAIMER } from "@/lib/labels";
import { Brand } from "./Brand";

const LINKS = [
  { href: "/pedir-cita", label: "Pedir una cita" },
  { href: "/panel", label: "Panel de citas" },
  { href: "/tablero", label: "Tablero" },
  { href: "/demo", label: "Demo y códigos QR" },
];

const linkCls = "inline-flex min-h-11 items-center text-brand underline decoration-1 underline-offset-4 hover:text-brand-hover hover:decoration-2";

/** Site footer: links, the data source and the one demo notice line of the page. */
export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface text-[15px] text-muted">
      <div className="mx-auto grid max-w-[1200px] gap-6 px-4 py-8 sm:px-8 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <Brand />
          <p className="mt-2 max-w-[34ch] leading-relaxed">Recupera las citas que se pierden y se las da a quien espera.</p>
          <p className="mt-2 text-sm">CientíficaHack 2026 · Desafío 4 · ODS 3</p>
        </div>
        <nav aria-label="Explorar AsistIA">
          <h2 className="font-semibold text-ink">Explorar AsistIA</h2>
          <ul className="mt-1">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link prefetch={false} href={l.href} className={linkCls}>
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <a href="https://github.com/angel5002/ODS3-Hackathon" className={linkCls}>
                Código del proyecto
              </a>
            </li>
          </ul>
        </nav>
        <div className="text-sm leading-relaxed">
          <h2 className="text-[15px] font-semibold text-ink">Datos</h2>
          <p className="mt-2">
            «Citas médicas en el Hospital de Apoyo María Auxiliadora - [HMA]», Plataforma Nacional de Datos Abiertos del
            Perú. Licencia Open Data Commons Attribution (ODC-BY).
          </p>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-[1200px] px-4 py-3 text-sm leading-snug sm:px-8">{DISCLAIMER}</p>
      </div>
    </footer>
  );
}
