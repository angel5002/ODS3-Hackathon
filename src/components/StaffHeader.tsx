"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck2, LayoutDashboard, QrCode } from "lucide-react";
import { Brand } from "./Brand";

const NAV = [
  { href: "/panel", label: "Citas", icon: CalendarCheck2 },
  { href: "/tablero", label: "Tablero", icon: LayoutDashboard },
  { href: "/demo", label: "Demo", icon: QrCode },
];

export function StaffHeader() {
  const path = usePathname();
  return (
    <header className="border-b border-line/70 bg-surface">
      <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-3 sm:px-6">
        <Brand />
        <nav aria-label="Secciones" className="ml-auto flex rounded-full bg-sunken p-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = path?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 ${
                  active ? "bg-surface text-brand shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                <Icon className="size-4" aria-hidden />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
