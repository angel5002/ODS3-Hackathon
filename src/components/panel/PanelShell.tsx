"use client";

import { Suspense, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRightLeft, CalendarCheck2, ClipboardCheck, LayoutDashboard, ListOrdered } from "lucide-react";
import { useStaffTick, useDemoState } from "@/lib/realtime";
import { PanelApp } from "./PanelApp";
import { WaitlistTab } from "./WaitlistTab";
import { ReassignTab } from "./ReassignTab";
import { ValidateTab } from "./ValidateTab";

const SECTIONS = [
  { id: "citas", label: "Citas", icon: CalendarCheck2 },
  { id: "espera", label: "Lista de espera", icon: ListOrdered },
  { id: "reasignar", label: "Por reasignar", icon: ArrowRightLeft },
  { id: "validar", label: "Por validar", icon: ClipboardCheck },
] as const;
type Section = (typeof SECTIONS)[number]["id"];

function Shell() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const section = (SECTIONS.find((s) => s.id === params.get("vista"))?.id ?? "citas") as Section;
  const state = useDemoState();
  // any open staff screen applies the demo clock rules (simulated replies, deadlines, offer windows)
  useStaffTick(Boolean(state?.clock_started_at) && section !== "citas");
  const go = useCallback((s: Section) => router.replace(`${path}?vista=${s}`, { scroll: false }), [router, path]);

  return (
    <div>
      <div className="mx-auto max-w-[1500px] px-4 pt-4 sm:px-6">
        <nav aria-label="Pestañas del panel" className="flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-surface p-1 ring-1 ring-line [scrollbar-width:none]">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => go(id)}
              aria-current={section === id ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-[background-color,color] duration-200 ${
                section === id ? "bg-brand text-white" : "text-muted hover:bg-sunken hover:text-ink"
              }`}
            >
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
          <Link prefetch={false} href="/tablero" className="flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-muted hover:bg-sunken hover:text-ink">
            <LayoutDashboard className="size-4" aria-hidden /> Tablero
          </Link>
        </nav>
      </div>
      {section === "citas" && <PanelApp onReassign={() => go("reasignar")} />}
      {section === "espera" && <WaitlistTab />}
      {section === "reasignar" && <ReassignTab />}
      {section === "validar" && <ValidateTab />}
    </div>
  );
}

export function PanelShell() {
  return (
    <Suspense>
      <Shell />
    </Suspense>
  );
}
