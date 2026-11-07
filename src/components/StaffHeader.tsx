"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck2, Headset, LayoutDashboard, QrCode, Repeat, ShieldCheck } from "lucide-react";
import { ROLE_LABEL, type Role } from "@/lib/auth";
import { Brand } from "./Brand";

const NAV = [
  { href: "/panel", label: "Panel", icon: CalendarCheck2, roles: ["admision"] },
  { href: "/regulador", label: "Regulador", icon: ShieldCheck, roles: ["admision", "regulador"] },
  { href: "/callcenter", label: "Llamadas", icon: Headset, roles: ["admision", "callcenter"] },
  { href: "/tablero", label: "Tablero", icon: LayoutDashboard, roles: ["admision"] },
  { href: "/demo", label: "Demo", icon: QrCode, roles: ["admision"] },
];

export function StaffHeader({ role }: { role: Role | null }) {
  const path = usePathname();
  const items = NAV.filter((n) => role && n.roles.includes(role));
  return (
    <header className="border-b border-line bg-surface/90">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:px-6">
        <Brand />
        {items.length > 0 && (
          <nav aria-label="Secciones" className="order-last flex w-full max-w-full gap-0.5 overflow-x-auto [scrollbar-width:none] md:order-none md:ml-auto md:w-auto">
            {items.map(({ href, label, icon: Icon }) => {
              const active = path?.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  prefetch={false}
                  aria-current={active ? "page" : undefined}
                  // on a phone only the icon shows: the name goes to screen readers and the tooltip
                  aria-label={label}
                  title={label}
                  className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-[15px] font-semibold transition-colors duration-150 ${
                    active ? "bg-sunken text-ink shadow-[inset_0_-2px_0_var(--color-accent)]" : "text-muted hover:bg-sunken hover:text-ink"
                  }`}
                >
                  <Icon className="size-[18px]" aria-hidden />
                  <span className="hidden md:inline">{label}</span>
                </Link>
              );
            })}
          </nav>
        )}
        {role && (
          <a
            href="/acceso?cambiar=1"
            className="press ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-4 text-sm font-semibold text-ink hover:bg-sunken md:ml-0"
            title="Cambiar de rol"
          >
            {/* "Rol:" so it does not read as a second copy of the section tab next to it */}
            <Repeat className="size-4" aria-hidden /> Rol: {ROLE_LABEL[role]}
          </a>
        )}
      </div>
    </header>
  );
}
