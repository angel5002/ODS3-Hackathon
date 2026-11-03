"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock } from "lucide-react";
import { APP_NAME, demoNowMin, fmtMin } from "@/lib/labels";
import { useDemoState, useNow } from "@/lib/realtime";

const NAV = [
  { href: "/panel", label: "Panel de citas" },
  { href: "/tablero", label: "Tablero" },
  { href: "/demo", label: "Demo y códigos QR" },
];

export function StaffHeader() {
  const path = usePathname();
  const state = useDemoState();
  const now = useNow(1000);
  const running = Boolean(state?.clock_started_at);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6">
        <Link href="/" className="mr-2 flex flex-col leading-tight">
          <span className="text-[15px] font-bold tracking-tight text-brand">{APP_NAME}</span>
          <span className="text-xs text-muted">Consulta externa · Hospital María Auxiliadora</span>
        </Link>
        <nav aria-label="Secciones" className="flex flex-wrap gap-1">
          {NAV.map((n) => {
            const active = path?.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  active ? "bg-brand-soft text-brand" : "text-muted hover:bg-sunken hover:text-ink"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm" aria-live="off">
          <Clock className="size-4 text-muted" aria-hidden />
          <span className="text-muted">Hora de la demo</span>
          <span className="font-semibold tabular-nums">{state ? fmtMin(demoNowMin(state, now)) : "--:--"}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs ${running ? "bg-st-ok-soft text-st-ok" : "bg-st-neutral-soft text-muted"}`}>
            {running ? "en marcha" : "detenido"}
          </span>
          {state?.day_label && <span className="hidden text-muted lg:inline">· citas de mañana, {state.day_label} de 2023</span>}
        </div>
      </div>
    </header>
  );
}
