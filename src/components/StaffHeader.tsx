"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck2, Headset, LayoutDashboard, QrCode, Repeat, ShieldCheck } from "lucide-react";
import { ROLE_LABEL, type Role } from "@/lib/auth";
import { Brand } from "./Brand";

const NAV = [
  { href: "/panel", label: "Panel", icon: CalendarCheck2, roles: ["admision"] },
  { href: "/regulador", label: "Regulador", icon: ShieldCheck, roles: ["admision", "regulador"] },
  { href: "/callcenter", label: "Call center", icon: Headset, roles: ["admision", "callcenter"] },
  { href: "/tablero", label: "Tablero", icon: LayoutDashboard, roles: ["admision"] },
  { href: "/demo", label: "Demo", icon: QrCode, roles: ["admision"] },
];

export function StaffHeader({ role }: { role: Role | null }) {
  const path = usePathname();
  const items = NAV.filter((n) => role && n.roles.includes(role));
  return (
    <header className="border-b border-line/70 bg-surface">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <Brand />
        {items.length > 0 && (
          <nav aria-label="Secciones" className="ml-auto flex max-w-full overflow-x-auto rounded-full bg-sunken p-1 [scrollbar-width:none]">
            {items.map(({ href, label, icon: Icon }) => {
              const active = path?.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  prefetch={false}
                  aria-current={active ? "page" : undefined}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 ${
                    active ? "bg-surface text-brand shadow-sm" : "text-muted hover:text-ink"
                  }`}
                >
                  <Icon className="size-4" aria-hidden />
                  <span className="hidden md:inline">{label}</span>
                </Link>
              );
            })}
          </nav>
        )}
        {role && (
          <a
            href="/acceso?cambiar=1"
            className="press inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink"
            title="Cambiar de rol"
          >
            <Repeat className="size-3.5" aria-hidden /> {ROLE_LABEL[role]}
          </a>
        )}
      </div>
    </header>
  );
}
