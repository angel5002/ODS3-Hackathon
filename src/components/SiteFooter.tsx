import Link from "next/link";
import { FolderGit2, Info } from "lucide-react";
import { DISCLAIMER } from "@/lib/labels";
import { Brand } from "./Brand";

export function SiteFooter() {
  return (
    <footer className="bg-night text-white/70">
      <div className="mx-auto grid max-w-[1200px] gap-8 px-5 py-10 sm:px-8 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <Brand tone="light" />
          <p className="mt-3 max-w-[34ch] text-sm leading-relaxed">
            Recupera las citas que se pierden y se las da a quien espera.
          </p>
          <p className="mt-4 text-xs text-white/50">CientíficaHack 2026 · Desafío 4 · ODS 3</p>
        </div>
        <div className="text-sm">
          <p className="font-semibold text-white">Explorar AsistIA</p>
          <ul className="mt-3 space-y-2">
            <li>
              <Link prefetch={false} href="/pedir-cita" className="hover:text-white">Pedir una cita</Link>
            </li>
            <li>
              <Link prefetch={false} href="/panel" className="hover:text-white">Panel de citas</Link>
            </li>
            <li>
              <Link prefetch={false} href="/tablero" className="hover:text-white">Tablero</Link>
            </li>
            <li>
              <Link prefetch={false} href="/demo" className="hover:text-white">Demo y códigos QR</Link>
            </li>
            <li>
              <a href="https://github.com/angel5002/ODS3-Hackathon" className="inline-flex items-center gap-1.5 hover:text-white">
                <FolderGit2 className="size-4" aria-hidden /> Código del proyecto
              </a>
            </li>
          </ul>
        </div>
        <div className="text-xs leading-relaxed">
          <p className="flex items-start gap-2 rounded-lg bg-white/5 p-3 text-white/85">
            <Info className="mt-0.5 size-4 shrink-0 text-mint" aria-hidden />
            {DISCLAIMER}
          </p>
          <p className="mt-3">
            Datos: «Citas médicas en el Hospital de Apoyo María Auxiliadora - [HMA]», Plataforma Nacional de Datos
            Abiertos del Perú. Licencia Open Data Commons Attribution (ODC-BY).
          </p>
        </div>
      </div>
    </footer>
  );
}
